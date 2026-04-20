// Cerebro extension service worker.
//
//   - Toolbar action click → open the side panel
//   - Right-click on selected text → two flows:
//       (a) "Send to Cerebro (new quote)" → POST /api/ingest
//       (b) "Append to existing Cerebro quote ▶ {assured} · {cls} · {pct}%"
//           → POST /api/quotes/:id/augment, Claude re-extracts on the
//             combined corpus and the merged result is saved in place.
//   - Toast on the active tab tracks progress; side panel jumps straight
//     to the new/updated quote's detail view.

const API_BASE = 'http://localhost:3000';
const MENU_NEW = 'cerebro-new';
const MENU_APPEND_ROOT = 'cerebro-append-root';
const MENU_APPEND_PREFIX = 'cerebro-append-';
const MENU_APPEND_EMPTY = 'cerebro-append-empty';
const MENU_REFRESH_ALARM = 'cerebro-refresh-menus';

let ingestSeq = 0;

// Toolbar icon → side panel
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.warn('[cerebro] setPanelBehavior failed:', err));

// Build the menus on install + on every browser startup, then keep them
// fresh on a 1-minute alarm so the "append to" submenu reflects what's
// actually in the queue. Also rebuild after a successful ingest/augment.
chrome.runtime.onInstalled.addListener(() => {
  rebuildContextMenus();
  chrome.alarms.create(MENU_REFRESH_ALARM, { periodInMinutes: 1 });
});
chrome.runtime.onStartup.addListener(() => {
  rebuildContextMenus();
  chrome.alarms.create(MENU_REFRESH_ALARM, { periodInMinutes: 1 });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === MENU_REFRESH_ALARM) rebuildContextMenus();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const text = (info.selectionText || '').trim();
  if (!text || !tab?.id) return;
  if (info.menuItemId === MENU_NEW) {
    await handleSelectionIngest({ text, tab, frameId: info.frameId, mode: 'new' });
  } else if (typeof info.menuItemId === 'string' && info.menuItemId.startsWith(MENU_APPEND_PREFIX)) {
    const quoteId = Number(info.menuItemId.slice(MENU_APPEND_PREFIX.length));
    if (!Number.isFinite(quoteId)) return;
    await handleSelectionIngest({ text, tab, frameId: info.frameId, mode: 'append', quoteId });
  }
});

// Toast button clicks (e.g. "View") flow back through here from toast.js.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== 'cerebro/toast-action') return;
  if (msg.action === 'view') openSidePanelForActiveTab(sender.tab);
});

// ============================================================
// Context-menu construction
// ============================================================
async function rebuildContextMenus() {
  await new Promise((resolve) => chrome.contextMenus.removeAll(resolve));

  chrome.contextMenus.create({
    id: MENU_NEW,
    title: 'Send to Cerebro (new quote)',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: MENU_APPEND_ROOT,
    title: 'Append selection to Cerebro quote',
    contexts: ['selection'],
  });

  // Pull recent quotes the broker is most likely to want to enrich:
  // anything still in 'submitted' state and not yet locked. Top 8 by recency.
  let candidates = [];
  try {
    const r = await fetch(`${API_BASE}/api/quotes`);
    if (r.ok) {
      const { quotes } = await r.json();
      candidates = (quotes || [])
        .filter((q) => q.state === 'submitted' && !q.locked)
        .slice(0, 8);
    }
  } catch {
    // Backend down — show the placeholder below
  }

  if (!candidates.length) {
    chrome.contextMenus.create({
      id: MENU_APPEND_EMPTY,
      parentId: MENU_APPEND_ROOT,
      title: '(no incomplete quotes — start a new one above)',
      contexts: ['selection'],
      enabled: false,
    });
    return;
  }

  for (const q of candidates) {
    const conf = q.confidence ?? 0;
    const title = `${q.assured || '?'} · ${q.cls || '?'} · ${conf}%`;
    chrome.contextMenus.create({
      id: MENU_APPEND_PREFIX + q.id,
      parentId: MENU_APPEND_ROOT,
      title: title.slice(0, 80), // Chrome trims long menu titles anyway
      contexts: ['selection'],
    });
  }
}

// ============================================================
// Selection-ingest flow (new + append)
// ============================================================
async function handleSelectionIngest({ text, tab, frameId, mode, quoteId }) {
  const isAppend = mode === 'append';
  const toastId = `cerebro-${++ingestSeq}`;

  openSidePanelForActiveTab(tab);
  const ok = await ensureToastScript(tab.id);

  if (ok) {
    sendToast(tab.id, frameId, {
      type: 'toast/show',
      state: {
        id: toastId,
        kind: 'processing',
        title: isAppend ? 'Cerebro · augmenting quote' : 'Cerebro · classifying selection',
        badge: 'Working',
        snippet: text.slice(0, 240),
      },
    });
  }
  notifySidePanel({
    type: 'cerebro/processing-start',
    toastId,
    snippet: text.slice(0, 240),
    mode,
    targetQuoteId: quoteId,
  });

  const pageUrl = tab.url || '(unknown)';
  const subject = inferSubjectFromText(text) || `Selection from ${tab.title || 'page'}`;
  const url = isAppend
    ? `${API_BASE}/api/quotes/${quoteId}/augment`
    : `${API_BASE}/api/ingest`;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `selection@${safeHost(pageUrl)}`,
        to: 'triage@howden.com',
        subject,
        body: text,
      }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`API ${resp.status}: ${err.slice(0, 160)}`);
    }
    const payload = await resp.json();
    const { quote, delta } = payload;

    if (ok) {
      const message = isAppend
        ? buildAugmentMessage(quote, delta)
        : `${quote.assured || 'Quote'} · ${quote.cls || ''}${quote.confidence != null ? ` · ${quote.confidence}% confidence` : ''}`;
      sendToast(tab.id, frameId, {
        type: 'toast/update',
        state: {
          id: toastId,
          kind: 'success',
          title: isAppend ? 'Cerebro · updated quote' : 'Cerebro · routed',
          badge: isAppend ? 'Augmented' : 'Classified',
          message,
          dest: { id: quote.destId },
          actions: [
            { id: 'view', label: 'View', kind: 'primary' },
            { id: 'dismiss', label: 'Dismiss', kind: 'ghost' },
          ],
          autoDismissMs: 9000,
        },
      });
    }

    notifySidePanel({ type: 'cerebro/quote-ready', quote, mode, delta });

    // The submenu shows current confidence values — they just changed.
    rebuildContextMenus();
  } catch (err) {
    console.warn('[cerebro] ingest failed:', err);
    if (ok) {
      sendToast(tab.id, frameId, {
        type: 'toast/update',
        state: {
          id: toastId,
          kind: 'error',
          title: 'Cerebro · failed',
          badge: 'Error',
          message: err.message || String(err),
          actions: [{ id: 'dismiss', label: 'Dismiss', kind: 'ghost' }],
          autoDismissMs: 6000,
        },
      });
    }
    notifySidePanel({ type: 'cerebro/processing-error', toastId, error: err.message || String(err) });
  }
}

function buildAugmentMessage(quote, delta) {
  const confLine = (delta?.prevConfidence != null && delta?.newConfidence != null)
    ? `confidence ${delta.prevConfidence}% → ${delta.newConfidence}%`
    : null;
  const completeLine = (delta?.prevCompleteness != null && delta?.newCompleteness != null && delta.newCompleteness !== delta.prevCompleteness)
    ? `completeness ${delta.prevCompleteness}% → ${delta.newCompleteness}%`
    : null;
  const parts = [quote.assured || 'Quote'];
  if (confLine) parts.push(confLine);
  if (completeLine) parts.push(completeLine);
  return parts.join(' · ');
}

// ============================================================
// Helpers
// ============================================================
async function ensureToastScript(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['toast.js'] });
    return true;
  } catch (err) {
    console.warn('[cerebro] toast injection failed (page may be restricted):', err.message);
    return false;
  }
}

function sendToast(tabId, frameId, msg) {
  const opts = (typeof frameId === 'number') ? { frameId } : undefined;
  chrome.tabs.sendMessage(tabId, msg, opts).catch((err) => {
    console.debug('[cerebro] sendToast skipped:', err?.message);
  });
}

function notifySidePanel(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

async function openSidePanelForActiveTab(tab) {
  if (!tab?.windowId) return;
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (err) {
    console.debug('[cerebro] sidePanel.open skipped:', err?.message);
  }
}

function safeHost(url) {
  try { return new URL(url).hostname || 'page'; } catch { return 'page'; }
}

function inferSubjectFromText(text) {
  const m = text.match(/^\s*(?:subject:|re:|fw:|fwd:)\s*(.{3,140})/im);
  return m ? m[1].trim().split(/\r?\n/)[0] : null;
}
