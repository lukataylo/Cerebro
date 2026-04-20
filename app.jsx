/* global React, ReactDOM, AdminScreen, BrokerScreen, QuoteDrawer */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "adminLayout": "diagram",
  "brokerLayout": "split",
  "liveFeed": true,
  "density": "comfortable"
}/*EDITMODE-END*/;

const STORAGE_KEY = 'cerebro.state.v1';

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return s || {};
  } catch { return {}; }
}
function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

function App() {
  const stored = useMemo(loadState, []);
  const [role, setRole] = useState(stored.role || 'admin');
  const [adminTab, setAdminTab] = useState(stored.adminTab || 'triage'); // 'triage' | 'flow' | 'rules' | 'audit'
  const [quotes, setQuotes] = useState(window.SEED_QUOTES);
  const [selected, setSelected] = useState(null);
  const [newQuoteIds, setNewQuoteIds] = useState(new Set());
  const [particles, setParticles] = useState([]);
  const [firingRule, setFiringRule] = useState(null);
  const [activityLog, setActivityLog] = useState([
    { id: 1, time: '09:42', text: 'Cerebro started. Listening on <b>triage@howden.com</b>' },
  ]);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [tweaks, setTweaks] = useState({ ...TWEAK_DEFAULTS, ...(stored.tweaks || {}) });

  // Persist
  useEffect(() => {
    saveState({ role, tweaks, adminTab });
  }, [role, tweaks, adminTab]);

  // --- Tweaks / edit-mode bridge ---
  useEffect(() => {
    const handle = (e) => {
      const t = e.data?.type;
      if (t === '__activate_edit_mode') setTweaksOpen(true);
      if (t === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', handle);
    try { window.parent.postMessage({ type: '__edit_mode_available' }, '*'); } catch {}
    return () => window.removeEventListener('message', handle);
  }, []);

  const setTweak = useCallback((k, v) => {
    setTweaks(prev => {
      const next = { ...prev, [k]: v };
      try { window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [k]: v } }, '*'); } catch {}
      return next;
    });
  }, []);

  // --- Live feed simulation ---
  useEffect(() => {
    if (!tweaks.liveFeed) return;
    let seq = 100;
    const iv = setInterval(() => {
      seq += 1;
      const q = window.makeQuote(seq, { minsAgo: 0, state: 'classified' });
      setQuotes(prev => [q, ...prev].slice(0, 60).map((it, i) => i === 0 ? it : { ...it, minsAgo: it.minsAgo + 1 }));
      setNewQuoteIds(prev => {
        const n = new Set(prev); n.add(q.id);
        setTimeout(() => setNewQuoteIds(cur => { const x = new Set(cur); x.delete(q.id); return x; }), 2000);
        return n;
      });
      setFiringRule(q.ruleId);
      setTimeout(() => setFiringRule(null), 1100);

      const now = new Date();
      const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setActivityLog(log => [
        { id: Date.now(), time: t, text: `Routed <b>${q.assured}</b> (${q.cls}, ${q.bucket.label}) → <b>${window.DESTINATIONS[q.destId].label}</b>` },
        ...log,
      ].slice(0, 10));

      // Particle animation: from bucket → cerebro → destination
      const bucketY = q.bucket.bucket === 'large' ? 12 : q.bucket.bucket === 'medium' ? 30 : 60;
      const pid = 'p-' + q.id;
      setParticles(ps => [...ps, { id: pid, x: 16, y: bucketY, opacity: 1, color: window.DESTINATIONS[q.destId].color }]);
      setTimeout(() => setParticles(ps => ps.map(p => p.id === pid ? { ...p, x: 45, y: 45 } : p)), 50);
      setTimeout(() => {
        const destYmap = { ppl: 12, xtrade_om: 28, xtrade_sf: 44, hat: 60, gxb: 76, acturis: 92, review: 50 };
        setParticles(ps => ps.map(p => p.id === pid ? { ...p, x: 80, y: destYmap[q.destId] || 50 } : p));
      }, 1500);
      setTimeout(() => setParticles(ps => ps.map(p => p.id === pid ? { ...p, opacity: 0 } : p)), 2900);
      setTimeout(() => setParticles(ps => ps.filter(p => p.id !== pid)), 3400);
    }, 3200);
    return () => clearInterval(iv);
  }, [tweaks.liveFeed]);

  const handleReroute = useCallback((qid, newDest) => {
    setQuotes(prev => prev.map(q => q.id === qid ? { ...q, destId: newDest, state: 'forwarded', minsAgo: 0 } : q));
    const q = quotes.find(x => x.id === qid);
    if (q) {
      const now = new Date();
      const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setActivityLog(log => [
        { id: Date.now(), time: t, text: `<b style="color:var(--cobalt)">Manual override</b> · ${q.assured} → <b>${window.DESTINATIONS[newDest].label}</b>` },
        ...log,
      ].slice(0, 10));
    }
    setSelected(s => s && s.id === qid ? { ...s, destId: newDest, state: 'forwarded' } : s);
  }, [quotes]);

  return (
    <div id="app" data-screen-label={role === 'admin' ? '01 Admin' : '02 Broker'}>
      {/* Header */}
      <header className="app-header">
        <div className="logo-wrap">
          <span className="logo-mark">Cerebro</span>
          <span className="logo-from">
            <span className="f">from</span><span className="h">HOWDEN</span>
          </span>
        </div>
        <div className="role-switch" role="tablist">
          <button className={role === 'admin' ? 'active' : ''} onClick={() => setRole('admin')} role="tab">Admin</button>
          <button className={role === 'broker' ? 'active' : ''} onClick={() => setRole('broker')} role="tab">Broker</button>
        </div>
        <nav className="nav">
          {role === 'admin' ? (
            <>
              <a href="#" className={adminTab === 'triage' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setAdminTab('triage'); }}>Triage</a>
              <a href="#" className={adminTab === 'flow' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setAdminTab('flow'); }}>Routing flow</a>
              <a href="#" className={adminTab === 'rules' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setAdminTab('rules'); }}>Rules</a>
              <a href="#" className={adminTab === 'audit' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setAdminTab('audit'); }}>Audit</a>
            </>
          ) : (
            <>
              <a href="#" className="active">My risks</a>
              <a href="#">Bookings</a>
              <a href="#">xTrade</a>
              <a href="#">Reports</a>
            </>
          )}
        </nav>
        <div className="spacer" />
        <div className="hdr-search">
          <span className="material-symbols-outlined">search</span>
          Search assured, reference, broker…
        </div>
        <div className="icon-btn" title="Notifications">
          <span className="material-symbols-outlined">notifications</span>
          <span className="dot-badge" />
        </div>
        <div className="icon-btn" title="Help">
          <span className="material-symbols-outlined">help</span>
        </div>
        <div className="avatar">{role === 'admin' ? 'OA' : 'SK'}</div>
      </header>

      {/* Sub header */}
      <div className="sub-header">
        <div className="page-title">
          <span className="material-symbols-outlined">
            {role === 'broker' ? 'inventory_2' :
              adminTab === 'flow' ? 'account_tree' :
              adminTab === 'rules' ? 'rule' :
              adminTab === 'audit' ? 'history' : 'dashboard'}
          </span>
          {role === 'broker' ? 'Post-triage workbench' :
            adminTab === 'flow' ? 'Routing flow' :
            adminTab === 'rules' ? 'Rules engine' :
            adminTab === 'audit' ? 'Audit trail' : 'Triage console'}
        </div>
        <div className="crumb">
          {role === 'admin' ? 'Operations' : 'Broker'} <span className="sep">/</span>
          <b>{role === 'broker' ? 'My risks' :
            adminTab === 'flow' ? 'Routing flow' :
            adminTab === 'rules' ? 'Rules' :
            adminTab === 'audit' ? 'Audit' : 'Triage'}</b>
        </div>
        <div className="spacer" />
        {role === 'admin' && (
          <>
            <span className="mono-label">
              <span className="material-symbols-outlined" style={{ fontSize: 12, verticalAlign: '-2px', color: tweaks.liveFeed ? 'var(--status-positive)' : 'var(--fg-muted)' }}>fiber_manual_record</span>
              {tweaks.liveFeed ? ' LIVE · 3.2s polling' : ' PAUSED'}
            </span>
            <button className="btn grey sm" onClick={() => setTweak('liveFeed', !tweaks.liveFeed)}>
              <span className="material-symbols-outlined">{tweaks.liveFeed ? 'pause' : 'play_arrow'}</span>
              {tweaks.liveFeed ? 'PAUSE FEED' : 'RESUME'}
            </button>
          </>
        )}
        {role === 'broker' && (
          <button className="btn primary sm"><span className="material-symbols-outlined">add</span>NEW RISK</button>
        )}
      </div>

      {/* Body */}
      {role === 'admin'
        ? <AdminScreen
            quotes={quotes}
            onSelect={setSelected}
            selectedId={selected?.id}
            newQuoteIds={newQuoteIds}
            particles={particles}
            firingRule={firingRule}
            activityLog={activityLog}
            layout={tweaks.adminLayout}
            tab={adminTab}
          />
        : <BrokerScreen
            quotes={quotes}
            onSelect={setSelected}
            selectedId={selected?.id}
            layout={tweaks.brokerLayout}
          />
      }

      {/* Drawer */}
      <QuoteDrawer
        quote={selected}
        onClose={() => setSelected(null)}
        onReroute={handleReroute}
        role={role}
      />

      {/* Tweaks */}
      {tweaksOpen && (
        <div className="tweaks-panel">
          <div className="tweaks-hd">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>tune</span>
            Tweaks
            <span style={{ marginLeft: 'auto', cursor: 'pointer' }} onClick={() => setTweaksOpen(false)}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
            </span>
          </div>
          <div className="tweaks-body">
            <div className="tweak-row">
              <label>Admin layout</label>
              <div className="seg">
                {['diagram', 'dashboard', 'inbox'].map(v => (
                  <button key={v} className={tweaks.adminLayout === v ? 'active' : ''} onClick={() => setTweak('adminLayout', v)}>
                    {v[0].toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="tweak-row">
              <label>Broker layout</label>
              <div className="seg">
                {['split', 'queue', 'kanban'].map(v => (
                  <button key={v} className={tweaks.brokerLayout === v ? 'active' : ''} onClick={() => setTweak('brokerLayout', v)}>
                    {v[0].toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="toggle-row">
              <span>Live feed animation</span>
              <div className={`toggle ${tweaks.liveFeed ? 'on' : ''}`} onClick={() => setTweak('liveFeed', !tweaks.liveFeed)} />
            </div>
            <div style={{ font: '400 11px/15px var(--font-sans)', color: 'var(--fg-2)', padding: '8px 0 0', borderTop: '1px solid var(--whisper-gray)' }}>
              Click any quote card to open the detail drawer. In broker view, use <b>Override</b> to re-route.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
