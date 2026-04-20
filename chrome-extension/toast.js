// Cerebro toast — injected on demand by background.js into the active tab
// when the user picks "Send to Cerebro" from the right-click menu.
//
// Idempotent: re-injection is a no-op. The toast lives in a shadow root so
// the host page's CSS can't bleed in (and we can't bleed out).

(() => {
  if (window.__cerebroToastReady) return;
  window.__cerebroToastReady = true;

  const DESTINATIONS = {
    trade:       { label: 'Trade+',       sub: 'Open market & Facility', color: '#173F35' },
    whitespace:  { label: 'Whitespace',   sub: "Lloyd's platform",       color: '#0857C3' },
    ppl:         { label: 'PPL',          sub: "Lloyd's platform",       color: '#1A2F5C' },
    gxb:         { label: 'GXB',          sub: "Lloyd's",         color: '#0D6E63' },
    acturis:     { label: 'Acturis',      sub: "Non-Lloyd's",     color: '#B85C00' },
    iba:         { label: 'IBA',          sub: 'Accounts',        color: '#4B4B4B' },
    review:      { label: 'Manual review',sub: 'Needs broker',    color: '#C0392B' },
  };

  const ICON_CLOSE = '<svg viewBox="0 0 24 24"><path d="M19 6.4L17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"/></svg>';

  // Mount the host once and reuse for all subsequent toasts on this page.
  const host = document.createElement('div');
  host.id = '__cerebro-toast-host';
  host.style.all = 'initial';
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  const cssLink = document.createElement('link');
  cssLink.rel = 'stylesheet';
  cssLink.href = chrome.runtime.getURL('toast.css');
  shadow.appendChild(cssLink);

  // Track the current toast element + its auto-dismiss timer so updates
  // don't leak timers and re-show animates correctly.
  let currentToast = null;
  let dismissTimer = null;

  function clearDismiss() {
    if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }
  }

  function buildToast(state) {
    const el = document.createElement('div');
    el.className = `toast ${state.kind}`;
    el.dataset.toastId = state.id;
    el.innerHTML = `
      <div class="stripe"></div>
      <div class="body">
        <div class="mark">C</div>
        <div class="main">
          <div class="title">
            ${state.kind === 'processing' ? '<span class="spinner"></span>' : ''}
            <span>${esc(state.title || 'Cerebro')}</span>
            ${state.badge ? `<span class="badge">${esc(state.badge)}</span>` : ''}
          </div>
          ${state.message ? `<div class="message">${esc(state.message)}</div>` : ''}
          ${state.snippet ? `<div class="snippet">${esc(state.snippet)}</div>` : ''}
          ${state.dest ? renderDestRow(state.dest) : ''}
          ${(state.actions && state.actions.length) ? renderActions(state.actions) : ''}
        </div>
        <button class="close" aria-label="Dismiss">${ICON_CLOSE}</button>
      </div>
    `;

    el.querySelector('.close').addEventListener('click', () => dismiss());
    el.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        chrome.runtime.sendMessage({ type: 'cerebro/toast-action', action, toastId: state.id });
        // Most actions implicitly dismiss the toast
        if (action === 'view' || action === 'dismiss') dismiss();
      });
    });

    return el;
  }

  function renderDestRow(dest) {
    const d = DESTINATIONS[dest.id] || { label: dest.id, sub: '', color: '#666' };
    return `
      <div class="dest-row">
        <span class="dest-swatch" style="background:${d.color}">${esc(d.label.slice(0, 2).toUpperCase())}</span>
        <span class="dest-label">${esc(d.label)}</span>
        <span class="dest-sub">${esc(d.sub)}</span>
      </div>
    `;
  }

  function renderActions(actions) {
    return `
      <div class="actions">
        ${actions.map(a => `<button class="btn ${a.kind || 'ghost'}" data-action="${esc(a.id)}">${esc(a.label)}</button>`).join('')}
      </div>
    `;
  }

  function show(state) {
    clearDismiss();
    if (currentToast) currentToast.remove();
    currentToast = buildToast(state);
    shadow.appendChild(currentToast);
    // Trigger transition
    requestAnimationFrame(() => currentToast.classList.add('in'));
    if (state.autoDismissMs) {
      dismissTimer = setTimeout(dismiss, state.autoDismissMs);
    }
  }

  function update(state) {
    if (!currentToast || currentToast.dataset.toastId !== state.id) {
      show(state);
      return;
    }
    clearDismiss();
    const next = buildToast(state);
    next.classList.add('in');
    currentToast.replaceWith(next);
    currentToast = next;
    if (state.autoDismissMs) {
      dismissTimer = setTimeout(dismiss, state.autoDismissMs);
    }
  }

  function dismiss() {
    clearDismiss();
    if (!currentToast) return;
    const t = currentToast;
    t.classList.remove('in');
    setTimeout(() => { if (t.parentElement) t.remove(); }, 220);
    currentToast = null;
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // Background sends 'toast/show' / 'toast/update' / 'toast/dismiss' messages
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg?.type) return;
    if (msg.type === 'toast/show')    show(msg.state);
    if (msg.type === 'toast/update')  update(msg.state);
    if (msg.type === 'toast/dismiss') dismiss();
    sendResponse?.({ ok: true });
  });
})();
