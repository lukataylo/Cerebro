/* global React, ReactDOM, AdminScreen, BrokerScreen, QuoteDrawer, IngestModal */
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
  const [ingestOpen, setIngestOpen] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [apiHealth, setApiHealth] = useState(null);

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

  // Spawn a routing-flow particle for quote `q`: bucket → CEREBRO → destination.
  const spawnParticle = useCallback((q) => {
    const bucketY = q.bucket.bucket === 'large' ? 12 : q.bucket.bucket === 'medium' ? 30 : 60;
    const destYmap = { ppl: 12, xtrade_om: 28, xtrade_sf: 44, hat: 60, gxb: 76, acturis: 92, review: 50 };
    const pid = 'p-' + q.id + '-' + Math.random().toString(36).slice(2, 6);
    const color = (window.DESTINATIONS[q.destId] || {}).color || 'var(--mustard)';
    setParticles(ps => [...ps, { id: pid, x: 16, y: bucketY, opacity: 1, color }]);
    setTimeout(() => setParticles(ps => ps.map(p => p.id === pid ? { ...p, x: 45, y: 45 } : p)), 50);
    setTimeout(() => setParticles(ps => ps.map(p => p.id === pid ? { ...p, x: 80, y: destYmap[q.destId] || 50 } : p)), 1500);
    setTimeout(() => setParticles(ps => ps.map(p => p.id === pid ? { ...p, opacity: 0 } : p)), 2900);
    setTimeout(() => setParticles(ps => ps.filter(p => p.id !== pid)), 3400);
  }, []);

  // --- API detection + live quote fetch ---
  useEffect(() => {
    (async () => {
      await window.CEREBRO_API_PROBE;
      const ready = !!window.CEREBRO_API_READY;
      setApiReady(ready);
      setApiHealth(window.CEREBRO_API_HEALTH || null);
      if (ready) {
        try {
          const qs = await window.cerebroAPI.quotes();
          setQuotes(qs);
          setActivityLog([{ id: Date.now(), time: new Date().toTimeString().slice(0, 5),
            text: `Backend connected · ${qs.length} quotes loaded · mode <b>${window.CEREBRO_API_HEALTH?.mode || '?'}</b>` }]);
        } catch (err) {
          console.warn('[cerebro] failed to fetch quotes:', err);
        }
      }
    })();
  }, []);

  // Poll for new quotes when API is live. Replaces the simulator.
  useEffect(() => {
    if (!apiReady) return;
    const iv = setInterval(async () => {
      try {
        const qs = await window.cerebroAPI.quotes();
        setQuotes(prev => {
          const prevTop = prev[0]?.id;
          const freshTop = qs[0]?.id;
          if (freshTop && freshTop !== prevTop) {
            const newOnes = qs.filter(q => !prev.some(p => p.id === q.id));
            newOnes.forEach(q => {
              setNewQuoteIds(cur => { const n = new Set(cur); n.add(q.id);
                setTimeout(() => setNewQuoteIds(x => { const y = new Set(x); y.delete(q.id); return y; }), 2200);
                return n;
              });
              setFiringRule(q.ruleId);
              setTimeout(() => setFiringRule(null), 1100);
              setActivityLog(log => [
                { id: Date.now() + Math.random(), time: new Date().toTimeString().slice(0, 5),
                  text: `Routed <b>${q.assured}</b> (${q.cls}, ${q.bucket.label}) → <b>${window.DESTINATIONS[q.destId].label}</b>` },
                ...log,
              ].slice(0, 10));
              spawnParticle(q);
            });
          }
          return qs;
        });
      } catch {}
    }, 4000);
    return () => clearInterval(iv);
  }, [apiReady, spawnParticle]);

  // --- Live feed simulation (only when no backend) ---
  useEffect(() => {
    if (apiReady) return;
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

      spawnParticle(q);
    }, 3200);
    return () => clearInterval(iv);
  }, [tweaks.liveFeed, apiReady, spawnParticle]);

  const handleReroute = useCallback((qid, newDest) => {
    setQuotes(prev => prev.map(q => q.id === qid ? { ...q, destId: newDest, state: 'forwarded', minsAgo: 0 } : q));
    if (apiReady) {
      window.cerebroAPI.forward(qid, newDest).catch(err => console.warn('[forward] failed:', err));
    }
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
  }, [quotes, apiReady]);

  const handleIngested = useCallback((q) => {
    setQuotes(prev => [q, ...prev.filter(p => p.id !== q.id)]);
    setNewQuoteIds(cur => { const n = new Set(cur); n.add(q.id);
      setTimeout(() => setNewQuoteIds(x => { const y = new Set(x); y.delete(q.id); return y; }), 2500);
      return n;
    });
    setFiringRule(q.ruleId);
    setTimeout(() => setFiringRule(null), 1200);
    setActivityLog(log => [
      { id: Date.now(), time: new Date().toTimeString().slice(0, 5),
        text: `<b style="color:var(--cobalt)">Ingested</b> · ${q.assured} (${q.cls}) → <b>${window.DESTINATIONS[q.destId].label}</b>` },
      ...log,
    ].slice(0, 10));
    spawnParticle(q);
  }, [spawnParticle]);

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
            <a href="#" className="active">My risks</a>
          )}
        </nav>
        <div className="spacer" />
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
              <span className="material-symbols-outlined" style={{ fontSize: 12, verticalAlign: '-2px', color: apiReady ? 'var(--status-positive)' : (tweaks.liveFeed ? 'var(--status-positive)' : 'var(--fg-muted)') }}>fiber_manual_record</span>
              {apiReady
                ? ` LIVE · ${apiHealth?.mode === 'live' ? 'CLAUDE' : 'MOCK'} · api:${apiHealth?.model || ''}`
                : (tweaks.liveFeed ? ' LIVE · sim 3.2s' : ' PAUSED')}
            </span>
            {!apiReady && (
              <button className="btn grey sm" onClick={() => setTweak('liveFeed', !tweaks.liveFeed)}>
                <span className="material-symbols-outlined">{tweaks.liveFeed ? 'pause' : 'play_arrow'}</span>
                {tweaks.liveFeed ? 'PAUSE FEED' : 'RESUME'}
              </button>
            )}
            {apiReady && (
              <button className="btn primary sm" onClick={() => setIngestOpen(true)}>
                <span className="material-symbols-outlined">auto_awesome</span>INGEST EMAIL
              </button>
            )}
          </>
        )}
        {role === 'broker' && (
          <button className="btn primary sm" onClick={() => apiReady && setIngestOpen(true)}>
            <span className="material-symbols-outlined">add</span>NEW RISK
          </button>
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

      {/* Ingest modal */}
      <IngestModal
        open={ingestOpen}
        onClose={() => setIngestOpen(false)}
        onIngested={handleIngested}
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
