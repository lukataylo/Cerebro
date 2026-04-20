/* global React, DestChip, StatePill, ClassPill, ConfidenceMeter, SizeViz, MonoTime */
const { useState: useStateDrw, useEffect: useEffectDrw, useMemo: useMemoDrw } = React;

// Where the backend lives. The app may be served from the same origin
// (npm start in /server), or opened from file:// — same fallback as api.js.
const SOURCE_HOST = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';
const sourceUrlFor = (u) => u ? (u.startsWith('http') ? u : SOURCE_HOST + u) : null;

function humanFileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

// ============================================================
// PDF preview — Adobe-Acrobat-style chrome wrapping Chrome's native
// PDF viewer. The actual file is fetched from /uploads/<file> which
// the server statically mounts.
// ============================================================
function PdfPreview({ quote }) {
  const url = sourceUrlFor(quote.email?.sourceUrl);
  const filename = quote.email?.attachments?.[0] || quote.email?.subject || 'document.pdf';
  return (
    <div className="drawer-section">
      <div className="doc-frame pdf-frame">
        <div className="doc-titlebar">
          <span className="doc-app-mark pdf-mark">PDF</span>
          <span className="doc-filename">{filename}</span>
          <div className="doc-titlebar-spacer" />
          {url && (
            <a className="doc-titlebar-btn" href={url} target="_blank" rel="noopener" title="Open in new tab">
              <span className="material-symbols-outlined">open_in_new</span>
            </a>
          )}
          {url && (
            <a className="doc-titlebar-btn" href={url} download title="Download">
              <span className="material-symbols-outlined">download</span>
            </a>
          )}
        </div>
        <div className="doc-toolbar">
          <span className="doc-toolbar-pages">Page 1</span>
          <div className="doc-toolbar-spacer" />
          <span className="doc-toolbar-zoom">Fit width</span>
        </div>
        <div className="doc-body pdf-body">
          {url
            ? <iframe className="pdf-iframe" src={url + '#toolbar=0&navpanes=0'} title={filename} />
            : <div className="doc-empty">PDF unavailable — backend storage missing.</div>
          }
        </div>
      </div>
    </div>
  );
}

function DocxPreview({ quote }) {
  const url = sourceUrlFor(quote.email?.sourceUrl);
  const filename = quote.email?.attachments?.[0] || quote.email?.subject || 'document.docx';
  return (
    <div className="drawer-section">
      <div className="doc-frame docx-frame">
        <div className="doc-titlebar docx-titlebar">
          <span className="doc-app-mark docx-mark">W</span>
          <span className="doc-filename">{filename}</span>
          <div className="doc-titlebar-spacer" />
          {url && (
            <a className="doc-titlebar-btn" href={url} download title="Download .docx">
              <span className="material-symbols-outlined">download</span>
            </a>
          )}
        </div>
        <div className="doc-toolbar docx-toolbar">
          <span className="docx-tab active">Home</span>
          <span className="docx-tab">Insert</span>
          <span className="docx-tab">Layout</span>
          <span className="docx-tab">References</span>
          <span className="docx-tab">Review</span>
        </div>
        <div className="doc-body docx-body">
          <div className="docx-page">
            <div className="docx-header">{filename}</div>
            <div className="docx-empty">
              <span className="material-symbols-outlined">description</span>
              <p><b>Word document</b> — the slip / MRC / SOV is stored on the server.</p>
              <p>Cerebro extracted the structured fields above without an in-browser preview.</p>
              {url && (
                <a className="btn primary sm" href={url} download>
                  <span className="material-symbols-outlined">download</span>OPEN IN WORD
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImagePreview({ quote }) {
  const url = sourceUrlFor(quote.email?.sourceUrl);
  const filename = quote.email?.attachments?.[0] || quote.email?.subject || 'image';
  return (
    <div className="drawer-section">
      <div className="doc-frame image-frame">
        <div className="doc-titlebar image-titlebar">
          <span className="doc-app-mark image-mark">IMG</span>
          <span className="doc-filename">{filename}</span>
          <div className="doc-titlebar-spacer" />
          {url && (
            <a className="doc-titlebar-btn" href={url} target="_blank" rel="noopener" title="Open in new tab">
              <span className="material-symbols-outlined">open_in_new</span>
            </a>
          )}
        </div>
        <div className="doc-body image-body">
          {url
            ? <img className="image-img" src={url} alt={filename} />
            : <div className="doc-empty">Image unavailable.</div>
          }
        </div>
      </div>
    </div>
  );
}

function OutlookEmailView({ quote }) {
  const email = quote.email;
  const e = email || {
    from: `underwriting@${quote.broker?.toLowerCase().replace(/ /g, '') || 'example'}.com`,
    to: 'triage@howden.com',
    subject: quote.subject || `${quote.cls} — ${quote.assured}`,
    body: `Dear underwriter,\n\nPlease find attached our submission for the ${quote.cls?.toLowerCase()} renewal of ${quote.assured}. Inception 01 Jan 2026, estimated premium USD ${quote.bucket?.value},000. Slip, MRC and claims history attached.\n\nKind regards,\n${quote.broker} placement team`,
    receivedAt: quote.createdAt || new Date().toISOString(),
    attachments: [],
    synthetic: true,
  };

  const initials = (e.from.split('@')[0].split(/[.\- _]/).slice(0, 2).map(s => s[0]).join('') || 'B').toUpperCase();
  const received = new Date(e.receivedAt || Date.now());
  const dateStr = received.toLocaleString(undefined, { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="drawer-section">
      <div className="outlook-frame">
        <div className="outlook-titlebar">
          <svg className="outlook-logo" viewBox="0 0 32 32" aria-hidden="true">
            <rect x="2" y="6" width="28" height="20" rx="2" fill="#0078D4" />
            <path d="M3 8 l13 9 13-9" stroke="#fff" strokeWidth="2" fill="none" strokeLinejoin="round" />
          </svg>
          <span className="outlook-app-name">Outlook</span>
          <span className="outlook-titlebar-sep">·</span>
          <span className="outlook-source-note">
            Ingested from {e.synthetic ? 'reconstructed preview' : `inbound email to ${e.to}`}
          </span>
        </div>
        <div className="outlook-subject-row">
          <div className="outlook-subject">{e.subject}</div>
        </div>
        <div className="outlook-envelope">
          <div className="outlook-avatar">{initials}</div>
          <div className="outlook-envelope-main">
            <div className="outlook-from-row">
              <span className="outlook-from-name">{e.from.split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
              <span className="outlook-from-email">&lt;{e.from}&gt;</span>
              <span className="outlook-date">{dateStr}</span>
            </div>
            <div className="outlook-to-row">
              <span className="outlook-to-label">To:</span> {e.to}
              {e.synthetic && <span className="outlook-synthetic">· reconstructed preview</span>}
            </div>
          </div>
        </div>
        {e.attachments && e.attachments.length > 0 && (
          <div className="outlook-attachments">
            {e.attachments.map((a, i) => {
              const name = typeof a === 'string' ? a : a.name;
              const url = sourceUrlFor(quote.email?.sourceUrl);
              const clickable = !!url && i === 0;
              return (
                <a
                  key={i}
                  className={`outlook-attachment${clickable ? ' clickable' : ''}`}
                  href={clickable ? url : undefined}
                  target={clickable ? '_blank' : undefined}
                  rel={clickable ? 'noopener' : undefined}
                  onClick={clickable ? undefined : (ev) => ev.preventDefault()}
                >
                  <span className="material-symbols-outlined">description</span>
                  <div>
                    <div className="att-name">{name}</div>
                    <div className="att-meta">{clickable ? 'Click to open' : 'Attached'}</div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
        <div className="outlook-body">
          {e.body.split('\n').map((line, i) => (
            line.trim() === '' ? <br key={i} /> : <p key={i}>{line}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

function SourcePreview({ quote }) {
  const sourceType = quote.email?.sourceType || 'email';
  if (sourceType === 'pdf')   return <PdfPreview quote={quote} />;
  if (sourceType === 'docx')  return <DocxPreview quote={quote} />;
  if (sourceType === 'image') return <ImagePreview quote={quote} />;
  return <OutlookEmailView quote={quote} />;
}

// ============================================================
// Decision panel — primary + fallback route + 5-dim scorecard
// ============================================================

const SCORE_DIMENSIONS = [
  { key: 'eligibility',   label: 'Eligibility',         hint: 'Hard rules pass' },
  { key: 'clientFit',     label: 'Client fit',          hint: 'Coverage / limits / geography' },
  { key: 'pbind',         label: 'Probability of bind', hint: 'Carrier appetite + losses' },
  { key: 'economicValue', label: 'Economic value',      hint: 'MDI + commission' },
  { key: 'speed',         label: 'Speed / SLA',         hint: 'Expected time to quote' },
];

function RouteCard({ destId, ruleId, variant, confidence }) {
  const dest = window.DESTINATIONS[destId];
  if (!dest) return null;
  const rule = ruleId ? window.RULES.find(r => r.id === ruleId) : null;
  return (
    <div className={`route-card route-${variant}`}>
      <div className="route-card-top">
        <span className="route-card-kind">{variant === 'primary' ? 'Primary' : 'Fallback'}</span>
        {variant === 'primary' && confidence != null && (
          <span className="route-card-confidence mono">conf {confidence}%</span>
        )}
      </div>
      <div className="route-card-dest">
        <span className="route-card-dot" style={{ background: dest.color || '#888' }} />
        <div className="route-card-label">
          {dest.label}
          <span className="route-card-sub">{dest.sub}</span>
        </div>
      </div>
      <div className="route-card-rule">
        <span className="mono">{ruleId || '—'}</span>
        {rule && <span className="route-card-rule-name">· {rule.name}</span>}
      </div>
    </div>
  );
}

function Scorecard({ score }) {
  if (!score) return null;
  return (
    <div className="scorecard">
      {SCORE_DIMENSIONS.map(dim => {
        const s = score[dim.key];
        if (!s) return null;
        const tone = s.score >= 80 ? 'hi' : s.score >= 55 ? 'mid' : 'lo';
        return (
          <div key={dim.key} className="scorecard-row">
            <div className="scorecard-label">{dim.label}</div>
            <div className="scorecard-bar">
              <div className={`scorecard-fill tone-${tone}`} style={{ width: `${Math.max(4, Math.min(100, s.score))}%` }} />
            </div>
            <div className={`scorecard-score tone-${tone}`}>{s.score}</div>
            <div className="scorecard-reason">{s.reason}</div>
          </div>
        );
      })}
    </div>
  );
}

function DecisionPanel({ quote }) {
  return (
    <div className="drawer-section">
      <div className="dec-hd">
        <div className="dec-eyebrow">Routing decision</div>
        {quote.confidence != null && (
          <div className="dec-confidence mono">Confidence <b>{quote.confidence}%</b></div>
        )}
      </div>
      <div className="route-cards">
        <RouteCard destId={quote.destId} ruleId={quote.ruleId} variant="primary" confidence={quote.confidence} />
        {quote.fallbackDestId && (
          <RouteCard destId={quote.fallbackDestId} ruleId={quote.fallbackRuleId} variant="fallback" />
        )}
      </div>
      <div className="dec-subhd">Why this route</div>
      <Scorecard score={quote.score} />
    </div>
  );
}

// ============================================================
// Lifecycle pill — submitted → bound → processing
// ============================================================
function LifecycleBar({ state }) {
  const STEPS = [
    { id: 'submitted',  label: 'Submitted' },
    { id: 'bound',      label: 'Bound' },
    { id: 'processing', label: 'Processing' },
  ];
  const reachedIdx = Math.max(0, STEPS.findIndex(s => s.id === state));
  const currentIdx = reachedIdx === -1 ? 0 : reachedIdx;
  return (
    <div className="lifecycle-bar">
      {STEPS.map((s, i) => {
        const cls = i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'pending';
        return (
          <React.Fragment key={s.id}>
            <div className={`lifecycle-step ${cls}`}>
              <span className="lifecycle-dot">
                {i < currentIdx
                  ? <span className="material-symbols-outlined">check</span>
                  : i === currentIdx
                    ? <span className="lifecycle-pulse" />
                    : null}
              </span>
              <span className="lifecycle-label">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`lifecycle-connector ${i < currentIdx ? 'done' : ''}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ============================================================
// Audit log — per-quote chronological events
// ============================================================
const EVENT_META = {
  ingested:   { icon: 'mark_email_unread', label: 'Ingested',        actorLabel: 'Cerebro' },
  extracted:  { icon: 'bolt',              label: 'Extracted',       actorLabel: 'Claude' },
  routed:     { icon: 'route',             label: 'Routed',          actorLabel: 'Cerebro' },
  accepted:   { icon: 'task_alt',          label: 'Accepted',        actorLabel: 'Broker' },
  bound:      { icon: 'lock',              label: 'Bound',           actorLabel: 'System' },
  processing: { icon: 'sync',              label: 'Processing',      actorLabel: 'System' },
  overridden: { icon: 'swap_horiz',        label: 'Overridden',      actorLabel: 'Broker' },
  rfi_sent:   { icon: 'forward_to_inbox',  label: 'RFI sent',        actorLabel: 'Broker' },
  augmented:  { icon: 'auto_fix_high',     label: 'Augmented',       actorLabel: 'Broker' },
};

function fmtAuditTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
}

function renderAuditDetail(ev) {
  const d = ev.detail || {};
  if (ev.event === 'ingested') {
    return <>From <b>{d.from}</b> · <span className="mono">{d.source}</span>{d.attachments?.length ? ` · ${d.attachments.length} attachment${d.attachments.length === 1 ? '' : 's'}` : ''}</>;
  }
  if (ev.event === 'extracted') {
    const filled = d.fields ? Object.keys(d.fields).length : 0;
    return <>{filled} fields · confidence <b>{d.confidence}%</b> — {d.reasoning}</>;
  }
  if (ev.event === 'routed') {
    const pDest = window.DESTINATIONS[d.primary?.destId];
    const fDest = window.DESTINATIONS[d.fallback?.destId];
    return <>Primary <b>{pDest?.label || d.primary?.destId}</b> <span className="mono">({d.primary?.ruleId})</span> · Fallback <b>{fDest?.label || d.fallback?.destId}</b></>;
  }
  if (ev.event === 'accepted') {
    const dest = window.DESTINATIONS[d.destId];
    return <>Accepted primary route · <b>{dest?.label || d.destId}</b></>;
  }
  if (ev.event === 'bound') {
    const t = d.finalTerms || {};
    return <>Final terms locked: <b className="mono">{window.fmtPremium(t.premium_k)}</b> · {t.carrier} · {t.inception_date || 'TBC'}</>;
  }
  if (ev.event === 'processing') {
    return <>{d.note || 'Downstream distribution started'}</>;
  }
  if (ev.event === 'overridden') {
    const fromDest = window.DESTINATIONS[d.from?.destId];
    const toDest = window.DESTINATIONS[d.to?.destId];
    return <>{fromDest?.label || d.from?.destId} → <b>{toDest?.label || d.to?.destId}</b> · reason: <i>{d.reason || '—'}</i></>;
  }
  if (ev.event === 'rfi_sent') {
    return <>Requested: <b>{(d.fields || []).join(', ') || '(free-text)'}</b>{d.notes ? ` · ${d.notes}` : ''}</>;
  }
  if (ev.event === 'augmented') {
    return <>Confidence {d.prevConfidence}% → <b>{d.newConfidence}%</b>{d.addedAttachment ? ` · added ${d.addedAttachment}` : ''}</>;
  }
  return null;
}

function AuditLogSection({ entries, loading }) {
  return (
    <div className="drawer-section">
      <h4>Audit log</h4>
      {loading && <div className="audit-empty">Loading…</div>}
      {!loading && entries.length === 0 && (
        <div className="audit-empty">No events yet.</div>
      )}
      {!loading && entries.length > 0 && (
        <div className="audit-list">
          {entries.map(ev => {
            const meta = EVENT_META[ev.event] || { icon: 'circle', label: ev.event, actorLabel: ev.actor };
            return (
              <div key={ev.id} className={`audit-item audit-${ev.event}`}>
                <div className="audit-ts mono">{fmtAuditTime(ev.ts)}</div>
                <div className="audit-icon">
                  <span className="material-symbols-outlined">{meta.icon}</span>
                </div>
                <div className="audit-main">
                  <div className="audit-hd">
                    <span className="audit-event">{meta.label}</span>
                    <span className="audit-actor">· {meta.actorLabel}</span>
                  </div>
                  <div className="audit-detail">{renderAuditDetail(ev)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Actions — Accept / Override / Request more data
// ============================================================

const RFI_FIELD_OPTIONS = [
  'Loss run (5yr)',
  'SOV / schedule of values',
  'Expiring carrier contact',
  'Inception confirmation',
  'Prior policy wording',
  'Sanctions clearance',
];

function AcceptPanel({ quote, onCancel, onSubmit, busy }) {
  const [premium, setPremium] = useStateDrw(quote.premiumK || 0);
  const [carrier, setCarrier] = useStateDrw(quote.expiringCarrier || '');
  const [inception, setInception] = useStateDrw(quote.inceptionDate || '');
  const [notes, setNotes] = useStateDrw('');
  return (
    <div className="action-panel">
      <div className="action-panel-hd">
        <span className="material-symbols-outlined">task_alt</span>
        <div>
          <div className="action-panel-title">Accept & bind</div>
          <div className="action-panel-sub">Locks the record. Final terms become read-only.</div>
        </div>
      </div>
      <div className="action-panel-grid">
        <label>Final premium (USD k)</label>
        <input className="ing-input mono" type="number" value={premium} onChange={(e) => setPremium(Number(e.target.value))} />
        <label>Lead carrier</label>
        <input className="ing-input" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="e.g. AXA XL" />
        <label>Inception</label>
        <input className="ing-input mono" value={inception} onChange={(e) => setInception(e.target.value)} placeholder="YYYY-MM-DD" />
        <label>Notes (optional)</label>
        <textarea className="ing-textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="action-panel-ft">
        <button className="btn ghost" onClick={onCancel} disabled={busy}>CANCEL</button>
        <button className="btn primary" disabled={busy} onClick={() => onSubmit({ premium_k: premium, carrier, inception_date: inception, notes })}>
          {busy ? <><span className="material-symbols-outlined spin">progress_activity</span>BINDING…</> : <><span className="material-symbols-outlined">lock</span>CONFIRM BIND</>}
        </button>
      </div>
    </div>
  );
}

function OverridePanel({ quote, onCancel, onSubmit, busy }) {
  const destOptions = Object.entries(window.DESTINATIONS).filter(([k]) => k !== quote.destId && k !== 'iba');
  const [destId, setDestId] = useStateDrw(quote.fallbackDestId || destOptions[0]?.[0] || null);
  const [reason, setReason] = useStateDrw('');
  return (
    <div className="action-panel">
      <div className="action-panel-hd">
        <span className="material-symbols-outlined">swap_horiz</span>
        <div>
          <div className="action-panel-title">Override route</div>
          <div className="action-panel-sub">Cerebro will learn from this correction.</div>
        </div>
      </div>
      <div className="reroute-grid">
        {destOptions.map(([k, d]) => (
          <button key={k} className={`reroute-opt ${destId === k ? 'active' : ''}`} onClick={() => setDestId(k)}>
            <span className="swatch" style={{ background: d.color || '#888' }}>{d.label.slice(0, 2).toUpperCase()}</span>
            <div>
              <div className="name">{d.label}</div>
              <div className="sub">{d.sub}</div>
            </div>
          </button>
        ))}
      </div>
      <div className="action-panel-grid">
        <label>Reason for override</label>
        <textarea className="ing-textarea" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. known relationship with named carrier" />
      </div>
      <div className="action-panel-ft">
        <button className="btn ghost" onClick={onCancel} disabled={busy}>CANCEL</button>
        <button className="btn primary" disabled={busy || !destId} onClick={() => onSubmit({ destId, reason })}>
          {busy ? <><span className="material-symbols-outlined spin">progress_activity</span>SAVING…</> : <><span className="material-symbols-outlined">swap_horiz</span>CONFIRM OVERRIDE</>}
        </button>
      </div>
    </div>
  );
}

function RfiPanel({ onCancel, onSubmit, busy }) {
  const [selected, setSelected] = useStateDrw([]);
  const [notes, setNotes] = useStateDrw('');
  const toggle = (f) => setSelected(s => s.includes(f) ? s.filter(x => x !== f) : [...s, f]);
  return (
    <div className="action-panel">
      <div className="action-panel-hd">
        <span className="material-symbols-outlined">forward_to_inbox</span>
        <div>
          <div className="action-panel-title">Request more data</div>
          <div className="action-panel-sub">Drafts a reply to the producing broker. State stays submitted.</div>
        </div>
      </div>
      <div className="rfi-chips">
        {RFI_FIELD_OPTIONS.map(f => (
          <button key={f} className={`rfi-chip ${selected.includes(f) ? 'active' : ''}`} onClick={() => toggle(f)}>
            {f}
          </button>
        ))}
      </div>
      <div className="action-panel-grid">
        <label>Additional notes</label>
        <textarea className="ing-textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything specific you need…" />
      </div>
      <div className="action-panel-ft">
        <button className="btn ghost" onClick={onCancel} disabled={busy}>CANCEL</button>
        <button className="btn primary" disabled={busy || (!selected.length && !notes.trim())} onClick={() => onSubmit({ fields: selected, notes })}>
          {busy ? <><span className="material-symbols-outlined spin">progress_activity</span>SENDING…</> : <><span className="material-symbols-outlined">send</span>SEND RFI</>}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Detail drawer
// ============================================================

function QuoteDrawer({ quote: incomingQuote, onClose, onQuoteUpdated, role, onTuneRule }) {
  const [mode, setMode] = useStateDrw(null); // null | 'accept' | 'override' | 'rfi'
  const [busy, setBusy] = useStateDrw(false);
  const [audit, setAudit] = useStateDrw([]);
  const [auditLoading, setAuditLoading] = useStateDrw(false);
  const [err, setErr] = useStateDrw(null);
  // Keep the last-known quote so the drawer can play its slide-out
  // transition on close instead of unmounting instantly.
  const [lastQuote, setLastQuote] = useStateDrw(incomingQuote);
  useEffectDrw(() => { if (incomingQuote) setLastQuote(incomingQuote); }, [incomingQuote]);
  const isOpen = !!incomingQuote;
  const quote = incomingQuote || lastQuote;

  useEffectDrw(() => {
    if (!incomingQuote?.id) return;
    setMode(null); setErr(null);
    let cancelled = false;
    (async () => {
      setAuditLoading(true);
      try {
        const entries = window.cerebroAPI ? await window.cerebroAPI.quoteAudit(incomingQuote.id) : [];
        if (!cancelled) setAudit(entries);
      } catch (e) {
        if (!cancelled) setAudit([]);
      } finally {
        if (!cancelled) setAuditLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [incomingQuote?.id]);

  if (!quote) return null;

  const dest = window.DESTINATIONS[quote.destId];
  const locked = !!quote.locked;
  const sourceUrl = sourceUrlFor(quote.email?.sourceUrl);
  // Only Trade+ has a live deep-link today (UAT environment). Other
  // destinations fall back to the source document preview.
  const xtradeUrl = quote.destId === 'trade'
    ? 'https://strgxtradecdnuatwe01.z6.web.core.windows.net/0cdb2730-12f2-4905-ad7b-3e4c95da173c'
    : null;
  const openSource = () => {
    if (xtradeUrl) {
      window.open(xtradeUrl, '_blank', 'noopener');
      return;
    }
    if (sourceUrl) {
      window.open(sourceUrl, '_blank', 'noopener');
    } else {
      const host = document.querySelector('.drawer-body');
      const target = host?.querySelector('.outlook-frame, .doc-frame');
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  const handleTuneRule = () => {
    if (onTuneRule && quote.ruleId) onTuneRule(quote.ruleId);
    onClose?.();
  };

  async function handleAccept(finalTerms) {
    setBusy(true); setErr(null);
    try {
      const updated = await window.cerebroAPI.accept(quote.id, finalTerms);
      const entries = await window.cerebroAPI.quoteAudit(quote.id);
      setAudit(entries);
      onQuoteUpdated?.(updated);
      setMode(null);
      // Re-poll audit after auto-advance to processing completes
      setTimeout(async () => {
        try {
          const latest = await window.cerebroAPI.quoteAudit(quote.id);
          setAudit(latest);
          const fresh = await window.cerebroAPI.quote(quote.id);
          onQuoteUpdated?.(fresh);
        } catch {}
      }, 3200);
    } catch (e) {
      setErr(e.message || 'Accept failed');
    } finally {
      setBusy(false);
    }
  }
  async function handleOverride({ destId, reason }) {
    setBusy(true); setErr(null);
    try {
      const updated = await window.cerebroAPI.override(quote.id, destId, reason);
      const entries = await window.cerebroAPI.quoteAudit(quote.id);
      setAudit(entries);
      onQuoteUpdated?.(updated);
      setMode(null);
    } catch (e) {
      setErr(e.message || 'Override failed');
    } finally {
      setBusy(false);
    }
  }
  async function handleRfi({ fields, notes }) {
    setBusy(true); setErr(null);
    try {
      const updated = await window.cerebroAPI.rfi(quote.id, fields, notes);
      const entries = await window.cerebroAPI.quoteAudit(quote.id);
      setAudit(entries);
      onQuoteUpdated?.(updated);
      setMode(null);
    } catch (e) {
      setErr(e.message || 'RFI failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={`drawer-backdrop ${isOpen ? 'open' : ''}`} onClick={onClose} />
      <aside className={`drawer ${isOpen ? 'open' : ''}`}>
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
          {/* Lifecycle */}
          <div className="drawer-section">
            <LifecycleBar state={quote.state} />
            {locked && quote.finalTerms && (
              <div className="lifecycle-terms">
                <span className="material-symbols-outlined">lock</span>
                Locked · {window.fmtPremium(quote.finalTerms.premium_k)} · {quote.finalTerms.carrier} · inception {quote.finalTerms.inception_date || 'TBC'}
              </div>
            )}
          </div>

          {/* Routing decision + scorecard */}
          <DecisionPanel quote={quote} />

          {/* Action panels (inline) */}
          {role === 'broker' && !locked && mode === 'accept' && (
            <div className="drawer-section">
              <AcceptPanel quote={quote} busy={busy} onCancel={() => setMode(null)} onSubmit={handleAccept} />
              {err && <div className="action-err">{err}</div>}
            </div>
          )}
          {role === 'broker' && !locked && mode === 'override' && (
            <div className="drawer-section">
              <OverridePanel quote={quote} busy={busy} onCancel={() => setMode(null)} onSubmit={handleOverride} />
              {err && <div className="action-err">{err}</div>}
            </div>
          )}
          {role === 'broker' && !locked && mode === 'rfi' && (
            <div className="drawer-section">
              <RfiPanel busy={busy} onCancel={() => setMode(null)} onSubmit={handleRfi} />
              {err && <div className="action-err">{err}</div>}
            </div>
          )}

          {/* Extracted fields */}
          <div className="drawer-section">
            <h4>Extracted fields</h4>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <ClassPill cls={quote.cls} />
              <DestChip destId={quote.destId} />
              {quote.hatEligible && (
                <span className="hat-tag hat-tag-sm" title="HAT eligible — Howden's own follow capacity">
                  <span className="material-symbols-outlined">workspace_premium</span>
                  HAT
                </span>
              )}
              <ConfidenceMeter value={quote.confidence} />
            </div>
            <dl className="kv-grid">
              <dt>Assured</dt><dd>{quote.assured}</dd>
              {quote.domicileCountry && <><dt>Domicile</dt><dd className="mono">{quote.domicileCountry}</dd></>}
              {quote.industry && <><dt>Industry</dt><dd>{quote.industry}</dd></>}
              <dt>Class</dt><dd>{quote.cls}{quote.subClass ? <span style={{ color: 'var(--fg-2)', fontWeight: 400 }}> · {quote.subClass}</span> : null}</dd>
              {quote.geography?.length > 0 && <><dt>Geography</dt><dd className="mono">{quote.geography.join(', ')}</dd></>}
              {quote.tivUsd != null && <><dt>TIV</dt><dd className="mono">USD {Number(quote.tivUsd).toLocaleString()}</dd></>}
              <dt>Placement</dt><dd>{(quote.placementType || 'new_business').replace(/_/g, ' ')}</dd>
              {quote.inceptionDate && <><dt>Inception</dt><dd className="mono">{quote.inceptionDate}</dd></>}
              <dt>Premium est.</dt><dd className="mono">USD {(quote.bucket.value * 1000).toLocaleString()} <span style={{ color: 'var(--fg-2)' }}>· {quote.bucket.label} · {window.fmtPremium(quote.bucket.value)}</span></dd>
              {quote.expiringCarrier && <><dt>Expiring carrier</dt><dd>{quote.expiringCarrier}</dd></>}
              {quote.binderId && <><dt>Binder</dt><dd className="mono">{quote.binderId}</dd></>}
              {quote.lossRatio5yr != null && (
                <><dt>5yr loss ratio</dt>
                <dd className="mono" style={{ color: quote.lossRatio5yr > 1.5 ? 'var(--status-negative)' : quote.lossRatio5yr > 0.8 ? 'var(--neutral-amber)' : 'var(--status-positive)' }}>
                  {Math.round(quote.lossRatio5yr * 100)}%{quote.yearsOfLosses ? ` (${quote.yearsOfLosses}y)` : ''}
                </dd></>
              )}
              <dt>Producing broker</dt><dd>{quote.broker}</dd>
              <dt>Reference</dt><dd className="mono">{quote.ref}</dd>
            </dl>
          </div>

          {/* Full audit log */}
          <AuditLogSection entries={audit} loading={auditLoading} />

          {/* Original source preview */}
          <SourcePreview quote={quote} />
        </div>

        <div className="drawer-ft">
          {role === 'broker' ? (
            locked ? (
              <>
                <span className="drawer-ft-locked">
                  <span className="material-symbols-outlined">lock</span>
                  Locked — structured data is read-only
                </span>
                <button
                  className="btn ghost"
                  style={{ marginLeft: 'auto' }}
                  onClick={openSource}
                  title={xtradeUrl ? 'Open submission in xTrade' : sourceUrl ? 'Open source document' : 'Scroll to source preview'}
                >
                  <span className="material-symbols-outlined">open_in_new</span>
                  {xtradeUrl ? 'OPEN IN XTRADE' : `VIEW IN ${dest?.label.toUpperCase() || '—'}`}
                </button>
              </>
            ) : mode ? (
              <span className="drawer-ft-hint">Complete the form above to continue.</span>
            ) : (
              <>
                <button className="btn primary" onClick={() => setMode('accept')}>
                  <span className="material-symbols-outlined">task_alt</span>ACCEPT &amp; BIND
                </button>
                <button className="btn grey" onClick={() => setMode('override')}>
                  <span className="material-symbols-outlined">swap_horiz</span>OVERRIDE
                </button>
                <button className="btn ghost" onClick={() => setMode('rfi')}>
                  <span className="material-symbols-outlined">forward_to_inbox</span>REQUEST DATA
                </button>
              </>
            )
          ) : (
            <>
              <button
                className="btn grey"
                onClick={handleTuneRule}
                disabled={!quote.ruleId}
                title={quote.ruleId ? `Open rules engine at ${quote.ruleId}` : 'No rule fired'}
              >
                <span className="material-symbols-outlined">edit</span>TUNE RULE
              </button>
              <button
                className="btn ghost"
                style={{ marginLeft: 'auto' }}
                onClick={openSource}
                title={sourceUrl ? 'Open source document in new tab' : 'Scroll to source preview'}
              >
                <span className="material-symbols-outlined">open_in_new</span>
                OPEN {quote.email?.sourceType === 'pdf' ? 'PDF'
                  : quote.email?.sourceType === 'docx' ? 'DOC'
                  : quote.email?.sourceType === 'image' ? 'IMAGE'
                  : 'EMAIL'}
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

Object.assign(window, { QuoteDrawer });
