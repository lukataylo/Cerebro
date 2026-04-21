/* global React, DestChip, StatePill, ClassPill, ConfidenceMeter, SizeViz, MonoTime */
const { useState: useStateAdmin, useEffect: useEffectAdmin, useRef: useRefAdmin, useMemo: useMemoAdmin } = React;

// ============================================================
// Helpers: money formatting, deterministic synth for sparklines
// ============================================================
function fmtMoney(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}
// Cheap deterministic hash from a string → 0..1
function hash01(s, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return (h & 0xffff) / 0xffff;
}
// Synthesise a 12-point sparkline with a gentle upward drift and some noise.
// Deterministic per destination id so the same tile always draws the same
// curve. Values are 0..1 and get scaled in the SVG.
function synthSpark(seed, n = 12) {
  const out = [];
  const base = 0.3 + hash01(seed, 1) * 0.3;
  const slope = (hash01(seed, 2) - 0.4) * 0.5;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const noise = (hash01(seed, 10 + i) - 0.5) * 0.18;
    const wave = Math.sin(t * 3 + hash01(seed, 3) * 6) * 0.09;
    out.push(Math.max(0.05, Math.min(0.98, base + slope * t + noise + wave)));
  }
  return out;
}
// Deterministic WoW delta in [-4 .. +8], skewed positive.
function synthDelta(seed) {
  return +(hash01(seed, 99) * 12 - 4).toFixed(1);
}
// Deterministic concentration colour per class (within a destination tile's
// mix bar). Uses the Howden palette so mixes look cohesive, not rainbow.
const CLASS_TINTS = {
  Property:       '#4A6C62',
  Marine:         '#173F35',
  Cyber:          '#0857C3',
  'D&O':          '#4B4F9B',
  Casualty:       '#7A3FBF',
  Aviation:       '#B85C00',
  PI:             '#0D6E63',
  Terrorism:      '#C0392B',
  'Political Risk':'#8A6E2F',
  'Kidnap & Ransom':'#5B2E0E',
};
function classTint(c) { return CLASS_TINTS[c] || '#888'; }

// ============================================================
// Sparkline (thin SVG)
// ============================================================
// Deterministic hex → rgba helper so Chart.js tints match the palette.
function hexRgba(hex, alpha) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return `rgba(0,0,0,${alpha})`;
  return `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${alpha})`;
}

// Sparkline — Chart.js line with a filled gradient area. Uses Chart.js's
// responsive engine to size to its container, so it never stretches like
// the old preserveAspectRatio="none" SVG did.
function Sparkline({ values, color = '#0857C3' }) {
  const ref = useRefAdmin(null);
  const chartRef = useRefAdmin(null);
  useEffectAdmin(() => {
    if (!ref.current || !window.Chart || !values?.length) return;
    const ctx = ref.current.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 80);
    grad.addColorStop(0, hexRgba(color, 0.26));
    grad.addColorStop(1, hexRgba(color, 0.0));
    chartRef.current = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: values.map((_, i) => i),
        datasets: [{
          data: values,
          borderColor: color,
          borderWidth: 1.6,
          pointRadius: 0, pointHoverRadius: 0,
          fill: true, backgroundColor: grad,
          tension: 0.38, cubicInterpolationMode: 'monotone',
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 500 },
        interaction: { mode: 'nearest', intersect: false },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false, grid: { display: false } },
          y: { display: false, grid: { display: false }, beginAtZero: true },
        },
        layout: { padding: 0 },
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [values, color]);
  return <canvas ref={ref} className="ov-spark-canvas" />;
}

// Horizontal bar chart — business lines. One bar per class, tinted per
// line of business, currency-formatted x axis, rich tooltip on hover.
function HorizontalBarChart({ rows, height = 320 }) {
  const ref = useRefAdmin(null);
  const chartRef = useRefAdmin(null);
  useEffectAdmin(() => {
    if (!ref.current || !window.Chart || !rows?.length) return;
    const colors = rows.map(r => classTint(r.label));
    chartRef.current = new window.Chart(ref.current.getContext('2d'), {
      type: 'bar',
      data: {
        labels: rows.map(r => r.label),
        datasets: [{
          data: rows.map(r => r.sum),
          backgroundColor: colors.map(c => hexRgba(c, 0.85)),
          borderWidth: 0,
          borderRadius: 6,
          maxBarThickness: 22,
          categoryPercentage: 0.86,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 600 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#fff',
            titleColor: '#0B1D17',
            bodyColor: '#4A6C62',
            borderColor: 'rgba(0,0,0,0.1)',
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: {
              label: (ctx) => {
                const r = rows[ctx.dataIndex];
                return `${fmtMoney(r.sum)} · ${r.count} submission${r.count === 1 ? '' : 's'} · ${r.pct.toFixed(0)}%`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(0,0,0,0.04)', drawTicks: false },
            ticks: { color: '#6B7A75', font: { size: 10 }, callback: (v) => fmtMoney(v), padding: 6 },
            border: { display: false },
          },
          y: {
            grid: { display: false },
            ticks: { color: '#0B1D17', font: { size: 12, weight: '500' }, padding: 10 },
            border: { display: false },
          },
        },
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [rows]);
  return (
    <div className="ov-bar-wrap" style={{ height }}>
      <canvas ref={ref} />
    </div>
  );
}

// ============================================================
// Admin OVERVIEW — stakeholder dashboard
// ============================================================
function AdminOverview({ quotes }) {
  const data = useMemoAdmin(() => aggregateForOverview(quotes), [quotes]);

  return (
    <div className="ov">
      {/* KPI strip */}
      <section className="ov-strip">
        <div className="ov-strip-eyebrow">Operations · last 30 days</div>
        <div className="ov-strip-kpis">
          <OvKpi label="Premium routed" value={fmtMoney(data.totalPremium)} accent />
          <OvKpi label="Submissions" value={data.count} />
          <OvKpi label="Auto-routed" value={`${data.autoPct}%`} />
          <OvKpi label="Avg confidence" value={`${data.avgConfidence}%`} />
          <OvKpi label="Avg completeness" value={`${data.avgCompleteness}%`} />
        </div>
      </section>

      {/* Destination tiles — top row = Lloyd's platforms (trade, whitespace, ppl),
          bottom row = delegated / non-Lloyd's (gxb, acturis). Both rows stretch
          to the full viewport width so the two combined bottom tiles match the
          width of the three top tiles. */}
      <section className="ov-grid ov-grid-top">
        {data.topRow.map(d => <OvTile key={d.id} d={d} />)}
      </section>
      <section className="ov-grid ov-grid-bottom">
        {data.bottomRow.map(d => <OvTile key={d.id} d={d} />)}
      </section>

      {/* Business lines */}
      <section className="ov-panel">
        <header className="ov-panel-hd">
          <div>
            <div className="ov-eyebrow">Business lines</div>
            <h3 className="ov-panel-title">Across all sub-systems</h3>
          </div>
          <div className="ov-panel-meta">
            <span className="ov-meta-num">{data.count}</span> submissions
            <span className="ov-meta-sep" />
            <span className="ov-meta-num">{fmtMoney(data.totalPremium)}</span> total
          </div>
        </header>
        <div className="ov-lines">
          {data.classes.length === 0
            ? <div className="ov-empty">No placements yet.</div>
            : <HorizontalBarChart rows={data.classes} height={Math.max(200, data.classes.length * 36 + 60)} />}
        </div>
      </section>

      {/* Review alert (if any) */}
      {data.review && data.review.count > 0 && (
        <section className="ov-review">
          <span className="material-symbols-outlined ov-review-icon">priority_high</span>
          <div className="ov-review-main">
            <div className="ov-review-hd">
              <span className="ov-review-label">Manual review</span>
              <span className="ov-review-num">{fmtMoney(data.review.sum)}</span>
              <span className={`ov-review-delta ${data.review.delta >= 0 ? 'up' : 'down'}`}>
                {data.review.delta >= 0 ? '▲' : '▼'} {Math.abs(data.review.delta).toFixed(1)}%
              </span>
            </div>
            <div className="ov-review-sub">
              {data.review.count} open
              {data.review.oldCount > 0 && <> · <b>{data.review.oldCount} older than 24h</b></>}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function OvKpi({ label, value, accent }) {
  return (
    <div className={`ov-kpi ${accent ? 'accent' : ''}`}>
      <div className="ov-kpi-label">{label}</div>
      <div className="ov-kpi-value">{value}</div>
    </div>
  );
}

function OvTile({ d }) {
  const up = d.delta >= 0;
  return (
    <div className="ov-tile">
      <div className="ov-tile-hd">
        <span className="ov-tile-dot" style={{ background: d.color }} />
        <div className="ov-tile-title">
          <div className="ov-tile-name">{d.label}</div>
          <div className="ov-tile-sub">{d.sub}</div>
        </div>
      </div>
      <div className="ov-tile-stat">
        <div className="ov-tile-value">{fmtMoney(d.sum)}</div>
        <div className={`ov-tile-delta ${up ? 'up' : 'down'}`}>
          {up ? '▲' : '▼'} {Math.abs(d.delta).toFixed(1)}%
        </div>
      </div>
      <div className="ov-tile-spark-row">
        <Sparkline values={d.spark} color={d.color} />
      </div>
      <div className="ov-tile-count">
        {d.count} submission{d.count === 1 ? '' : 's'}
      </div>
      <div className="ov-tile-mix">
        <div className="ov-mix-bar">
          {d.classMix.map((m, i) => (
            <div key={m.label} className="ov-mix-seg" style={{ width: `${m.pct}%`, background: classTint(m.label), opacity: 1 - i * 0.08 }} title={`${m.label} · ${m.pct}%`} />
          ))}
        </div>
        <div className="ov-mix-legend">
          {d.classMix.slice(0, 3).map(m => (
            <div key={m.label} className="ov-mix-row">
              <span className="ov-mix-dot" style={{ background: classTint(m.label) }} />
              <span className="ov-mix-label">{m.label}</span>
              <span className="ov-mix-pct">{m.pct}%</span>
            </div>
          ))}
          {d.classMix.length > 3 && (
            <div className="ov-mix-more">+{d.classMix.length - 3} more</div>
          )}
          {d.classMix.length === 0 && (
            <div className="ov-mix-empty">No volume yet</div>
          )}
        </div>
      </div>
    </div>
  );
}

function aggregateForOverview(quotes) {
  // Only live quotes — exclude nothing; review is its own alert.
  // HAT is a tag, not a destination, so it's excluded here too.
  const TARGETS = ['trade', 'whitespace', 'ppl', 'gxb', 'acturis'];
  const totalPremium = quotes.reduce((s, q) => s + (q.premium || 0), 0);
  const count = quotes.length;

  const reviewQs = quotes.filter(q => q.destId === 'review');
  const reviewOldCutoff = Date.now() - 24 * 60 * 60 * 1000;
  const autoCount = count - reviewQs.length;
  const autoPct = count ? Math.round((autoCount / count) * 100) : 0;

  const avgConfidence = count
    ? Math.round(quotes.reduce((s, q) => s + (q.confidence || 0), 0) / count)
    : 0;
  const avgCompleteness = count
    ? Math.round(quotes.reduce((s, q) => s + (q.completeness?.pct || 0), 0) / count)
    : 0;

  const destinations = TARGETS
    .filter(id => window.DESTINATIONS[id])
    .map(id => {
      const d = window.DESTINATIONS[id];
      const qs = quotes.filter(q => q.destId === id);
      const sum = qs.reduce((s, q) => s + (q.premium || 0), 0);
      // class mix within this destination
      const byClass = {};
      qs.forEach(q => { byClass[q.cls] = (byClass[q.cls] || 0) + (q.premium || 0); });
      const classMix = Object.entries(byClass)
        .map(([label, v]) => ({ label, pct: sum ? Math.round((v / sum) * 100) : 0 }))
        .sort((a, b) => b.pct - a.pct);
      return {
        id, label: d.label, sub: d.sub, color: d.color,
        sum, count: qs.length,
        classMix,
        spark: synthSpark(id, 14),
        delta: synthDelta(id),
      };
    });

  // class totals across all destinations (excluding review — those aren't placed)
  const placedQs = quotes.filter(q => q.destId !== 'review');
  const placedSum = placedQs.reduce((s, q) => s + (q.premium || 0), 0);
  const byClass = {};
  placedQs.forEach(q => {
    if (!byClass[q.cls]) byClass[q.cls] = { sum: 0, count: 0 };
    byClass[q.cls].sum += q.premium || 0;
    byClass[q.cls].count += 1;
  });
  const classes = Object.entries(byClass)
    .map(([label, v]) => ({
      label,
      sum: v.sum,
      count: v.count,
      pct: placedSum ? (v.sum / placedSum) * 100 : 0,
    }))
    .sort((a, b) => b.sum - a.sum);

  const review = {
    count: reviewQs.length,
    sum: reviewQs.reduce((s, q) => s + (q.premium || 0), 0),
    oldCount: reviewQs.filter(q => new Date(q.createdAt).getTime() < reviewOldCutoff).length,
    delta: synthDelta('review'),
  };

  // Layout split: Lloyd's platforms on top (trade, whitespace, ppl),
  // delegated / non-Lloyd's on the bottom (gxb, acturis).
  const TOP = ['trade', 'whitespace', 'ppl'];
  const BOTTOM = ['gxb', 'acturis'];
  const byId = Object.fromEntries(destinations.map(d => [d.id, d]));
  const topRow = TOP.map(id => byId[id]).filter(Boolean);
  const bottomRow = BOTTOM.map(id => byId[id]).filter(Boolean);

  return {
    totalPremium, count, autoPct, avgConfidence, avgCompleteness,
    destinations, topRow, bottomRow, classes, review,
  };
}

// ============================================================
// Admin AUDIT — full chronological event feed across all risks
// ============================================================
const AUDIT_META = {
  ingested:   { icon: 'mark_email_unread', label: 'Ingested',  tone: 'neutral',   actor: 'Cerebro' },
  extracted:  { icon: 'bolt',              label: 'Extracted', tone: 'neutral',   actor: 'Claude' },
  routed:     { icon: 'route',             label: 'Routed',    tone: 'neutral',   actor: 'Cerebro' },
  accepted:   { icon: 'task_alt',          label: 'Accepted',  tone: 'positive',  actor: 'Broker' },
  bound:      { icon: 'lock',              label: 'Bound',     tone: 'positive',  actor: 'System' },
  processing: { icon: 'sync',              label: 'Processing',tone: 'neutral',   actor: 'System' },
  overridden: { icon: 'swap_horiz',        label: 'Override',  tone: 'warn',      actor: 'Broker' },
  rfi_sent:   { icon: 'forward_to_inbox',  label: 'RFI sent',  tone: 'warn',      actor: 'Broker' },
  augmented:  { icon: 'auto_fix_high',     label: 'Augmented', tone: 'neutral',   actor: 'Broker' },
  rule_created:   { icon: 'add_circle',    label: 'Rule added',    tone: 'neutral',   actor: 'Admin' },
  rule_edited:    { icon: 'edit',          label: 'Rule edited',   tone: 'neutral',   actor: 'Admin' },
  rule_deleted:   { icon: 'delete',        label: 'Rule deleted',  tone: 'warn',      actor: 'Admin' },
  rule_reordered: { icon: 'swap_vert',     label: 'Rules reordered', tone: 'neutral', actor: 'Admin' },
  rule_reset:     { icon: 'restart_alt',   label: 'Rules reset',   tone: 'warn',      actor: 'Admin' },
};
function fmtAuditTs(ts) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function renderAdminAuditDetail(ev) {
  const d = ev.detail || {};
  if (ev.event === 'ingested') return `From ${d.from || '?'} · source ${d.source || 'email'}${d.attachments?.length ? ` · ${d.attachments.length} attachment${d.attachments.length === 1 ? '' : 's'}` : ''}`;
  if (ev.event === 'extracted') return `${Object.keys(d.fields || {}).length} fields · confidence ${d.confidence}% — ${(d.reasoning || '').slice(0, 180)}`;
  if (ev.event === 'routed') {
    const p = window.DESTINATIONS?.[d.primary?.destId]?.label || d.primary?.destId || '?';
    const f = window.DESTINATIONS?.[d.fallback?.destId]?.label || d.fallback?.destId || '?';
    const score = d.score;
    const bits = score ? `elig ${score.eligibility?.score} · fit ${score.clientFit?.score} · pbind ${score.pbind?.score} · econ ${score.economicValue?.score} · speed ${score.speed?.score}` : '';
    return `Primary ${p} (${d.primary?.ruleId}) · Fallback ${f}${bits ? ` · ${bits}` : ''}`;
  }
  if (ev.event === 'accepted') return `Accepted route · ${window.DESTINATIONS?.[d.destId]?.label || d.destId}`;
  if (ev.event === 'bound') {
    const t = d.finalTerms || {};
    return `Final terms locked: ${fmtMoney((t.premium_k || 0) * 1000)} · ${t.carrier} · ${t.inception_date || 'TBC'}${t.notes ? ` · ${t.notes}` : ''}`;
  }
  if (ev.event === 'processing') return d.note || 'Downstream distribution started';
  if (ev.event === 'overridden') {
    const f = window.DESTINATIONS?.[d.from?.destId]?.label || d.from?.destId;
    const t = window.DESTINATIONS?.[d.to?.destId]?.label || d.to?.destId;
    return `${f} → ${t} · reason: ${d.reason || '—'}`;
  }
  if (ev.event === 'rfi_sent') return `Requested: ${(d.fields || []).join(', ') || '(free-text)'}${d.notes ? ` · ${d.notes}` : ''}`;
  if (ev.event === 'augmented') return `Confidence ${d.prevConfidence}% → ${d.newConfidence}%${d.addedAttachment ? ` · added ${d.addedAttachment}` : ''}`;
  if (ev.event === 'rule_created') return `${d.id} · ${d.name} (${d.tier} → ${window.DESTINATIONS?.[d.dest_id]?.label || d.dest_id})`;
  if (ev.event === 'rule_deleted') return `${d.id} · ${d.name}`;
  if (ev.event === 'rule_reordered') return `${(d.ids || []).length} rules renumbered`;
  if (ev.event === 'rule_reset') return d.note || 'Rules reset to factory defaults';
  if (ev.event === 'rule_edited') {
    const b = d.before || {}, a = d.after || {};
    const changes = [];
    if (b.enabled !== a.enabled) changes.push(`enabled ${b.enabled} → ${a.enabled}`);
    if (b.dest_id !== a.dest_id) changes.push(`dest ${b.dest_id} → ${a.dest_id}`);
    if (b.name !== a.name) changes.push(`name "${b.name}" → "${a.name}"`);
    if (b.priority !== a.priority) changes.push(`priority ${b.priority} → ${a.priority}`);
    if (JSON.stringify(b.predicate) !== JSON.stringify(a.predicate)) changes.push('predicate updated');
    return `${d.id}${changes.length ? ' · ' + changes.join(', ') : ''}`;
  }
  return '';
}

function AdminAuditView({ onSelect, quotes }) {
  const quoteById = useMemoAdmin(() => {
    const m = new Map();
    (quotes || []).forEach(q => m.set(q.id, q));
    return m;
  }, [quotes]);
  const openQuote = (quoteId) => {
    if (!onSelect || !quoteId) return;
    const q = quoteById.get(quoteId);
    if (q) onSelect(q);
  };
  const [entries, setEntries] = useStateAdmin([]);
  const [loading, setLoading] = useStateAdmin(true);
  const [filter, setFilter] = useStateAdmin('all');
  const [search, setSearch] = useStateAdmin('');

  useEffectAdmin(() => {
    let cancelled = false;
    async function load() {
      try {
        const rows = window.cerebroAPI ? await window.cerebroAPI.auditAll() : [];
        if (!cancelled) setEntries(rows);
      } catch {
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const iv = setInterval(load, 6000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const filtered = useMemoAdmin(() => {
    const lc = search.trim().toLowerCase();
    return entries.filter(ev => {
      if (filter !== 'all' && ev.event !== filter) return false;
      if (!lc) return true;
      return (ev.ref || '').toLowerCase().includes(lc)
        || (ev.assured || '').toLowerCase().includes(lc)
        || (ev.actor || '').toLowerCase().includes(lc)
        || (ev.event || '').toLowerCase().includes(lc);
    });
  }, [entries, filter, search]);

  const EVENT_FILTERS = [
    'all', 'ingested', 'extracted', 'routed', 'accepted', 'bound', 'processing', 'overridden', 'rfi_sent', 'augmented',
    'rule_created', 'rule_edited', 'rule_deleted', 'rule_reordered', 'rule_reset',
  ];

  return (
    <div className="admin-audit">
      <div className="admin-audit-hd">
        <div>
          <div className="ov-eyebrow">Compliance trail</div>
          <h3 className="ov-panel-title">Audit log</h3>
          <div className="admin-audit-sub">
            Every event across every risk — ingest, extraction, routing, broker actions, bind, downstream distribution.
          </div>
        </div>
        <div className="admin-audit-filters">
          <input className="ing-input" style={{ width: 240 }} placeholder="Search ref / assured…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="ing-input" value={filter} onChange={(e) => setFilter(e.target.value)}>
            {EVENT_FILTERS.map(f => <option key={f} value={f}>{f === 'all' ? 'All events' : (AUDIT_META[f]?.label || f)}</option>)}
          </select>
        </div>
      </div>

      {loading && <div className="admin-audit-empty">Loading audit trail…</div>}
      {!loading && filtered.length === 0 && (
        <div className="admin-audit-empty">
          {search || filter !== 'all' ? 'No events match your filter.' : 'No audit entries yet.'}
        </div>
      )}

      {/* Flat one-row-per-event feed — no indented timeline. Each row has a
          single timestamp and a detail line. Clicking opens the related
          quote in the drawer. */}
      <div className="admin-audit-flat">
        {filtered.map(ev => {
          const meta = AUDIT_META[ev.event] || { icon: 'circle', label: ev.event, tone: 'neutral', actor: ev.actor };
          const canOpen = quoteById.has(ev.quoteId);
          return (
            <div
              key={ev.id}
              className={`admin-audit-row tone-${meta.tone}${canOpen ? ' clickable' : ''}`}
              role={canOpen ? 'button' : undefined}
              onClick={canOpen ? () => openQuote(ev.quoteId) : undefined}
              title={canOpen ? 'Open quote in drawer' : undefined}
            >
              <div className="admin-audit-row-ts mono">{fmtAuditTs(ev.ts)}</div>
              <div className={`admin-audit-row-icon tone-${meta.tone}`}>
                <span className="material-symbols-outlined">{meta.icon}</span>
              </div>
              <div className="admin-audit-row-ref mono">{ev.ref || '—'}</div>
              <div className="admin-audit-row-assured">{ev.assured || '—'}</div>
              <div className="admin-audit-row-event">
                <span className="admin-audit-event-label">{meta.label}</span>
                <span className="admin-audit-actor"> · {meta.actor}</span>
              </div>
              <div className="admin-audit-row-detail">{renderAdminAuditDetail(ev)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Admin view — inbox + flow diagram + rules + activity feed
// ============================================================

function AdminInbox({ quotes, onSelect, selectedId, newQuoteIds }) {
  return (
    <div className="panel inbox">
      <div className="panel-hd">
        <span className="material-symbols-outlined" style={{ color: 'var(--moss-green)' }}>inbox</span>
        <div>
          <div className="eyebrow">Live triage feed</div>
          <h3>Inbound risks</h3>
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

// (The Routing flow canvas was removed along with the Routing flow tab.
// The KPI row below is still used by the Triage default layouts.)

// ---------- KPI row ----------
function KpiRow({ quotes }) {
  const total = quotes.length;
  const autoRate = total ? Math.round(((total - quotes.filter(q => q.destId === 'review' || q.state === 'failed').length) / total) * 100) : 0;
  const avgConf = total ? Math.round(quotes.reduce((s, q) => s + q.confidence, 0) / total) : 0;
  const failed = quotes.filter(q => q.state === 'failed' || q.destId === 'review').length;
  const spark = [4, 7, 6, 9, 12, 10, 14, 18];
  return (
    <div className="kpi-row">
      <div className="kpi">
        <div className="lbl">Quotes today</div>
        <div className="val mono">{total}</div>
        <div className="sparkline">{spark.map((h, i) => <span key={i} style={{ height: `${h * 1.2}px` }} />)}</div>
      </div>
      <div className="kpi">
        <div className="lbl">Straight-through rate</div>
        <div className="val mono" style={{ color: 'var(--status-positive)' }}>{autoRate}%</div>
        <div className="sparkline">
          {[50, 80, 90, 95].map((h, i) => <span key={i} style={{ height: `${h}%`, background: 'var(--moss-green)' }} />)}
        </div>
      </div>
      <div className="kpi">
        <div className="lbl">Avg confidence</div>
        <div className="val mono">{avgConf}<span style={{ fontSize: 12, color: 'var(--fg-2)', marginLeft: 2 }}>%</span></div>
        <div className="sparkline">{[8, 12, 10, 14, 13, 15, 14, 16].map((h, i) => <span key={i} style={{ height: `${h}px` }} />)}</div>
      </div>
      <div className="kpi">
        <div className="lbl">Needs review</div>
        <div className="val mono" style={{ color: failed > 0 ? 'var(--status-negative)' : 'var(--fg-2)' }}>{failed}</div>
        <div className="sparkline">{[3, 5, 2, 4, 3, 2, 4, 3].map((h, i) => <span key={i} style={{ height: `${h * 2}px`, background: 'var(--status-negative)' }} />)}</div>
      </div>
    </div>
  );
}

// ---------- Rules panel ----------
function RulesPanel({ firing, counts, rules }) {
  const list = rules && rules.length ? rules : (window.RULES || []);
  // Group by tier when tier metadata is available (backend rules are tiered).
  const hasTiers = list.some(r => r.tier);
  const byTier = hasTiers
    ? list.reduce((acc, r) => { (acc[r.tier] = acc[r.tier] || []).push(r); return acc; }, {})
    : { all: list };
  const TIER_ORDER = ['gate', 'facility', 'compliance', 'class', 'size', 'loss', 'fallback'];
  const TIER_LABELS = {
    gate: 'Gates', facility: 'Facility / binder', compliance: 'Compliance',
    class: 'Class routing', size: 'Size routing', loss: 'Loss overlays',
    fallback: 'Fallback', all: 'All rules',
  };
  const tiers = hasTiers
    ? TIER_ORDER.filter(t => byTier[t]).map(t => [t, byTier[t]])
    : [['all', byTier.all]];
  return (
    <div className="panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="panel-hd">
        <span className="material-symbols-outlined" style={{ color: 'var(--moss-green)' }}>account_tree</span>
        <div>
          <div className="eyebrow">Routing rules · {list.length} active</div>
          <h3>Rules engine</h3>
        </div>
      </div>
      <div style={{ padding: '6px 10px', overflowY: 'auto' }}>
        {tiers.map(([tier, items]) => (
          <div key={tier}>
            {hasTiers && (
              <div className="rule-tier-hd">{TIER_LABELS[tier] || tier}</div>
            )}
            {items.map(r => (
              <div
                key={r.id}
                data-rule-id={r.id}
                className={`rule-item ${firing === r.id ? 'firing' : ''}`}
              >
                <div className="rule-id">{r.id}</div>
                <div className="rule-body">
                  <div className="rule-name">{r.name}</div>
                  <div className="rule-desc">{r.desc}</div>
                </div>
                <div className="rule-count">{counts[r.id] || 0}</div>
              </div>
            ))}
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
function AdminScreen({ quotes, onSelect, selectedId, newQuoteIds, particles, firingRule, activityLog, layout, tab, rules, apiReady }) {
  const ruleCounts = useMemoAdmin(() => {
    const c = {};
    quotes.forEach(q => { c[q.ruleId] = (c[q.ruleId] || 0) + 1; });
    return c;
  }, [quotes]);

  // Stakeholder overview — default tab
  if (tab === 'overview') {
    return (
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <AdminOverview quotes={quotes} />
      </div>
    );
  }

  // Routing flow tab removed — the overview tab already surfaces the
  // destination mix and the rules panel shows what's firing. Any legacy
  // state pointing at 'flow' falls through to the triage default below.

  // Dedicated Rules screen — full editor (replaces the read-only
  // RulesPanel). Persists to the backend via window.cerebroAPI; if the
  // backend isn't reachable we fall back to the read-only panel so the
  // offline demo still renders something.
  if (tab === 'rules') {
    if (!apiReady || !window.cerebroAPI) {
      return (
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16, flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <RulesPanel firing={firingRule} counts={ruleCounts} rules={rules} />
          <div className="right-col">
            <AdminDestBreakdown quotes={quotes} />
            <ActivityFeed log={activityLog} />
          </div>
        </div>
      );
    }
    return <RulesEditor counts={ruleCounts} firing={firingRule} />;
  }

  // Dedicated Audit screen — full chronological feed from the backend
  if (tab === 'audit') {
    return (
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <AdminAuditView onSelect={onSelect} quotes={quotes} />
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
            <RulesPanel firing={firingRule} counts={ruleCounts} rules={rules} />
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
            <RulesPanel firing={firingRule} counts={ruleCounts} rules={rules} />
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
        <RulesPanel firing={firingRule} counts={ruleCounts} rules={rules} />
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

// ============================================================
// Rules editor — live, editable rules engine
//
// Talks to the backend via window.cerebroAPI. The left pane lists rules
// grouped by tier with drag-free up/down reorder + toggle + fire count.
// The right pane is a form editor with a tiny predicate builder for
// conditions. Built-in rules show a reduced editor (you can rename,
// enable/disable, and change destination — but not rewrite the logic).
// ============================================================

const TIER_LABELS_FULL = {
  gate: 'Gates', facility: 'Facility / binder', compliance: 'Compliance',
  class: 'Class routing', size: 'Size routing', loss: 'Loss overlays',
  fallback: 'Fallback',
};

const OP_LABELS = {
  '==': '=', '!=': '≠',
  '>': '>', '>=': '≥', '<': '<', '<=': '≤',
  'in': 'in', 'not_in': 'not in',
  'present': 'is present', 'absent': 'is absent',
  'contains': 'contains',
};

// Which operators are valid for a given field type. Keeps the operator
// dropdown tractable.
const OPS_BY_TYPE = {
  number: ['>=', '>', '<=', '<', '==', '!='],
  string: ['==', '!=', 'in', 'not_in', 'present', 'absent'],
  class:  ['==', '!=', 'in', 'not_in'],
  geo:    ['contains', 'present', 'absent'],
};

const CLASS_OPTIONS = [
  'Property', 'Marine', 'Cyber', 'D&O', 'Casualty',
  'Aviation', 'PI', 'Terrorism', 'Political Risk', 'Kidnap & Ransom',
];
const GEO_OPTIONS = ['GB', 'EU', 'US', 'APAC', 'MENA', 'LATAM'];

function RulesEditor({ counts, firing }) {
  const [rules, setRules] = useStateAdmin([]);
  const [meta, setMeta] = useStateAdmin({
    destinations: window.DESTINATIONS,
    tiers: ['gate', 'facility', 'compliance', 'class', 'size', 'loss', 'fallback'],
    fields: [],
    undeletable: ['R-09'],
  });
  const [selectedId, setSelectedId] = useStateAdmin(null);
  const [loading, setLoading] = useStateAdmin(true);
  const [saving, setSaving] = useStateAdmin(false);
  const [flash, setFlash] = useStateAdmin(null);

  const showFlash = (text, tone = 'ok') => {
    setFlash({ text, tone });
    setTimeout(() => setFlash(null), 2400);
  };

  const refresh = async () => {
    const resp = await window.cerebroAPI.rulesList();
    setRules(resp.rules);
    setMeta({
      destinations: resp.destinations,
      tiers: resp.tiers,
      fields: resp.fields,
      undeletable: new Set(resp.undeletable || []),
    });
    // Also update the global window.RULES so other views (inbox/flow
    // cards that pull rule labels) stay in sync.
    window.RULES = resp.rules;
    return resp.rules;
  };

  useEffectAdmin(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await refresh();
        if (!cancelled && list.length && !selectedId) setSelectedId(list[0].id);
      } catch (err) {
        console.error('[rules] load failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line

  const selected = useMemoAdmin(
    () => rules.find(r => r.id === selectedId) || null,
    [rules, selectedId],
  );

  // Group & sort rules for the left pane.
  const grouped = useMemoAdmin(() => {
    const by = {};
    for (const r of rules) { (by[r.tier] = by[r.tier] || []).push(r); }
    Object.values(by).forEach(arr => arr.sort((a, b) => a.priority - b.priority));
    return meta.tiers.map(t => [t, by[t] || []]);
  }, [rules, meta.tiers]);

  // --- Actions ---

  const patchRule = async (id, patch) => {
    setSaving(true);
    try {
      const updated = await window.cerebroAPI.ruleUpdate(id, patch);
      setRules(curr => curr.map(r => (r.id === id ? updated : r)));
      window.RULES = rules.map(r => (r.id === id ? updated : r));
      showFlash('Saved', 'ok');
    } catch (err) {
      showFlash(err.message || 'Save failed', 'err');
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (id, enabled) => {
    await patchRule(id, { enabled });
  };

  const moveRule = async (id, direction) => {
    // Reorder inside the rule's tier by swapping priority with the neighbour.
    const rule = rules.find(r => r.id === id);
    if (!rule) return;
    const sameTier = rules.filter(r => r.tier === rule.tier).sort((a, b) => a.priority - b.priority);
    const idx = sameTier.findIndex(r => r.id === id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sameTier.length) return;
    const newOrder = sameTier.slice();
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    // Post a reorder that covers every rule (keeps other tiers in-place by
    // priority), so the resulting priorities match the array index exactly.
    const allInOrder = meta.tiers.flatMap(t => {
      if (t === rule.tier) return newOrder.filter(r => r.tier === t);
      return rules.filter(r => r.tier === t).sort((a, b) => a.priority - b.priority);
    });
    const ids = allInOrder.map(r => r.id);
    setSaving(true);
    try {
      const updated = await window.cerebroAPI.rulesReorder(ids);
      setRules(updated);
      window.RULES = updated;
      showFlash('Reordered', 'ok');
    } catch (err) {
      showFlash(err.message || 'Reorder failed', 'err');
    } finally {
      setSaving(false);
    }
  };

  const createRule = async () => {
    // Pick a fresh id like U-01, U-02…
    const used = new Set(rules.map(r => r.id));
    let n = 1;
    while (used.has(`U-${String(n).padStart(2, '0')}`)) n++;
    const newId = `U-${String(n).padStart(2, '0')}`;
    const payload = {
      id: newId,
      tier: 'class',
      name: 'New rule',
      description: '',
      kind: 'predicate',
      dest_id: 'trade',
      predicate: { all: [] },
      enabled: true,
    };
    setSaving(true);
    try {
      await window.cerebroAPI.ruleCreate(payload);
      await refresh();
      setSelectedId(newId);
      showFlash('Rule created', 'ok');
    } catch (err) {
      showFlash(err.message || 'Create failed', 'err');
    } finally {
      setSaving(false);
    }
  };

  const deleteRule = async (id) => {
    if (!confirm(`Delete rule ${id}? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await window.cerebroAPI.ruleDelete(id);
      await refresh();
      setSelectedId(null);
      showFlash('Deleted', 'ok');
    } catch (err) {
      showFlash(err.message || 'Delete failed', 'err');
    } finally {
      setSaving(false);
    }
  };

  const resetAll = async () => {
    if (!confirm('Reset ALL rules to factory defaults? Any edits will be lost.')) return;
    setSaving(true);
    try {
      await window.cerebroAPI.rulesReset();
      await refresh();
      showFlash('Reset to defaults', 'ok');
    } catch (err) {
      showFlash(err.message || 'Reset failed', 'err');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="rules-editor-loading">Loading rules…</div>;
  }

  return (
    <div className="rules-editor">
      {flash && <div className={`rules-editor-flash tone-${flash.tone}`}>{flash.text}</div>}
      <div className="rules-editor-toolbar">
        <div>
          <div className="ov-eyebrow">Routing rules · {rules.length} defined</div>
          <h3 className="ov-panel-title">Rules engine editor</h3>
          <div className="rules-editor-sub">
            Edits persist to the database. Every ingest reloads the latest rules — no restart needed.
          </div>
        </div>
        <div className="rules-editor-toolbar-actions">
          <button className="btn grey sm" onClick={resetAll} disabled={saving}>
            <span className="material-symbols-outlined">restart_alt</span>
            RESET TO DEFAULTS
          </button>
          <button className="btn primary sm" onClick={createRule} disabled={saving}>
            <span className="material-symbols-outlined">add</span>
            NEW RULE
          </button>
        </div>
      </div>

      <div className="rules-editor-body">
        <div className="rules-editor-list">
          {grouped.map(([tier, items]) => (
            <div key={tier}>
              <div className="rule-tier-hd">{TIER_LABELS_FULL[tier] || tier}</div>
              {items.map((r, idx) => (
                <RulesEditorRow
                  key={r.id}
                  rule={r}
                  dest={meta.destinations[r.dest_id]}
                  selected={selectedId === r.id}
                  firing={firing === r.id}
                  count={counts[r.id] || 0}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < items.length - 1}
                  onSelect={() => setSelectedId(r.id)}
                  onToggle={(v) => toggleEnabled(r.id, v)}
                  onMove={(dir) => moveRule(r.id, dir)}
                />
              ))}
              {items.length === 0 && (
                <div className="rules-editor-empty-tier">No rules in this tier.</div>
              )}
            </div>
          ))}
        </div>

        <div className="rules-editor-form-wrap">
          {selected ? (
            <RulesEditorForm
              key={selected.id}
              rule={selected}
              meta={meta}
              saving={saving}
              onSave={(patch) => patchRule(selected.id, patch)}
              onDelete={() => deleteRule(selected.id)}
            />
          ) : (
            <div className="rules-editor-empty">
              <span className="material-symbols-outlined">rule</span>
              <p>Select a rule on the left to edit it.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RulesEditorRow({ rule, dest, selected, firing, count, canMoveUp, canMoveDown, onSelect, onToggle, onMove }) {
  return (
    <div
      className={`rules-editor-row ${selected ? 'selected' : ''} ${firing ? 'firing' : ''} ${!rule.enabled ? 'disabled' : ''}`}
      onClick={onSelect}
    >
      <div className="rules-editor-row-move" onClick={(e) => e.stopPropagation()}>
        <button className="rules-editor-move-btn" disabled={!canMoveUp} onClick={() => onMove('up')} title="Move up">
          <span className="material-symbols-outlined">arrow_upward</span>
        </button>
        <button className="rules-editor-move-btn" disabled={!canMoveDown} onClick={() => onMove('down')} title="Move down">
          <span className="material-symbols-outlined">arrow_downward</span>
        </button>
      </div>
      <div className="rules-editor-row-id">{rule.id}</div>
      <div className="rules-editor-row-body">
        <div className="rules-editor-row-name">
          {rule.name}
          {rule.kind === 'builtin' && <span className="rules-editor-builtin-tag">built-in</span>}
        </div>
        <div className="rules-editor-row-desc">
          {rule.description || '—'}
        </div>
      </div>
      <div className="rules-editor-row-dest">
        {dest ? <DestChip destId={rule.dest_id} withLabel={false} /> : rule.dest_id}
      </div>
      <div className="rules-editor-row-count" title="Submissions routed by this rule (all time)">
        {count}
      </div>
      <label className="rules-editor-toggle" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={!!rule.enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span />
      </label>
    </div>
  );
}

function RulesEditorForm({ rule, meta, saving, onSave, onDelete }) {
  const [name, setName] = useStateAdmin(rule.name);
  const [description, setDescription] = useStateAdmin(rule.description || '');
  const [tier, setTier] = useStateAdmin(rule.tier);
  const [destId, setDestId] = useStateAdmin(rule.dest_id);
  const [enabled, setEnabled] = useStateAdmin(!!rule.enabled);
  // Editable predicate state. Empty predicates become { all: [] } for the UI.
  const initialPred = rule.predicate && (Array.isArray(rule.predicate.all) || Array.isArray(rule.predicate.any))
    ? rule.predicate
    : { all: [] };
  const [combinator, setCombinator] = useStateAdmin(Array.isArray(initialPred.any) ? 'any' : 'all');
  const [conditions, setConditions] = useStateAdmin(() => {
    const list = initialPred.all || initialPred.any || [];
    // If any entries are nested groups, flatten for the UI — the AST
    // supports it but the builder deliberately stays shallow.
    return list.filter(c => c && c.field && c.op).map(c => ({ ...c }));
  });

  const undeletable = meta.undeletable instanceof Set
    ? meta.undeletable
    : new Set(meta.undeletable || []);
  const isUndeletable = undeletable.has(rule.id);

  const buildPred = () => {
    const key = combinator;
    return { [key]: conditions.map(c => ({ field: c.field, op: c.op, value: c.value })) };
  };

  const save = () => {
    const patch = {
      name, description, tier, dest_id: destId, enabled,
    };
    if (rule.kind === 'predicate') {
      patch.predicate = buildPred();
      patch.kind = 'predicate';
    }
    onSave(patch);
  };

  return (
    <div className="rules-editor-form">
      <div className="rules-editor-form-hd">
        <div className="rules-editor-form-id">{rule.id}</div>
        <div className="rules-editor-form-kind">
          {rule.kind === 'builtin' ? 'Built-in rule' : 'Editable predicate'}
        </div>
      </div>
      {rule.kind === 'builtin' && (
        <div className="rules-editor-builtin-note">
          Built-in rules have hardcoded logic (they interact with other rules, or the
          rule ID is referenced directly by the routing engine). You can still
          rename them, change their destination, toggle them on/off, and move
          them within a tier. Disabling a built-in rule removes it from
          evaluation entirely.
        </div>
      )}

      <label className="rules-editor-field">
        <span>Name</span>
        <input
          className="ing-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label className="rules-editor-field">
        <span>Description</span>
        <textarea
          className="ing-textarea"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <div className="rules-editor-field-row">
        <label className="rules-editor-field">
          <span>Tier</span>
          <select
            className="ing-input"
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            disabled={rule.kind === 'builtin'}
          >
            {meta.tiers.map(t => (
              <option key={t} value={t}>{TIER_LABELS_FULL[t] || t}</option>
            ))}
          </select>
        </label>
        <label className="rules-editor-field">
          <span>Destination when this fires</span>
          <select
            className="ing-input"
            value={destId}
            onChange={(e) => setDestId(e.target.value)}
          >
            {Object.values(meta.destinations)
              .filter(d => d.id !== 'iba')
              .map(d => (
                <option key={d.id} value={d.id}>{d.label} — {d.sub}</option>
              ))}
          </select>
        </label>
      </div>

      <div className="rules-editor-field-row">
        <label className="rules-editor-enabled-field">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>Enabled</span>
        </label>
      </div>

      {rule.kind === 'predicate' && (
        <div className="rules-editor-predicate">
          <div className="rules-editor-predicate-hd">
            <span>Conditions</span>
            <div className="seg" role="tablist">
              <button
                className={combinator === 'all' ? 'active' : ''}
                onClick={() => setCombinator('all')}
              >
                ALL (and)
              </button>
              <button
                className={combinator === 'any' ? 'active' : ''}
                onClick={() => setCombinator('any')}
              >
                ANY (or)
              </button>
            </div>
          </div>

          {conditions.length === 0 && (
            <div className="rules-editor-predicate-empty">
              No conditions — this rule will never fire. Add at least one.
            </div>
          )}

          {conditions.map((c, i) => (
            <PredicateRow
              key={i}
              condition={c}
              fields={meta.fields}
              onChange={(next) => {
                setConditions(curr => curr.map((x, j) => (i === j ? next : x)));
              }}
              onRemove={() => setConditions(curr => curr.filter((_, j) => j !== i))}
            />
          ))}

          <button
            className="rules-editor-add-cond"
            onClick={() => {
              const firstField = meta.fields[0];
              const firstOp = OPS_BY_TYPE[firstField?.type || 'string'][0];
              setConditions(curr => [
                ...curr,
                {
                  field: firstField?.id || 'premium_k',
                  op: firstOp || '==',
                  value: firstField?.type === 'number' ? 0 : '',
                },
              ]);
            }}
          >
            <span className="material-symbols-outlined">add</span>
            Add condition
          </button>
        </div>
      )}

      <div className="rules-editor-form-actions">
        <button
          className="btn grey sm"
          onClick={onDelete}
          disabled={saving || isUndeletable || rule.kind === 'builtin'}
          title={
            isUndeletable ? 'Safety-net fallback cannot be deleted' :
            rule.kind === 'builtin' ? 'Built-in rules cannot be deleted — disable them instead' :
            'Delete this rule'
          }
        >
          <span className="material-symbols-outlined">delete</span>
          DELETE
        </button>
        <div style={{ flex: 1 }} />
        <button
          className="btn primary sm"
          onClick={save}
          disabled={saving}
        >
          <span className="material-symbols-outlined">save</span>
          SAVE CHANGES
        </button>
      </div>
    </div>
  );
}

function PredicateRow({ condition, fields, onChange, onRemove }) {
  const field = fields.find(f => f.id === condition.field) || fields[0] || { id: condition.field, type: 'string', label: condition.field };
  const ops = OPS_BY_TYPE[field.type] || ['==', '!='];
  const needsValue = !['present', 'absent'].includes(condition.op);
  const isArrayValue = ['in', 'not_in'].includes(condition.op);

  const setField = (id) => {
    const f = fields.find(x => x.id === id);
    const newOps = OPS_BY_TYPE[f?.type || 'string'];
    const op = newOps.includes(condition.op) ? condition.op : newOps[0];
    let value = condition.value;
    if (f?.type === 'number' && typeof value !== 'number') value = Number(value) || 0;
    if (f?.type !== 'number' && typeof value === 'number') value = String(value);
    onChange({ field: id, op, value });
  };

  const setOp = (op) => {
    let value = condition.value;
    if (['in', 'not_in'].includes(op) && !Array.isArray(value)) {
      value = value != null && value !== '' ? [value] : [];
    } else if (!['in', 'not_in'].includes(op) && Array.isArray(value)) {
      value = value[0] ?? '';
    }
    onChange({ ...condition, op, value });
  };

  const setValue = (value) => onChange({ ...condition, value });

  return (
    <div className="predicate-row">
      <select
        className="ing-input predicate-field"
        value={condition.field}
        onChange={(e) => setField(e.target.value)}
      >
        {fields.map(f => (
          <option key={f.id} value={f.id}>{f.label}</option>
        ))}
      </select>
      <select
        className="ing-input predicate-op"
        value={condition.op}
        onChange={(e) => setOp(e.target.value)}
      >
        {ops.map(o => <option key={o} value={o}>{OP_LABELS[o] || o}</option>)}
      </select>
      {needsValue && (
        <PredicateValueInput
          field={field}
          isArray={isArrayValue}
          value={condition.value}
          onChange={setValue}
        />
      )}
      <button className="predicate-row-remove" onClick={onRemove} title="Remove condition">
        <span className="material-symbols-outlined">close</span>
      </button>
    </div>
  );
}

function PredicateValueInput({ field, isArray, value, onChange }) {
  if (field.type === 'class') {
    if (isArray) {
      const arr = Array.isArray(value) ? value : [];
      return (
        <div className="predicate-multiselect">
          {CLASS_OPTIONS.map(c => {
            const on = arr.includes(c);
            return (
              <button
                key={c}
                className={`predicate-chip ${on ? 'on' : ''}`}
                onClick={() => onChange(on ? arr.filter(x => x !== c) : [...arr, c])}
                type="button"
              >
                {c}
              </button>
            );
          })}
        </div>
      );
    }
    return (
      <select className="ing-input predicate-value" value={value || ''} onChange={(e) => onChange(e.target.value)}>
        {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    );
  }
  if (field.type === 'geo') {
    return (
      <select className="ing-input predicate-value" value={value || ''} onChange={(e) => onChange(e.target.value)}>
        {GEO_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
      </select>
    );
  }
  if (field.type === 'number') {
    if (isArray) {
      const str = Array.isArray(value) ? value.join(',') : '';
      return (
        <input
          className="ing-input predicate-value mono"
          placeholder="1, 2, 3"
          value={str}
          onChange={(e) => onChange(e.target.value.split(',').map(s => Number(s.trim())).filter(n => !Number.isNaN(n)))}
        />
      );
    }
    return (
      <input
        className="ing-input predicate-value mono"
        type="number"
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    );
  }
  // string
  if (isArray) {
    const str = Array.isArray(value) ? value.join(', ') : '';
    return (
      <input
        className="ing-input predicate-value"
        placeholder="value1, value2"
        value={str}
        onChange={(e) => onChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
      />
    );
  }
  return (
    <input
      className="ing-input predicate-value"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

Object.assign(window, { AdminScreen });
