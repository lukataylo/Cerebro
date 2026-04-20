// Cerebro API client. Detects whether the backend is reachable; if not, the
// app gracefully falls back to the seeded in-browser simulator in data.js.

(function () {
  const isFileProtocol = window.location.protocol === 'file:';
  const base = isFileProtocol ? 'http://localhost:3000' : '';

  async function json(path, opts = {}) {
    const r = await fetch(base + path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!r.ok) throw new Error(`${path} → ${r.status}`);
    return r.json();
  }

  const api = {
    base,
    async health() { return json('/api/health'); },
    async rules() { return json('/api/rules'); },
    async quotes() { return (await json('/api/quotes')).quotes; },
    async quote(id) { return (await json(`/api/quotes/${id}`)).quote; },
    async samples() { return (await json('/api/samples')).samples; },
    async ingest(email) { return (await json('/api/ingest', { method: 'POST', body: email })).quote; },
    async ingestSample(index) {
      return (await json('/api/ingest-sample', { method: 'POST', body: { index } })).quote;
    },
    async forward(id, destId) {
      return (await json(`/api/quotes/${id}/forward`, { method: 'POST', body: { destId } })).quote;
    },
    async accept(id, finalTerms, actor = 'broker') {
      return (await json(`/api/quotes/${id}/accept`, { method: 'POST', body: { finalTerms, actor } })).quote;
    },
    async override(id, destId, reason, actor = 'broker') {
      return (await json(`/api/quotes/${id}/override`, { method: 'POST', body: { destId, reason, actor } })).quote;
    },
    async rfi(id, fields, notes, actor = 'broker') {
      return (await json(`/api/quotes/${id}/rfi`, { method: 'POST', body: { fields, notes, actor } })).quote;
    },
    async quoteAudit(id) { return (await json(`/api/quotes/${id}/audit`)).entries; },
    async auditAll()     { return (await json('/api/audit')).entries; },

    // Rules engine CRUD — used by the admin Rules tab.
    async rulesList()    { return json('/api/rules'); },
    async ruleUpdate(id, patch) {
      return (await json(`/api/rules/${id}`, { method: 'PUT', body: patch })).rule;
    },
    async ruleCreate(payload) {
      return (await json('/api/rules', { method: 'POST', body: payload })).rule;
    },
    async ruleDelete(id) {
      return json(`/api/rules/${id}`, { method: 'DELETE' });
    },
    async rulesReorder(ids) {
      return (await json('/api/rules/reorder', { method: 'POST', body: { ids } })).rules;
    },
    async rulesReset() {
      return (await json('/api/rules/reset', { method: 'POST', body: {} })).rules;
    },
  };

  // Probe health on load — sets window.CEREBRO_API_READY to true/false so React
  // can pick its mode. We probe with a short timeout so offline mode is fast.
  const probe = (async () => {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 1500);
      const r = await fetch(base + '/api/health', { signal: ctl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error('bad status');
      const h = await r.json();
      window.CEREBRO_API_READY = true;
      window.CEREBRO_API_HEALTH = h;
    } catch {
      window.CEREBRO_API_READY = false;
    }
  })();

  window.cerebroAPI = api;
  window.CEREBRO_API_PROBE = probe;
})();
