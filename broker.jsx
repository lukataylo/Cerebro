/* global React, DestChip, StatePill, ClassPill, ConfidenceMeter, SizeViz, MonoTime */
const { useState: useStateBroker, useMemo: useMemoBroker } = React;

// HAT = Howden's own follow capacity. Rendered as a small chip (icon +
// label) on any quote that is HAT-eligible, regardless of destination.
function HatTag({ size = 'sm' }) {
  return (
    <span className={`hat-tag hat-tag-${size}`} title="HAT eligible — Howden's own follow capacity">
      <span className="material-symbols-outlined">workspace_premium</span>
      HAT
    </span>
  );
}

// --- Time-bucket filter helpers (used by the Kanban time tabs) ---
const TIME_BUCKETS = [
  { id: 'today',   label: 'Today',      minsMax: 60 * 24 },
  { id: 'week',    label: 'This week',  minsMax: 7 * 60 * 24 },
  { id: 'month',   label: 'This month', minsMax: 30 * 60 * 24 },
  { id: 'quarter', label: 'Quarter',    minsMax: 90 * 60 * 24 },
  { id: 'year',    label: 'Year',       minsMax: 365 * 60 * 24 },
];
function filterByTimeBucket(quotes, bucketId) {
  const b = TIME_BUCKETS.find(x => x.id === bucketId);
  if (!b) return quotes;
  return quotes.filter(q => (q.minsAgo ?? 0) <= b.minsMax);
}

// ============================================================
// Broker view — split / queue / kanban
// ============================================================

function RiskCard({ q, selected, onClick, variant }) {
  // Needs attention when the submission is waiting on the broker to act
  // (routed to review, low confidence, or still in submitted state on a
  // sensitive route). Bound / processing items sit in the 'in progress'
  // column instead.
  const attention = q.destId === 'review' || q.confidence < 72 || q.state === 'submitted';
  const bound = q.state === 'bound' || q.state === 'processing';
  return (
    <div
      className={`risk-card ${selected ? 'selected' : ''} ${attention && variant === 'attention' ? 'attention' : ''} ${bound ? 'bound' : ''}`}
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
        {q.hatEligible && <HatTag size="sm" />}
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
  // Attention = needs broker decision (submitted + not yet accepted).
  // Bound/processing = past the bind event, downstream distribution.
  const attention = quotes.filter(q => q.state === 'submitted');
  const bound = quotes.filter(q => q.state === 'bound' || q.state === 'processing');

  return (
    <div className="broker-split">
      <div className="broker-col panel" style={{ padding: 0 }}>
        <div className="col-hd attention">
          <span className="material-symbols-outlined" style={{ color: 'var(--mustard)' }}>priority_high</span>
          <div className="col-title">Needs your attention</div>
          <div className="col-count mustard">{attention.length}</div>
          <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Submitted · awaiting bind
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
          <div className="col-title">Bound &amp; processing</div>
          <div className="col-count moss">{bound.length}</div>
          <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Locked · downstream
          </div>
        </div>
        <div className="risk-list">
          {bound.length === 0 && (
            <div className="empty-state" style={{ opacity: 0.6 }}>
              <span className="material-symbols-outlined">inbox</span>
              <p>No bound risks yet. Accept one from the left to advance it.</p>
            </div>
          )}
          {bound.map(q => (
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
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <DestChip destId={q.destId} />
                      {q.hatEligible && <HatTag size="xs" />}
                    </span>
                  </td>
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

// Compact card for kanban columns. No state pill (the column itself conveys
// routing state); leads with assured name + time, then class/premium, then a
// completeness bar so the broker can tell rich submissions from thin ones.
function KanbanCard({ q, selected, onClick, isUnclassified }) {
  const completeness = q.completeness?.pct ?? 0;
  const completenessTone = completeness >= 75 ? 'hi' : completeness >= 50 ? 'mid' : 'lo';
  const reasonText = q.ruleId === 'G-04' || (q.confidence != null && q.confidence < 70)
    ? `Low confidence · ${q.confidence}%`
    : q.ruleId === 'L-01' ? 'Loss ratio too high'
    : q.ruleId === 'G-03' ? 'Missing critical field'
    : 'Needs review';
  return (
    <div
      className={`mini-card v2 ${selected ? 'selected' : ''}`}
      onClick={onClick}
      style={selected ? { borderColor: 'var(--cobalt)', background: 'var(--cobalt-05)' } : undefined}
    >
      <div className="mc2-main">
        <div className="mc2-top">
          <div className="mc2-assured" title={q.assured}>{q.assured}</div>
          <div className="mc2-time"><MonoTime mins={q.minsAgo} /></div>
        </div>
        <div className="mc2-ref">{q.ref}</div>
        <div className="mc2-row">
          <ClassPill cls={q.cls} />
          <span className="mc2-premium">{window.fmtPremium(q.premiumK)}</span>
          {q.hatEligible && <HatTag size="xs" />}
        </div>
        <div className={`mc2-completeness tone-${completenessTone}`} title={`${q.completeness?.filled ?? '?'}/${q.completeness?.total ?? '?'} fields extracted`}>
          <div className="mc2-comp-bar">
            <div className="mc2-comp-fill" style={{ width: `${completeness}%` }} />
          </div>
          <span className="mc2-comp-label">{completeness}%</span>
        </div>
        {isUnclassified && (
          <div className="mini-card-reason">
            <span className="material-symbols-outlined">help</span>
            {reasonText}
          </div>
        )}
      </div>
    </div>
  );
}

function BrokerKanban({ quotes, onSelect, selectedId }) {
  // Columns: Unclassified first (destId === 'review'), then the real target
  // systems in placement priority order. HAT is no longer a column — it's a
  // per-risk tag. 'iba' is accounting, not a triage destination — skipped.
  const TARGETS = ['trade', 'whitespace', 'ppl', 'gxb', 'acturis'];
  const unclassifiedCol = {
    id: 'unclassified',
    label: 'Unclassified',
    sub: 'Needs broker review',
    color: 'var(--status-pomegranate, #C0392B)',
    match: (q) => q.destId === 'review',
  };
  const targetCols = TARGETS
    .filter(k => window.DESTINATIONS[k])
    .map(k => {
      const d = window.DESTINATIONS[k];
      return { id: k, label: d.label, sub: d.sub, color: d.color, match: (q) => q.destId === k };
    });
  const cols = [unclassifiedCol, ...targetCols];

  const [timeBucket, setTimeBucket] = useStateBroker('week');
  const filtered = useMemoBroker(() => filterByTimeBucket(quotes, timeBucket), [quotes, timeBucket]);

  return (
    <div className="broker-kanban">
      <div className="kanban-toolbar" role="tablist" aria-label="Time range">
        {TIME_BUCKETS.map(t => {
          const count = filterByTimeBucket(quotes, t.id).length;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={timeBucket === t.id}
              className={`kanban-tab${timeBucket === t.id ? ' active' : ''}`}
              onClick={() => setTimeBucket(t.id)}
            >
              {t.label}
              <span className="kanban-tab-count">{count}</span>
            </button>
          );
        })}
      </div>
      <div className="kanban-grid">
        {cols.map(col => {
          const items = filtered.filter(col.match);
          const isUnclassified = col.id === 'unclassified';
          return (
            <div key={col.id} className={`kanban-col${isUnclassified ? ' kanban-col-unclassified' : ''}`}>
              <div className="kanban-col-hd">
                <span className="color-dot" style={{ background: col.color }} />
                <div className="name">
                  {col.label}
                  <span style={{ color: 'var(--fg-2)', fontWeight: 500, fontSize: 11 }}> · {col.sub}</span>
                </div>
                <div className="count">{items.length}</div>
              </div>
              <div className="kanban-col-body">
                {items.map(q => (
                  <KanbanCard key={q.id}
                    q={q}
                    selected={selectedId === q.id}
                    onClick={() => onSelect(q)}
                    isUnclassified={isUnclassified}
                  />
                ))}
                {items.length === 0 && (
                  <div style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--fg-muted)', textAlign: 'center', padding: 16 }}>
                    {isUnclassified ? 'Nothing pending' : 'No quotes in range'}
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
