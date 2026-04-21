// ============================================================
// Cerebro side-panel logic
//
//   - Polls /api/quotes for the most recent classifications
//   - Accepts dropped .eml / .txt files (or a pasted body) and posts
//     them to /api/ingest
//   - Cards link out to the localhost Cerebro app
// ============================================================

const API_BASE = 'http://localhost:3000';

const DESTINATIONS = {
  trade:       { label: 'xTrade',       sub: 'Open market & Facility', color: '#173F35' },
  whitespace:  { label: 'Whitespace',   sub: "Lloyd's platform",       color: '#0857C3' },
  ppl:         { label: 'PPL',          sub: "Lloyd's platform",       color: '#1A2F5C' },
  gxb:         { label: 'GXB',          sub: "Lloyd's binder",         color: '#0D6E63' },
  acturis:     { label: 'Acturis',      sub: "Non-Lloyd's",            color: '#B85C00' },
  iba:         { label: 'IBA',          sub: 'Accounts',               color: '#4B4B4B' },
  review:      { label: 'Manual review',sub: 'Needs broker',           color: '#C0392B' },
};

const $ = (sel) => document.querySelector(sel);
const els = {
  apiBadge: $('#apiBadge'),
  apiBadgeText: $('#apiBadgeText'),
  dropZone: $('#dropZone'),
  fileInput: $('#fileInput'),
  browseBtn: $('#browseBtn'),
  pasteDetails: $('#pasteDetails'),
  pasteSubject: $('#pasteSubject'),
  pasteFrom: $('#pasteFrom'),
  pasteBody: $('#pasteBody'),
  ingestPasteBtn: $('#ingestPasteBtn'),
  errorBox: $('#errorBox'),
  ingestStatus: $('#ingestStatus'),
  statusIcon: $('#statusIcon'),
  statusText: $('#statusText'),
  refreshBtn: $('#refreshBtn'),
  quotesList: $('#quotesList'),
  quoteCount: $('#quoteCount'),

  // Detail view
  detailView: $('#detailView'),
  detailRef: $('#detailRef'),
  detailAssured: $('#detailAssured'),
  detailPills: $('#detailPills'),
  detailKv: $('#detailKv'),
  detailTrace: $('#detailTrace'),
  detailReroute: $('#detailReroute'),
  detailSource: $('#detailSource'),
  backBtn: $('#backBtn'),
  detailCloseBtn: $('#detailCloseBtn'),
  viewInXTrade: $('#viewInXTrade'),
  approveSendBtn: $('#approveSendBtn'),
  sentOverlay: $('#sentOverlay'),
  sentDestLabel: $('#sentDestLabel'),
};

// Holds the quote currently being inspected in the detail view.
const detailState = { quote: null };
// Cache the latest list of quotes so the detail-view click handler can
// open without an extra fetch. Updated on every poll.
let cachedQuotes = [];

// Track the most recent quote IDs so we can highlight new ones.
const seenIds = new Set();
let pollHandle = null;

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  wireDropzone();
  wirePaste();
  els.refreshBtn.addEventListener('click', () => loadQuotes(true));
  els.backBtn.addEventListener('click', closeDetail);
  els.detailCloseBtn.addEventListener('click', closeDetail);
  els.approveSendBtn.addEventListener('click', handleApproveSend);
  wireBackgroundMessages();
  probeApi();
  loadQuotes(false);
  startPolling();
});

// Background → side panel messages (right-click "Send to Cerebro" flow).
function wireBackgroundMessages() {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg?.type) return;
    if (msg.type === 'cerebro/processing-start') {
      const isAppend = msg.mode === 'append';
      setBusy(true, isAppend ? 'Augmenting existing quote…' : 'Classifying selection from page…');
      hideError();
    } else if (msg.type === 'cerebro/quote-ready' && msg.quote) {
      const isAppend = msg.mode === 'append';
      const dest = DESTINATIONS[msg.quote.destId] || { label: msg.quote.destId };
      const statusText = isAppend
        ? `Updated ${msg.quote.assured || 'quote'} · ${formatDelta(msg.delta)}`.trim()
        : `Routed ${msg.quote.assured || 'quote'} → ${dest.label}`;
      setBusy(false, statusText, 'done');
      setTimeout(() => {
        if (els.statusIcon.classList.contains('done')) hideStatus();
      }, 4500);
      loadQuotes(true).then(() => openDetail(msg.quote));
    } else if (msg.type === 'cerebro/processing-error') {
      showError(msg.error || 'Ingest failed.');
    }
  });
}

function formatDelta(d) {
  if (!d) return '';
  const parts = [];
  if (d.prevConfidence != null && d.newConfidence != null) {
    parts.push(`confidence ${d.prevConfidence}% → ${d.newConfidence}%`);
  }
  if (d.prevCompleteness != null && d.newCompleteness != null && d.newCompleteness !== d.prevCompleteness) {
    parts.push(`completeness ${d.prevCompleteness}% → ${d.newCompleteness}%`);
  }
  return parts.join(', ') || 'no change';
}

// Pause polling when the side panel is hidden, resume when shown.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }
  } else {
    probeApi();
    loadQuotes(true);
    startPolling();
  }
});

function startPolling() {
  if (pollHandle) return;
  pollHandle = setInterval(() => loadQuotes(true), 5000);
}

// ---------- API ----------
async function probeApi() {
  try {
    const r = await fetch(`${API_BASE}/api/health`);
    if (!r.ok) throw new Error(String(r.status));
    const h = await r.json();
    els.apiBadge.classList.add('online');
    els.apiBadge.classList.remove('offline');
    els.apiBadgeText.textContent = `live · ${h.mode === 'live' ? 'claude' : 'mock'}`;
    hideError();
  } catch {
    els.apiBadge.classList.remove('online');
    els.apiBadge.classList.add('offline');
    els.apiBadgeText.textContent = 'backend down';
    showError(`Cerebro backend not reachable at ${API_BASE}. Run \`npm start\` in /server.`);
  }
}

async function loadQuotes(highlightNew) {
  try {
    const r = await fetch(`${API_BASE}/api/quotes`);
    if (!r.ok) throw new Error(String(r.status));
    const { quotes } = await r.json();
    renderQuotes(quotes, highlightNew);
    return quotes;
  } catch {
    if (els.quotesList.childElementCount === 0 || els.quotesList.querySelector('.empty-state')) {
      els.quotesList.innerHTML = '<div class="empty-state"><span class="muted">Backend offline — no recent quotes.</span></div>';
    }
    return [];
  }
}

// ---------- Render ----------
function renderQuotes(quotes, highlightNew) {
  cachedQuotes = quotes;
  els.quoteCount.textContent = `${quotes.length} quote${quotes.length === 1 ? '' : 's'}`;

  // If a detail view is open, refresh it in place so the trace / reroute
  // state stays in sync after the user does something.
  if (detailState.quote) {
    const updated = quotes.find(q => q.id === detailState.quote.id);
    if (updated) renderDetail(updated);
  }

  if (!quotes.length) {
    els.quotesList.innerHTML = '<div class="empty-state"><span class="muted">No quotes yet — drop an email above.</span></div>';
    return;
  }

  const newIds = new Set();
  if (highlightNew) {
    for (const q of quotes) {
      if (!seenIds.has(q.id)) newIds.add(q.id);
    }
  }
  for (const q of quotes) seenIds.add(q.id);

  els.quotesList.innerHTML = '';
  for (const q of quotes) {
    els.quotesList.appendChild(renderQuoteCard(q, newIds.has(q.id)));
  }
}

function renderQuoteCard(q, isNew) {
  const a = document.createElement('a');
  a.className = 'quote-card' + (isNew ? ' new' : '');
  a.href = '#';
  a.addEventListener('click', (e) => {
    e.preventDefault();
    openDetail(q);
  });

  const dest = DESTINATIONS[q.destId] || { label: q.destId || '—', sub: '', color: '#666' };
  const conf = q.confidence ?? 0;
  const confLevel = conf >= 85 ? 'high' : conf >= 72 ? 'med' : 'low';
  const time = formatTime(q.minsAgo, q.createdAt);

  a.innerHTML = `
    <div class="qc-row1">
      <span class="qc-assured">${esc(q.assured || '—')}</span>
      <span class="qc-time">${esc(time)}</span>
    </div>
    <div class="qc-row2">
      <span class="class-pill">${esc(q.cls || '—')}</span>
      <span class="dest-chip">
        <span class="swatch" style="background:${dest.color}">${esc(dest.label.slice(0, 2).toUpperCase())}</span>
        <span>${esc(dest.label)}</span>
        <span class="sub">${esc(dest.sub)}</span>
      </span>
    </div>
    <div class="qc-row3">
      <span class="qc-broker">${esc(q.broker || '')}</span>
      <span class="qc-conf conf ${confLevel}">
        <span class="conf-bar"><span style="width:${conf}%"></span></span>
        ${conf}%
      </span>
    </div>`;
  return a;
}

function formatTime(minsAgo, createdAt) {
  if (typeof minsAgo === 'number') {
    if (minsAgo < 1) return 'NOW';
    if (minsAgo < 60) return `${minsAgo}M AGO`;
    const h = Math.floor(minsAgo / 60);
    if (h < 24) return `${h}H AGO`;
    return `${Math.floor(h / 24)}D AGO`;
  }
  if (createdAt) {
    return new Date(createdAt).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return '';
}

// ============================================================
// Detail view — full quote inspection (mirrors drawer.jsx)
// ============================================================
const STATE_PILLS = {
  submitted:  { label: 'Submitted',     color: '#0857C3', bg: '#E7F0FE' },
  bound:      { label: 'Bound',         color: '#0DA20D', bg: '#E3F5E3' },
  processing: { label: 'Processing',    color: '#7A3FBF', bg: '#F2EBFB' },
};

function openDetail(quote) {
  detailState.quote = quote;
  renderDetail(quote);
  els.detailView.classList.remove('hide');
}
function closeDetail() {
  detailState.quote = null;
  els.detailView.classList.add('hide');
}

function renderDetail(q) {
  // Header
  const ago = formatTime(q.minsAgo, q.createdAt);
  els.detailRef.textContent = `${q.ref || ''} · received ${ago}`;
  els.detailAssured.textContent = q.assured || '—';

  // Pills
  const dest = DESTINATIONS[q.destId] || { label: q.destId || '—', sub: '', color: '#666' };
  const state = STATE_PILLS[q.state] || STATE_PILLS.submitted;
  const conf = q.confidence ?? 0;
  const confLevel = conf >= 85 ? 'high' : conf >= 72 ? 'med' : 'low';
  els.detailPills.innerHTML = `
    <span class="detail-pill class-pill">${esc(q.cls || '—')}</span>
    <span class="detail-pill dest-chip">
      <span class="swatch" style="background:${dest.color}">${esc(dest.label.slice(0, 2).toUpperCase())}</span>
      <span>${esc(dest.label)}</span>
      ${dest.sub ? `<span class="sub" style="color:var(--dark-gray);font-family:var(--font-mono);font-size:8px;text-transform:uppercase;letter-spacing:0.06em;margin-left:2px;">${esc(dest.sub)}</span>` : ''}
    </span>
    <span class="detail-pill state-pill" style="color:${state.color};background:${state.bg};border-color:${state.color};">
      <span class="dot" style="background:${state.color}"></span>${esc(state.label)}
    </span>
    <span class="detail-pill conf ${confLevel}">
      <span class="conf-bar"><span style="width:${conf}%"></span></span>${conf}%
    </span>
  `;

  // KV grid — only render rows that have a real value
  const kv = [
    ['Assured',           q.assured],
    ['Domicile',          q.domicileCountry],
    ['Industry',          q.industry],
    ['Class',             q.cls + (q.subClass ? ` · ${q.subClass}` : '')],
    ['Geography',         (q.geography || []).join(', ')],
    ['TIV',               q.tivUsd ? `USD ${q.tivUsd.toLocaleString()}` : null,                 'mono'],
    ['Placement',         q.placementType],
    ['Inception',         q.inceptionDate, 'mono'],
    ['Premium est.',      q.premiumK ? `USD ${(q.premiumK * 1000).toLocaleString()}` : null,    'mono'],
    ['Expiring carrier',  q.expiringCarrier],
    ['Binder',            q.binderId, 'mono'],
    ['5yr loss ratio',    q.lossRatio5yr != null ? `${Math.round(q.lossRatio5yr * 100)}%${q.yearsOfLosses ? ` (${q.yearsOfLosses}y)` : ''}` : null],
    ['Producing broker',  q.broker],
    ['Reference',         q.ref, 'mono'],
  ];
  els.detailKv.innerHTML = kv
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v, cls]) => `<dt>${esc(k)}</dt><dd${cls ? ` class="${cls}"` : ''}>${esc(v)}</dd>`)
    .join('');

  // Trace — synthesize narrative steps similar to drawer.jsx
  const ruleHit = (q.trace || []).find(t => t.fired) || { id: q.ruleId };
  const sourceLabel = q.email?.sourceType === 'pdf' ? 'PDF'
                    : q.email?.sourceType === 'docx' ? 'Word document'
                    : q.email?.sourceType === 'image' ? 'image'
                    : 'email';
  const sizeLabel = q.bucket?.label || (q.premiumK >= 1500 ? 'Large' : q.premiumK >= 250 ? 'Medium' : 'Small');
  const failedClass = '';
  const lastIcon = '<svg viewBox="0 0 24 24"><path d="M9 16.2l-3.5-3.5L4 14.2l5 5 11-11-1.5-1.5z"/></svg>';
  const finalLine =
    q.state === 'bound'         ? `Bound in <b>${esc(dest.label)}</b>`
    : q.state === 'processing'  ? `Processing in <b>${esc(dest.label)}</b>`
    : q.destId === 'review'     ? `Routed to <b>${esc(dest.label)}</b> for manual review`
                                : `Submitted to <b>${esc(dest.label)}</b> — awaiting broker`;
  els.detailTrace.innerHTML = `
    <div class="step">
      <svg viewBox="0 0 24 24"><path d="M9 16.2l-3.5-3.5L4 14.2l5 5 11-11-1.5-1.5z"/></svg>
      Parsed ${esc(sourceLabel)} from <b style="margin-left:4px">${esc(q.broker || 'upload')}</b>
    </div>
    <div class="step">
      <svg viewBox="0 0 24 24"><path d="M9 16.2l-3.5-3.5L4 14.2l5 5 11-11-1.5-1.5z"/></svg>
      Extracted insured, class, size → <b style="margin-left:4px">${esc(q.cls)} · ${esc(sizeLabel)}</b>
    </div>
    <div class="step">
      <svg viewBox="0 0 24 24"><path d="M9 16.2l-3.5-3.5L4 14.2l5 5 11-11-1.5-1.5z"/></svg>
      Matched rule <b style="margin-left:4px" class="mono">${esc(ruleHit.id || q.ruleId || '—')}</b>
    </div>
    <div class="step ${failedClass}">${lastIcon}${finalLine}</div>
  `;

  // Re-route grid
  els.detailReroute.innerHTML = '';
  Object.entries(DESTINATIONS)
    .filter(([k]) => k !== 'iba')
    .forEach(([k, d]) => {
      const isCurrent = k === q.destId;
      const btn = document.createElement('button');
      btn.className = 'opt' + (isCurrent ? ' current' : '');
      btn.disabled = isCurrent;
      btn.dataset.dest = k;
      btn.innerHTML = `
        <span class="swatch" style="background:${d.color}">${esc(d.label.slice(0, 2).toUpperCase())}</span>
        <span class="info">
          <div class="name">${esc(d.label)}</div>
          <div class="sub">${esc(d.sub)}</div>
        </span>
      `;
      if (!isCurrent) btn.addEventListener('click', () => doReroute(k, btn));
      els.detailReroute.appendChild(btn);
    });

  // Source preview
  els.detailSource.innerHTML = '';
  els.detailSource.appendChild(renderSourcePreview(q));

  // OPEN IN XTRADE link — only surface when this quote was actually routed
  // to Trade+. UAT deep link points at the current xTrade UAT environment.
  if (q.destId === 'trade') {
    els.viewInXTrade.classList.remove('hide');
    els.viewInXTrade.href = 'https://strgxtradecdnuatwe01.z6.web.core.windows.net/0cdb2730-12f2-4905-ad7b-3e4c95da173c';
    els.viewInXTrade.title = `Open ${q.ref || q.assured} in xTrade (UAT)`;
  } else {
    els.viewInXTrade.classList.add('hide');
    els.viewInXTrade.removeAttribute('href');
  }
}

// ============================================================
// Approve send — POST /api/quotes/:id/accept, then show a tick-and-label
// confirmation overlay. The server auto-advances state submitted → bound
// → processing; we just need the "sent" moment to feel decisive.
// ============================================================
async function handleApproveSend() {
  const q = detailState.quote;
  if (!q) return;
  const destLabel = (DESTINATIONS[q.destId] || {}).label || q.destId || '—';

  // Optimistic UI: lock the button, show the overlay immediately.
  els.approveSendBtn.disabled = true;
  showSentOverlay(destLabel);

  try {
    const r = await fetch(`${API_BASE}/api/quotes/${q.id}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        finalTerms: {
          premium_k: q.premiumK,
          carrier: q.expiringCarrier || 'TBC',
          inception_date: q.inceptionDate || null,
          notes: 'Approved from sidebar',
        },
        actor: 'broker',
      }),
    });
    if (!r.ok) throw new Error(`API ${r.status}`);
    const { quote } = await r.json();
    detailState.quote = quote;
    renderDetail(quote);
    loadQuotes(false);
  } catch (err) {
    hideSentOverlay();
    els.approveSendBtn.disabled = false;
    showError(`Approve failed: ${err.message}`);
  }
}

function showSentOverlay(destLabel) {
  els.sentDestLabel.textContent = destLabel || '—';
  els.sentOverlay.classList.remove('hide');
  // Re-trigger the CSS animations by forcing a reflow + class toggle.
  els.sentOverlay.classList.remove('playing');
  // eslint-disable-next-line no-unused-expressions
  els.sentOverlay.offsetWidth;
  els.sentOverlay.classList.add('playing');
  clearTimeout(showSentOverlay._t);
  showSentOverlay._t = setTimeout(hideSentOverlay, 2800);
}
function hideSentOverlay() {
  els.sentOverlay.classList.remove('playing');
  els.sentOverlay.classList.add('hide');
}

async function doReroute(destId, btn) {
  if (!detailState.quote) return;
  els.detailReroute.querySelectorAll('.opt').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  try {
    const r = await fetch(`${API_BASE}/api/quotes/${detailState.quote.id}/forward`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destId }),
    });
    if (!r.ok) throw new Error(`API ${r.status}`);
    const { quote } = await r.json();
    detailState.quote = quote;
    renderDetail(quote);
    loadQuotes(false);
  } catch (err) {
    showError(`Re-route failed: ${err.message}`);
  }
}

// ============================================================
// Source preview chromes — picks the right one for this quote.
// Mirrors drawer.jsx's SourcePreview but adapted for narrow panel.
// ============================================================
function renderSourcePreview(q) {
  const sourceType = q.email?.sourceType || 'email';
  if (sourceType === 'pdf')   return renderPdfPreview(q);
  if (sourceType === 'docx')  return renderDocxPreview(q);
  if (sourceType === 'image') return renderImagePreview(q);
  return renderOutlookPreview(q);
}

const ICON_OPEN = '<svg viewBox="0 0 24 24"><path d="M14 3v2h3.6L9 13.6 10.4 15 19 6.4V10h2V3zM19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7z"/></svg>';
const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';

function renderPdfPreview(q) {
  const url = q.email?.sourceUrl ? `${API_BASE}${q.email.sourceUrl}` : null;
  const filename = q.email?.attachments?.[0] || q.email?.subject || 'document.pdf';
  const wrap = document.createElement('div');
  wrap.className = 'src-frame';
  wrap.innerHTML = `
    <div class="src-titlebar">
      <span class="src-app-mark pdf">PDF</span>
      <span class="src-filename">${esc(filename)}</span>
      ${url ? `<a class="src-titlebar-btn" href="${url}" target="_blank" rel="noopener" title="Open in new tab">${ICON_OPEN}</a>` : ''}
      ${url ? `<a class="src-titlebar-btn" href="${url}" download title="Download">${ICON_DOWNLOAD}</a>` : ''}
    </div>
    ${url
      ? `<iframe class="src-pdf-iframe" src="${url}#toolbar=0&navpanes=0" title="${esc(filename)}"></iframe>`
      : `<div style="background:#525659;color:#fff;padding:24px;text-align:center;font-size:11px;opacity:0.7;">PDF unavailable.</div>`}
  `;
  return wrap;
}

function renderDocxPreview(q) {
  const url = q.email?.sourceUrl ? `${API_BASE}${q.email.sourceUrl}` : null;
  const filename = q.email?.attachments?.[0] || q.email?.subject || 'document.docx';
  const wrap = document.createElement('div');
  wrap.className = 'src-frame';
  wrap.innerHTML = `
    <div class="src-titlebar src-docx-titlebar">
      <span class="src-app-mark docx">W</span>
      <span class="src-filename">${esc(filename)}</span>
      ${url ? `<a class="src-titlebar-btn" href="${url}" download title="Download .docx">${ICON_DOWNLOAD}</a>` : ''}
    </div>
    <div class="src-docx-body">
      <div class="src-docx-page">
        <div class="src-docx-header">${esc(filename)}</div>
        <div class="src-docx-empty">
          <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>
          <p><b>Word document</b> — stored on the server.</p>
          <p style="opacity:0.7;">Cerebro extracted the structured fields above.</p>
          ${url ? `<a class="btn primary sm" href="${url}" download>${ICON_DOWNLOAD}OPEN IN WORD</a>` : ''}
        </div>
      </div>
    </div>
  `;
  return wrap;
}

function renderImagePreview(q) {
  const url = q.email?.sourceUrl ? `${API_BASE}${q.email.sourceUrl}` : null;
  const filename = q.email?.attachments?.[0] || q.email?.subject || 'image';
  const wrap = document.createElement('div');
  wrap.className = 'src-frame';
  wrap.innerHTML = `
    <div class="src-titlebar">
      <span class="src-app-mark image">IMG</span>
      <span class="src-filename">${esc(filename)}</span>
      ${url ? `<a class="src-titlebar-btn" href="${url}" target="_blank" rel="noopener">${ICON_OPEN}</a>` : ''}
    </div>
    <div class="src-image-body">
      ${url ? `<img class="src-image-img" src="${url}" alt="${esc(filename)}" />`
            : `<div style="color:#fff;font-size:11px;opacity:0.7;padding:24px;">Image unavailable.</div>`}
    </div>
  `;
  return wrap;
}

function renderOutlookPreview(q) {
  const e = q.email || {
    from: `${q.broker?.toLowerCase().replace(/ /g, '') || 'underwriting'}@example.com`,
    to: 'triage@howden.com',
    subject: q.subject || `${q.cls} — ${q.assured}`,
    body: '(no message body)',
    receivedAt: q.createdAt,
    attachments: [],
  };
  const initials = (e.from.split('@')[0].split(/[.\- _]/).slice(0, 2).map(s => s[0]).join('') || 'B').toUpperCase();
  const fromName = e.from.split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const date = new Date(e.receivedAt || Date.now()).toLocaleString(undefined, {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  const wrap = document.createElement('div');
  wrap.className = 'src-frame src-outlook';
  wrap.innerHTML = `
    <div class="src-outlook-ribbon">
      <span class="src-outlook-tab active">Home</span>
      <span class="src-outlook-tab">View</span>
      <span style="flex:1"></span>
      <span class="src-outlook-ribbon-btn"><svg viewBox="0 0 24 24"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>Reply</span>
      <span class="src-outlook-ribbon-btn"><svg viewBox="0 0 24 24"><path d="M14 5l7 7-7 7v-4c-5 0-8.5 1.6-11 5 1-5 4-10 11-11V5z"/></svg>Forward</span>
    </div>
    <div class="src-outlook-subject-row">
      <div class="src-outlook-subject">${esc(e.subject || '(no subject)')}</div>
      <div class="src-outlook-folder">Inbox › Cerebro triage</div>
    </div>
    <div class="src-outlook-envelope">
      <div class="src-outlook-avatar">${esc(initials)}</div>
      <div>
        <div class="src-outlook-from-row">
          <span class="src-outlook-from-name">${esc(fromName)}</span>
          <span class="src-outlook-from-email">&lt;${esc(e.from)}&gt;</span>
          <span class="src-outlook-date">${esc(date)}</span>
        </div>
        <div class="src-outlook-to"><b>To:</b> ${esc(e.to || 'triage@howden.com')}</div>
      </div>
    </div>
    <div class="src-outlook-body">${esc(e.body || '')}</div>
  `;
  return wrap;
}

// ---------- Drop zone ----------
function wireDropzone() {
  const dz = els.dropZone;

  // Click on dropzone (excluding the inner button) → open file picker
  dz.addEventListener('click', (e) => {
    if (e.target === els.browseBtn || els.browseBtn.contains(e.target)) return;
    els.fileInput.click();
  });
  els.browseBtn.addEventListener('click', (e) => { e.stopPropagation(); els.fileInput.click(); });
  els.fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
    els.fileInput.value = '';
  });

  // Keyboard: Enter / Space opens picker
  dz.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.fileInput.click(); }
  });

  // Drag & drop
  ['dragenter', 'dragover'].forEach(ev =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.dataTransfer?.types?.includes('Files')) dz.classList.add('dragover');
    })
  );
  ['dragleave', 'dragend'].forEach(ev =>
    dz.addEventListener(ev, (e) => {
      if (e.relatedTarget && dz.contains(e.relatedTarget)) return;
      dz.classList.remove('dragover');
    })
  );
  dz.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    dz.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });
}

// Decide whether a dropped file is a text-style email or a binary document.
// Binary docs are uploaded to Cerebro as a base64 attachment so the drawer
// can render the actual file later — never read them as text.
function classifyDroppedFile(file) {
  const name = file.name || '';
  const ext = (name.split('.').pop() || '').toLowerCase();
  const type = file.type || '';
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) return 'image';
  if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    type === 'application/msword' ||
    ext === 'docx' || ext === 'doc'
  ) return 'docx';
  if (ext === 'eml' || type === 'message/rfc822' || ext === 'txt' || type.startsWith('text/')) return 'email';
  return 'unknown';
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error || new Error('FileReader failed'));
    fr.onload = () => {
      const result = String(fr.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    fr.readAsDataURL(file);
  });
}

const MIME_BY_EXT = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
};

async function handleFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  hideError();

  for (const file of files) {
    if (/\.msg$/i.test(file.name)) {
      showError(`${file.name}: Outlook .msg isn't supported. Save the message as .eml first.`);
      continue;
    }
    const kind = classifyDroppedFile(file);
    if (kind === 'unknown') {
      showError(`${file.name}: unsupported file type. Drop a .eml, .txt, .pdf, .docx or image.`);
      continue;
    }

    try {
      if (kind === 'email') {
        setBusy(true, `Parsing ${file.name}…`);
        const text = await file.text();
        const parsed = parseEmailText(text);
        if (!parsed.body && !text.trim()) throw new Error('File is empty');
        setStatus(`Ingesting ${file.name}…`);
        await ingest({
          from: parsed.from || `${file.name.replace(/\.[^.]+$/, '')}@upload`,
          subject: parsed.subject || file.name.replace(/\.[^.]+$/, ''),
          body: parsed.body || text.trim(),
        });
      } else {
        // pdf / docx / image — send the bytes to Cerebro as an attachment.
        setBusy(true, `Reading ${file.name}…`);
        const dataBase64 = await readAsBase64(file);
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        const mime = file.type || MIME_BY_EXT[ext] || 'application/octet-stream';
        setStatus(`Ingesting ${file.name}…`);
        await ingest({
          from: `${file.name.replace(/\.[^.]+$/, '')}@upload`,
          subject: file.name,
          body: '',  // server allows empty body when attachment is present
          attachment: { name: file.name, type: mime, dataBase64 },
        });
      }
    } catch (err) {
      setBusy(false);
      showError(`${file.name}: ${err.message || err}`);
    }
  }
}

// ---------- Paste fallback ----------
function wirePaste() {
  const update = () => {
    const has = els.pasteBody.value.trim().length > 0
                && els.pasteSubject.value.trim().length > 0;
    els.ingestPasteBtn.disabled = !has;
  };
  els.pasteBody.addEventListener('input', update);
  els.pasteSubject.addEventListener('input', update);

  els.ingestPasteBtn.addEventListener('click', async () => {
    hideError();
    setBusy(true, 'Ingesting…');
    try {
      await ingest({
        from: els.pasteFrom.value.trim() || 'paste@cerebro',
        subject: els.pasteSubject.value.trim(),
        body: els.pasteBody.value.trim(),
      });
      els.pasteBody.value = '';
      els.pasteSubject.value = '';
      els.pasteFrom.value = '';
      update();
    } catch (err) {
      setBusy(false);
      showError(err.message || String(err));
    }
  });
}

// ---------- Ingest ----------
async function ingest({ from, subject, body, attachment }) {
  const payload = { from, to: 'triage@howden.com', subject, body };
  if (attachment) payload.attachment = attachment;
  const r = await fetch(`${API_BASE}/api/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`API ${r.status}: ${text.slice(0, 200)}`);
  }
  const { quote } = await r.json();
  const dest = DESTINATIONS[quote.destId] || { label: quote.destId };
  setBusy(false, `Routed ${quote.assured || 'quote'} → ${dest.label}`, 'done');
  // Refresh the list so the new quote appears with a highlight
  await loadQuotes(true);
  // Auto-fade the success status after a couple of seconds
  setTimeout(() => {
    if (els.statusIcon.classList.contains('done')) hideStatus();
  }, 3500);
}

// ---------- RFC 822 / forwarded-email parser ----------
// Mirrors the helper in /ingest.jsx. Handles .eml exports from Outlook,
// Apple Mail, Gmail "Show original" and plain forwarded bodies.
function parseEmailText(text) {
  const sepIdx = text.search(/\r?\n\r?\n/);
  let headerBlock = '', body = text;
  if (sepIdx > 0 && sepIdx < 6000) {
    headerBlock = text.slice(0, sepIdx);
    body = text.slice(sepIdx).replace(/^\r?\n\r?\n/, '');
  }
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, ' ');
  const headers = {};
  unfolded.split(/\r?\n/).forEach(line => {
    const m = line.match(/^([A-Za-z-]+):\s*(.*)$/);
    if (m) headers[m[1].toLowerCase()] = m[2];
  });
  const fromRaw = headers['from'] || '';
  const fromMatch = fromRaw.match(/<([^>]+)>/) || fromRaw.match(/([^\s<>]+@[^\s<>]+)/);
  const from = fromMatch ? fromMatch[1] : fromRaw;
  const subject = headers['subject'] || '';
  const boundaryMatch = (headers['content-type'] || '').match(/boundary="?([^";\s]+)"?/);
  if (boundaryMatch) {
    const re = new RegExp('--' + boundaryMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const parts = body.split(re);
    const textPart = parts.find(p => /content-type:\s*text\/plain/i.test(p));
    if (textPart) {
      const innerSep = textPart.search(/\r?\n\r?\n/);
      if (innerSep > 0) body = textPart.slice(innerSep).replace(/^\r?\n\r?\n/, '').trim();
    }
  }
  return { from, subject, body: body.trim() };
}

// ---------- UI helpers ----------
function setBusy(busy, text, kind = 'spin') {
  els.dropZone.classList.toggle('busy', busy);
  if (busy) {
    els.ingestStatus.classList.remove('hide');
    els.statusText.textContent = text || 'Working…';
    els.statusIcon.className = 'status-icon spin';
  } else if (text) {
    els.ingestStatus.classList.remove('hide');
    els.statusText.textContent = text;
    els.statusIcon.className = 'status-icon ' + kind;
  } else {
    hideStatus();
  }
}
function setStatus(text) {
  els.statusText.textContent = text;
}
function hideStatus() { els.ingestStatus.classList.add('hide'); }

function showError(msg) {
  els.errorBox.textContent = msg;
  els.errorBox.classList.remove('hide');
  setBusy(false, msg, 'error');
}
function hideError() { els.errorBox.classList.add('hide'); }

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
