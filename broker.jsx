/* global React, DestChip, StatePill, ClassPill, ConfidenceMeter, SizeViz, MonoTime */
const { useState: useStateBroker, useMemo: useMemoBroker } = React;

// ============================================================
// Broker view — split / queue / kanban
// ============================================================

function RiskCard({ q, selected, onClick, variant }) {
  const attention = q.state === 'failed' || q.destId === 'review' || q.confidence < 72;
  const failed = q.state === 'failed';
  return (
    <div
      className={`risk-card ${selected ? 'selected' : ''} ${attention && variant === 'attention' ? 'attention' : ''} ${failed ? 'failed' : ''}`}
      onClick={onClick}
    >
      <div className="risk-row1">
        <SizeViz bucket={q.bucket} />
        <div className="risk-assured">{q.assured}</div>
        <div className="risk-ref">{q.ref}</div>
      </div>
      <div className="risk-row2">
        <ClassPill cls={q.cls} />
        <DestChip destId={q.destId} />
        <StatePill stateId={q.state} />
      </div>
      <div className="risk-row3">
        <div className="risk-meta">
          <span className="material-symbols-outlined" style={{ fontSize: 13, verticalAlign: '-2px', color: 'var(--fg-2)', marginRight: 4 }}>forward_to_inbox</span>
          {q.broker}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ConfidenceMeter value={q.confidence} />
          <span className="risk-meta"><MonoTime mins={q.minsAgo} /></span>
        </div>
      </div>
    </div>
  );
}

function BrokerSplit({ quotes, onSelect, selectedId }) {
  const attention = quotes.filter(q => q.state === 'failed' || q.destId === 'review' || q.confidence < 72 || q.state === 'classified');
  const forwarded = quotes.filter(q => !attention.includes(q));

  return (
    <div className="broker-split">
      <div className="broker-col panel" style={{ padding: 0 }}>
        <div className="col-hd attention">
          <span className="material-symbols-outlined" style={{ color: 'var(--mustard)' }}>priority_high</span>
          <div className="col-title">Needs your attention</div>
          <div className="col-count mustard">{attention.length}</div>
          <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Low confidence · failed · pre-send
          </div>
        </div>
        <div className="risk-list">
          {attention.length === 0 && (
            <div className="empty-state">
              <span className="material-symbols-outlined">done_all</span>
              <p>All clear. Cerebro is handling everything.</p>
            </div>
          )}
          {attention.map(q => (
            <RiskCard key={q.id} q={q} selected={selectedId === q.id} onClick={() => onSelect(q)} variant="attention" />
          ))}
        </div>
      </div>

      <div className="broker-col panel" style={{ padding: 0 }}>
        <div className="col-hd forwarded">
          <span className="material-symbols-outlined" style={{ color: 'var(--moss-green)' }}>check_circle</span>
          <div className="col-title">Forwarded</div>
          <div className="col-count moss">{forwarded.length}</div>
          <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Routed · populated
          </div>
        </div>
        <div className="risk-list">
          {forwarded.map(q => (
            <RiskCard key={q.id} q={q} selected={selectedId === q.id} onClick={() => onSelect(q)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function BrokerQueue({ quotes, onSelect, selectedId }) {
  return (
    <div className="broker-queue">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ font: '500 22px/28px var(--font-serif)' }}>Post-triage risks</h3>
        <span className="pill" style={{ background: 'var(--pistachio-10)', color: 'var(--moss-green)' }}>{quotes.length} total</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn grey sm"><span className="material-symbols-outlined">filter_list</span>Filter</button>
          <button className="btn grey sm"><span className="material-symbols-outlined">download</span>Export</button>
        </div>
      </div>
      <div className="queue-table-wrap">
        <div className="queue-table-scroll">
          <table className="queue-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}></th>
                <th>Reference</th>
                <th>Assured</th>
                <th>Class</th>
                <th>Broker</th>
                <th>Size</th>
                <th>Destination</th>
                <th>Confidence</th>
                <th>State</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map(q => (
                <tr key={q.id} className={selectedId === q.id ? 'selected' : ''} onClick={() => onSelect(q)}>
                  <td><SizeViz bucket={q.bucket} /></td>
                  <td className="mono">{q.ref}</td>
                  <td>{q.assured}</td>
                  <td><ClassPill cls={q.cls} /></td>
                  <td style={{ color: 'var(--fg-2)' }}>{q.broker}</td>
                  <td className="mono">${q.bucket.value}k</td>
                  <td><DestChip destId={q.destId} /></td>
                  <td><ConfidenceMeter value={q.confidence} /></td>
                  <td><StatePill stateId={q.state} /></td>
                  <td><MonoTime mins={q.minsAgo} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BrokerKanban({ quotes, onSelect, selectedId }) {
  const cols = Object.keys(window.DESTINATIONS).filter(k => k !== 'iba');
  return (
    <div className="broker-kanban">
      <div className="kanban-grid">
        {cols.map(k => {
          const d = window.DESTINATIONS[k];
          const col = quotes.filter(q => q.destId === k);
          return (
            <div key={k} className="kanban-col">
              <div className="kanban-col-hd">
                <span className="color-dot" style={{ background: d.color }} />
                <div className="name">{d.label} <span style={{ color: 'var(--fg-2)', fontWeight: 500, fontSize: 11 }}>· {d.sub}</span></div>
                <div className="count">{col.length}</div>
              </div>
              <div className="kanban-col-body">
                {col.map(q => (
                  <div key={q.id} className={`mini-card ${selectedId === q.id ? 'selected' : ''}`} onClick={() => onSelect(q)}
                    style={selectedId === q.id ? { borderColor: 'var(--cobalt)', background: 'var(--cobalt-05)' } : undefined}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div className="ref" style={{ flex: 1 }}>{q.ref}</div>
                      <StatePill stateId={q.state} />
                    </div>
                    <div className="name">{q.assured}</div>
                    <div className="meta"><ClassPill cls={q.cls} /> · {q.broker}</div>
                  </div>
                ))}
                {col.length === 0 && (
                  <div style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--fg-muted)', textAlign: 'center', padding: 16 }}>
                    No quotes routed here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BrokerScreen({ quotes, onSelect, selectedId, layout }) {
  if (layout === 'queue') return <BrokerQueue quotes={quotes} onSelect={onSelect} selectedId={selectedId} />;
  if (layout === 'kanban') return <BrokerKanban quotes={quotes} onSelect={onSelect} selectedId={selectedId} />;
  return <BrokerSplit quotes={quotes} onSelect={onSelect} selectedId={selectedId} />;
}

Object.assign(window, { BrokerScreen });
