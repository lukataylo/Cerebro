/* global React, DestChip, StatePill, ClassPill, ConfidenceMeter, SizeViz, MonoTime */
const { useState: useStateAdmin, useEffect: useEffectAdmin, useRef: useRefAdmin, useMemo: useMemoAdmin } = React;

// ============================================================
// Admin view — inbox + flow diagram + rules + activity feed
// ============================================================

function AdminInbox({ quotes, onSelect, selectedId, newQuoteIds }) {
  return (
    <div className="panel inbox">
      <div className="panel-hd">
        <span className="material-symbols-outlined" style={{ color: 'var(--moss-green)' }}>forward_to_inbox</span>
        <div>
          <div className="eyebrow">Forwarded email feed</div>
          <h3>Inbound quotes</h3>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <span className="pill" style={{ background: 'var(--cobalt-05)', color: 'var(--cobalt)' }}>
            <span className="dot" style={{ background: 'var(--cobalt)' }} />
            Live
          </span>
        </div>
      </div>
      <div className="inbox-list">
        {quotes.map(q => {
          const d = window.DESTINATIONS[q.destId];
          return (
            <div
              key={q.id}
              className={`inbox-item ${selectedId === q.id ? 'selected' : ''} ${newQuoteIds.has(q.id) ? 'new' : ''}`}
              onClick={() => onSelect(q)}
            >
              <div className="inbox-row1">
                <div className="inbox-from">{q.broker}</div>
                <MonoTime mins={q.minsAgo} />
              </div>
              <div className="inbox-subj">{q.subject}</div>
              <div className="inbox-meta">
                <ClassPill cls={q.cls} />
                <span style={{ fontSize: 10, color: 'var(--fg-2)', fontFamily: 'var(--font-mono)' }}>→</span>
                <DestChip destId={q.destId} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Flow canvas ----------
function FlowCanvas({ quotes, particles }) {
  // Node layout: size buckets (left) → CEREBRO → destinations (right)
  const buckets = [
    { id: 'large',  label: 'Large',  range: '$150k+',   x: 20,  y: 20,  w: 100, h: 70,  color: 'var(--status-poppy)' },
    { id: 'medium', label: 'Medium', range: '$25–150k', x: 20,  y: 100, w: 100, h: 100, color: 'var(--mustard)' },
    { id: 'small',  label: 'Small',  range: '$0–25k',   x: 20,  y: 212, w: 100, h: 180, color: 'var(--pistachio)' },
  ];
  const cerebro = { x: 200, y: 180, w: 140, h: 80 };
  const dests = [
    { id: 'ppl',        x: 420, y: 30,  w: 150, h: 52 },
    { id: 'xtrade_om',  x: 420, y: 100, w: 150, h: 52 },
    { id: 'xtrade_sf',  x: 420, y: 170, w: 150, h: 52 },
    { id: 'hat',        x: 420, y: 240, w: 150, h: 52 },
    { id: 'gxb',        x: 420, y: 310, w: 150, h: 52 },
    { id: 'acturis',    x: 420, y: 380, w: 150, h: 52 },
  ];

  const counts = useMemoAdmin(() => {
    const c = {};
    quotes.forEach(q => { c[q.destId] = (c[q.destId] || 0) + 1; });
    return c;
  }, [quotes]);

  const bucketCounts = useMemoAdmin(() => {
    const c = { small: 0, medium: 0, large: 0 };
    quotes.forEach(q => { c[q.bucket.bucket] += 1; });
    return c;
  }, [quotes]);

  // Compute SVG paths
  const paths = [];
  buckets.forEach(b => {
    const x1 = b.x + b.w, y1 = b.y + b.h / 2;
    const x2 = cerebro.x, y2 = cerebro.y + cerebro.h / 2;
    const mx = (x1 + x2) / 2;
    paths.push({ key: `b-${b.id}`, d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, kind: 'in' });
  });
  dests.forEach(d => {
    const x1 = cerebro.x + cerebro.w, y1 = cerebro.y + cerebro.h / 2;
    const x2 = d.x, y2 = d.y + d.h / 2;
    const mx = (x1 + x2) / 2;
    paths.push({ key: `d-${d.id}`, d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, kind: 'out', destId: d.id });
  });

  return (
    <div className="flow-canvas">
      <svg viewBox="0 0 600 460" preserveAspectRatio="none">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 Z" fill="var(--moss-green-50)" />
          </marker>
        </defs>
        {paths.map(p => (
          <path
            key={p.key}
            d={p.d}
            fill="none"
            stroke={p.kind === 'in' ? 'rgba(23,63,53,0.28)' : 'rgba(23,63,53,0.35)'}
            strokeWidth={p.kind === 'in' ? 1.5 : 2}
            strokeDasharray={p.kind === 'in' ? '3 3' : '0'}
            markerEnd="url(#arrow)"
          />
        ))}
      </svg>

      {buckets.map(b => (
        <div
          key={b.id}
          className="flow-node size-bucket"
          style={{ left: `${(b.x / 600) * 100}%`, top: `${(b.y / 460) * 100}%`, width: `${(b.w / 600) * 100}%`, height: `${(b.h / 460) * 100}%`, justifyContent: 'flex-end', paddingBottom: 10 }}
        >
          <div className="bar" style={{ height: '100%', background: b.color, opacity: 0.18, borderRadius: '0 0 9px 9px', position: 'absolute', inset: 0 }} />
          <div style={{ position: 'relative' }}>
            <div className="node-name">{b.label}</div>
            <div className="node-sub">{b.range}</div>
            <div style={{ font: '600 14px/18px var(--font-mono)', color: 'var(--nero)', marginTop: 4 }}>
              {bucketCounts[b.id]}
            </div>
          </div>
        </div>
      ))}

      <div
        className="flow-node cerebro"
        style={{
          left: `${(cerebro.x / 600) * 100}%`, top: `${(cerebro.y / 460) * 100}%`,
          width: `${(cerebro.w / 600) * 100}%`, height: `${(cerebro.h / 460) * 100}%`,
          justifyContent: 'center', alignItems: 'center',
        }}
      >
        <div className="node-name" style={{ fontSize: 16, letterSpacing: '0.04em' }}>CEREBRO</div>
        <div className="node-sub">Triage · Routing · Populate</div>
      </div>

      {dests.map(d => {
        const dest = window.DESTINATIONS[d.id];
        const count = counts[d.id] || 0;
        return (
          <div
            key={d.id}
            className="flow-node"
            style={{
              left: `${(d.x / 600) * 100}%`, top: `${(d.y / 460) * 100}%`,
              width: `${(d.w / 600) * 100}%`, height: `${(d.h / 460) * 100}%`,
              justifyContent: 'center', borderLeft: `4px solid ${dest.color}`,
            }}
          >
            <div className="node-name">{dest.label}</div>
            <div className="node-sub">{dest.sub}</div>
            {count > 0 && <div className="node-count">{count}</div>}
          </div>
        );
      })}

      {/* Particles — floating quotes from buckets → Cerebro → destinations */}
      {particles.map(p => (
        <div
          key={p.id}
          className="flow-particle"
          style={{
            left: `${p.x}%`, top: `${p.y}%`,
            background: p.color || 'var(--mustard)',
            transition: 'left 1.4s ease-in-out, top 1.4s ease-in-out, opacity 400ms',
            opacity: p.opacity ?? 1,
          }}
        />
      ))}
    </div>
  );
}

// ---------- KPI row ----------
function KpiRow({ quotes }) {
  const total = quotes.length;
  const autoRate = total ? Math.round(((total - quotes.filter(q => q.destId === 'review' || q.state === 'failed').length) / total) * 100) : 0;
  const avgConf = total ? Math.round(quotes.reduce((s, q) => s + q.confidence, 0) / total) : 0;
  const failed = quotes.filter(q => q.state === 'failed').length;

  // Simple sparkline
  const spark = [4, 7, 6, 9, 12, 10, 14, 18];

  return (
    <div className="kpi-row">
      <div className="kpi">
        <div className="lbl">Quotes today</div>
        <div className="val mono">{total}</div>
        <div className="sparkline">
          {spark.map((h, i) => <span key={i} style={{ height: `${h * 1.2}px` }} />)}
        </div>
      </div>
      <div className="kpi">
        <div className="lbl">Straight-through rate</div>
        <div className="val mono" style={{ color: 'var(--status-positive)' }}>{autoRate}%</div>
        <div className="sparkline">
          <span style={{ height: '50%', background: 'var(--moss-green)' }} />
          <span style={{ height: '80%', background: 'var(--moss-green)' }} />
          <span style={{ height: '90%', background: 'var(--moss-green)' }} />
          <span style={{ height: '95%', background: 'var(--moss-green)' }} />
        </div>
      </div>
      <div className="kpi">
        <div className="lbl">Avg confidence</div>
        <div className="val mono">{avgConf}<span style={{ fontSize: 12, color: 'var(--fg-2)', marginLeft: 2 }}>%</span></div>
        <div className="sparkline">
          {[8, 12, 10, 14, 13, 15, 14, 16].map((h, i) => <span key={i} style={{ height: `${h}px` }} />)}
        </div>
      </div>
      <div className="kpi">
        <div className="lbl">Failed / needs review</div>
        <div className="val mono" style={{ color: failed > 0 ? 'var(--status-negative)' : 'var(--fg-2)' }}>{failed}</div>
        <div className="sparkline">
          {[3, 5, 2, 4, 3, 2, 4, 3].map((h, i) => <span key={i} style={{ height: `${h * 2}px`, background: 'var(--status-negative)' }} />)}
        </div>
      </div>
    </div>
  );
}

// ---------- Rules panel ----------
function RulesPanel({ firing, counts }) {
  return (
    <div className="panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="panel-hd">
        <span className="material-symbols-outlined" style={{ color: 'var(--moss-green)' }}>account_tree</span>
        <div>
          <div className="eyebrow">Routing rules · 9 active</div>
          <h3>Rules engine</h3>
        </div>
      </div>
      <div style={{ padding: '6px 10px', overflowY: 'auto' }}>
        {window.RULES.map(r => (
          <div key={r.id} className={`rule-item ${firing === r.id ? 'firing' : ''}`}>
            <div className="rule-id">{r.id}</div>
            <div className="rule-body">
              <div className="rule-name">{r.name}</div>
              <div className="rule-desc">{r.desc}</div>
            </div>
            <div className="rule-count">{counts[r.id] || 0}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Activity feed ----------
function ActivityFeed({ log }) {
  return (
    <div className="panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="panel-hd">
        <span className="material-symbols-outlined" style={{ color: 'var(--moss-green)' }}>bolt</span>
        <div>
          <div className="eyebrow">Last 10 events</div>
          <h3>Activity</h3>
        </div>
      </div>
      <div className="activity-feed panel-body" style={{ paddingTop: 4 }}>
        {log.length === 0 && (
          <div className="empty-state">
            <span className="material-symbols-outlined">hourglass_empty</span>
            <p>Waiting for inbound quotes…</p>
          </div>
        )}
        {log.map(ev => (
          <div key={ev.id} className="activity-item">
            <div className="activity-time">{ev.time}</div>
            <div className="activity-text" dangerouslySetInnerHTML={{ __html: ev.text }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Main admin screen ----------
function AdminScreen({ quotes, onSelect, selectedId, newQuoteIds, particles, firingRule, activityLog, layout, tab }) {
  const ruleCounts = useMemoAdmin(() => {
    const c = {};
    quotes.forEach(q => { c[q.ruleId] = (c[q.ruleId] || 0) + 1; });
    return c;
  }, [quotes]);

  // Dedicated Routing flow screen — full-canvas diagram + KPI + legend
  if (tab === 'flow') {
    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <KpiRow quotes={quotes} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <FlowCanvas quotes={quotes} particles={particles} />
          </div>
          <div className="right-col">
            <AdminDestBreakdown quotes={quotes} />
            <ActivityFeed log={activityLog} />
          </div>
        </div>
      </div>
    );
  }

  // Dedicated Rules screen
  if (tab === 'rules') {
    return (
      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16, flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <RulesPanel firing={firingRule} counts={ruleCounts} />
        <div className="right-col">
          <AdminDestBreakdown quotes={quotes} />
          <ActivityFeed log={activityLog} />
        </div>
      </div>
    );
  }

  // Dedicated Audit screen — just activity feed full width, wider
  if (tab === 'audit') {
    return (
      <div style={{ padding: 16, flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <ActivityFeed log={activityLog} />
      </div>
    );
  }

  // Default: Triage tab — inbox + KPI + rules + activity (NO diagram)
  if (layout === 'dashboard') {
    return (
      <div className="admin-grid" style={{ gridTemplateColumns: '1fr 340px' }}>
        <div className="flow-wrap">
          <KpiRow quotes={quotes} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, flex: 1, minHeight: 0 }}>
            <AdminDestBreakdown quotes={quotes} />
            <RulesPanel firing={firingRule} counts={ruleCounts} />
          </div>
        </div>
        <div className="right-col">
          <AdminInbox quotes={quotes.slice(0, 12)} onSelect={onSelect} selectedId={selectedId} newQuoteIds={newQuoteIds} />
          <ActivityFeed log={activityLog} />
        </div>
      </div>
    );
  }

  if (layout === 'inbox') {
    return (
      <div className="admin-grid" style={{ gridTemplateColumns: '420px 1fr' }}>
        <AdminInbox quotes={quotes} onSelect={onSelect} selectedId={selectedId} newQuoteIds={newQuoteIds} />
        <div className="flow-wrap">
          <KpiRow quotes={quotes} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, flex: 1, minHeight: 0 }}>
            <RulesPanel firing={firingRule} counts={ruleCounts} />
            <ActivityFeed log={activityLog} />
          </div>
        </div>
      </div>
    );
  }

  // Default triage layout — inbox + KPIs + rules + activity (simplified, no destinations chart)
  return (
    <div className="admin-grid">
      <AdminInbox quotes={quotes.slice(0, 12)} onSelect={onSelect} selectedId={selectedId} newQuoteIds={newQuoteIds} />
      <div className="flow-wrap">
        <KpiRow quotes={quotes} />
        <RulesPanel firing={firingRule} counts={ruleCounts} />
      </div>
      <div className="right-col">
        <ActivityFeed log={activityLog} />
      </div>
    </div>
  );
}

// ---------- Destination breakdown (for dashboard layout) ----------
function AdminDestBreakdown({ quotes }) {
  const counts = useMemoAdmin(() => {
    const c = {};
    quotes.forEach(q => { c[q.destId] = (c[q.destId] || 0) + 1; });
    return c;
  }, [quotes]);
  const total = quotes.length;
  const sorted = Object.entries(window.DESTINATIONS)
    .filter(([k]) => k !== 'iba')
    .map(([k, d]) => ({ id: k, ...d, count: counts[k] || 0 }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="panel-hd">
        <span className="material-symbols-outlined" style={{ color: 'var(--moss-green)' }}>hub</span>
        <div>
          <div className="eyebrow">Today · {total} routed</div>
          <h3>Destinations</h3>
        </div>
      </div>
      <div style={{ padding: '12px 18px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sorted.map(d => {
          const pct = total ? Math.round((d.count / total) * 100) : 0;
          return (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <DestChip destId={d.id} />
              <div style={{ flex: 1, height: 6, background: 'var(--soft-white-secondary)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: d.color, transition: 'width 400ms' }} />
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, minWidth: 50, textAlign: 'right' }}>
                {d.count} <span style={{ color: 'var(--fg-2)' }}>·{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { AdminScreen });
