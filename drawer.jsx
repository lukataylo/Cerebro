/* global React, DestChip, StatePill, ClassPill, ConfidenceMeter, SizeViz, MonoTime */
const { useState: useStateDrw, useMemo: useMemoDrw } = React;

// ============================================================
// Detail drawer — quote inspection + re-route override
// ============================================================

function QuoteDrawer({ quote, onClose, onReroute, role }) {
  const [rerouteTo, setRerouteTo] = useStateDrw(null);

  if (!quote) return null;

  const rule = window.RULES.find(r => r.id === quote.ruleId);
  const dest = window.DESTINATIONS[quote.destId];

  const destOptions = Object.entries(window.DESTINATIONS).filter(([k]) => k !== quote.destId && k !== 'iba');

  return (
    <>
      <div className={`drawer-backdrop ${quote ? 'open' : ''}`} onClick={onClose} />
      <aside className={`drawer ${quote ? 'open' : ''}`}>
        <div className="drawer-hd">
          <div>
            <div className="ref">{quote.ref} · received <MonoTime mins={quote.minsAgo} /></div>
            <div className="title">{quote.assured}</div>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="drawer-body">
          <div className="drawer-section">
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <ClassPill cls={quote.cls} />
              <DestChip destId={quote.destId} />
              <StatePill stateId={quote.state} />
              <ConfidenceMeter value={quote.confidence} />
            </div>
            <dl className="kv-grid">
              <dt>Assured</dt><dd>{quote.assured}</dd>
              <dt>Class</dt><dd>{quote.cls}</dd>
              <dt>Producing broker</dt><dd>{quote.broker}</dd>
              <dt>Premium est.</dt><dd className="mono">USD {quote.bucket.value},000</dd>
              <dt>Size bucket</dt><dd>{quote.bucket.label} · <span style={{ color: 'var(--fg-2)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{quote.bucket.range}</span></dd>
              <dt>Reference</dt><dd className="mono">{quote.ref}</dd>
            </dl>
          </div>

          <div className="drawer-section">
            <h4>Cerebro trace</h4>
            <div className="rule-trace">
              <div className="trace-step">
                <span className="material-symbols-outlined">check_circle</span>
                Parsed email from <b style={{ marginLeft: 4 }}>{quote.broker}</b>
              </div>
              <div className="trace-step">
                <span className="material-symbols-outlined">check_circle</span>
                Extracted assured, class, size → <b style={{ marginLeft: 4 }}>{quote.cls} · {quote.bucket.label}</b>
              </div>
              <div className="trace-step">
                <span className="material-symbols-outlined">check_circle</span>
                Matched rule <b style={{ marginLeft: 4, fontFamily: 'var(--font-mono)' }}>{rule?.id}</b> · {rule?.name}
              </div>
              <div className="trace-step">
                <span className="material-symbols-outlined" style={{ color: quote.state === 'failed' ? 'var(--status-negative)' : 'var(--status-positive)' }}>
                  {quote.state === 'failed' ? 'error' : 'check_circle'}
                </span>
                {quote.state === 'failed'
                  ? <span>Forward to <b>{dest.label}</b> — <span style={{ color: 'var(--status-negative)' }}>failed (API timeout)</span></span>
                  : quote.state === 'classified'
                    ? <span>Classified for <b>{dest.label}</b> — awaiting send</span>
                    : quote.state === 'forwarded'
                      ? <span>Forwarded to <b>{dest.label}</b></span>
                      : quote.state === 'populated'
                        ? <span>Slip created in <b>{dest.label}</b></span>
                        : <span>Routed to <b>{dest.label}</b> for manual review</span>
                }
              </div>
            </div>
          </div>

          {role === 'broker' && (
            <div className="drawer-section">
              <h4>Re-route to a different system</h4>
              <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--fg-2)', marginBottom: 10 }}>
                Override Cerebro's decision. Rule engine will learn from this correction.
              </p>
              <div className="reroute-grid">
                {destOptions.map(([k, d]) => (
                  <button
                    key={k}
                    className={`reroute-opt ${rerouteTo === k ? 'active' : ''}`}
                    onClick={() => setRerouteTo(k)}
                  >
                    <span className="dest-chip" style={{ border: 0, padding: 0 }}>
                      <span className="swatch" style={{ background: d.color }}>{d.label.slice(0, 2).toUpperCase()}</span>
                    </span>
                    <div>
                      <div className="name">{d.label}</div>
                      <div className="sub">{d.sub}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="drawer-section">
            <h4>Email preview</h4>
            <div style={{ background: 'var(--soft-white-secondary)', borderRadius: 8, padding: 14, font: '400 12px/18px var(--font-sans)', color: 'var(--fg-1)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)', marginBottom: 6 }}>
                FROM: underwriting@{quote.broker.toLowerCase().replace(/ /g, '')}.com<br />
                SUBJECT: {quote.subject}
              </div>
              <p>Dear underwriter,</p>
              <p style={{ marginTop: 8 }}>
                Please find attached our submission for the {quote.cls.toLowerCase()} renewal of {quote.assured}.
                Inception 01 Jan 2026, estimated premium USD {quote.bucket.value},000. Slip, MRC and claims history attached.
              </p>
              <p style={{ marginTop: 8 }}>Kind regards,<br/>{quote.broker} placement team</p>
            </div>
          </div>
        </div>

        <div className="drawer-ft">
          {role === 'broker' && rerouteTo ? (
            <>
              <button className="btn primary" onClick={() => { onReroute(quote.id, rerouteTo); setRerouteTo(null); }}>
                <span className="material-symbols-outlined">swap_horiz</span>
                RE-ROUTE TO {window.DESTINATIONS[rerouteTo].label.toUpperCase()}
              </button>
              <button className="btn ghost" onClick={() => setRerouteTo(null)}>CANCEL</button>
            </>
          ) : (
            <>
              {role === 'broker' ? (
                <>
                  <button className="btn secondary"><span className="material-symbols-outlined">check</span>APPROVE SEND</button>
                  <button className="btn grey"><span className="material-symbols-outlined">swap_horiz</span>OVERRIDE</button>
                  <button className="btn ghost" style={{ marginLeft: 'auto' }}>VIEW IN {dest.label.toUpperCase()}</button>
                </>
              ) : (
                <>
                  <button className="btn grey"><span className="material-symbols-outlined">replay</span>REPLAY</button>
                  <button className="btn grey"><span className="material-symbols-outlined">edit</span>TUNE RULE</button>
                  <button className="btn ghost" style={{ marginLeft: 'auto' }}>OPEN EMAIL</button>
                </>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

Object.assign(window, { QuoteDrawer });
