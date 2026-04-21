export const DESTINATIONS = {
  // Trade+ (formerly xTrade OM + Smart Follow) — Howden's unified e-trading
  // surface. Handles open market + facility + SME follow on one destination.
  trade:       { id: 'trade',       label: 'xTrade',        sub: 'Open market & Facility' },
  whitespace:  { id: 'whitespace',  label: 'Whitespace',    sub: "Lloyd's platform" },
  ppl:         { id: 'ppl',         label: 'PPL',           sub: "Lloyd's platform" },
  gxb:         { id: 'gxb',         label: 'GXB',           sub: "Binder facility" },
  acturis:     { id: 'acturis',     label: 'Acturis',       sub: "Non-Lloyd's" },
  iba:         { id: 'iba',         label: 'IBA',           sub: 'Accounts' },
  review:      { id: 'review',      label: 'Manual review', sub: 'Needs broker' },
};

// The canonical rule set — metadata + seed predicates. These are the
// defaults that get written into the `rules` table on first boot, and
// also used when the admin hits "Reset to defaults".
//
// `kind: 'builtin'` means the rule's behaviour is hardcoded in route()
// (it's too tangled to express in the simple predicate AST) — admins
// can still enable/disable/reorder/rename it from the UI. Everything
// else is a 'predicate' rule whose conditions are fully editable.
//
// Tier evaluation order: gate → facility → compliance → class → size →
// loss → fallback. Within a tier, priority (ascending) wins. The
// priorities below reserve gaps so the UI's reorder can slide new rules
// in without clashes.
export const RULES = [
  // --- G — gates ---
  {
    id: 'G-03', tier: 'gate', priority: 10, kind: 'builtin',
    name: 'Missing critical field', description: 'Assured, class or premium unparseable',
    dest_id: 'review',
  },
  {
    id: 'G-04', tier: 'gate', priority: 20, kind: 'predicate',
    name: 'Low extraction confidence', description: 'Confidence < 70%',
    dest_id: 'review',
    predicate: { all: [ { field: 'confidence', op: '<', value: 70 } ] },
  },
  // --- F — facility / binder ---
  {
    id: 'F-01', tier: 'facility', priority: 30, kind: 'predicate',
    name: 'Binder match → GXB', description: 'Existing binder / scheme identifier present',
    dest_id: 'gxb',
    predicate: { all: [ { field: 'binder_id', op: 'present' } ] },
  },
  // --- C — compliance / licensing ---
  {
    id: 'C-01', tier: 'compliance', priority: 40, kind: 'predicate',
    name: 'US surplus lines → xTrade', description: 'US exposure requires surplus-lines carrier',
    dest_id: 'trade',
    predicate: { all: [ { field: 'geography', op: 'contains', value: 'US' } ] },
  },
  // --- R — class routing ---
  {
    id: 'R-04', tier: 'class', priority: 50, kind: 'predicate',
    name: 'Marine → Whitespace', description: "Lloyd's specialty market for Marine",
    dest_id: 'whitespace',
    predicate: { all: [ { field: 'cls', op: '==', value: 'Marine' } ] },
  },
  {
    id: 'R-10', tier: 'class', priority: 60, kind: 'predicate',
    name: 'Aviation → PPL', description: "Lloyd's dominates Aviation",
    dest_id: 'ppl',
    predicate: { all: [ { field: 'cls', op: '==', value: 'Aviation' } ] },
  },
  {
    id: 'R-11', tier: 'class', priority: 70, kind: 'predicate',
    name: 'Political Risk → Whitespace', description: "Lloyd's specialty for PR / Trade Credit",
    dest_id: 'whitespace',
    predicate: { all: [ { field: 'cls', op: '==', value: 'Political Risk' } ] },
  },
  {
    id: 'R-12', tier: 'class', priority: 80, kind: 'predicate',
    name: 'Terrorism / K&R → PPL', description: "Lloyd's specialty syndicates",
    dest_id: 'ppl',
    predicate: { all: [ { field: 'cls', op: 'in', value: ['Terrorism', 'Kidnap & Ransom'] } ] },
  },
  // --- R — size routing (these are builtin because they interact with
  // class: specialty vs mainstream picks a different ladder) ---
  {
    id: 'R-03', tier: 'size', priority: 90, kind: 'builtin',
    name: 'Large → xTrade Open Market', description: 'Premium ≥ $1.5M, underwriter-led',
    dest_id: 'trade',
  },
  {
    id: 'R-02', tier: 'size', priority: 100, kind: 'builtin',
    name: 'Mid → xTrade Facility', description: 'Premium $250k–1.5M with market leader',
    dest_id: 'trade',
  },
  {
    id: 'R-06', tier: 'size', priority: 110, kind: 'builtin',
    name: 'Large specialty → xTrade', description: 'Cyber / D&O / PI ≥ $1.5M',
    dest_id: 'trade',
  },
  {
    id: 'R-05', tier: 'size', priority: 120, kind: 'builtin',
    name: 'Mid specialty → xTrade', description: 'Cyber / D&O / PI $250k–1.5M',
    dest_id: 'trade',
  },
  {
    id: 'R-01', tier: 'size', priority: 130, kind: 'builtin',
    name: 'SME → xTrade Facility', description: 'Small Property/Casualty/Cyber < $250k',
    dest_id: 'trade',
  },
  // --- L — loss overlays (builtin — they apply *after* a base dest has been picked) ---
  {
    id: 'L-01', tier: 'loss', priority: 140, kind: 'builtin',
    name: 'Ugly losses → review', description: '5yr loss ratio > 150% overrides destination',
    dest_id: 'review',
  },
  {
    id: 'L-02', tier: 'loss', priority: 150, kind: 'builtin',
    name: 'Bad losses → Acturis', description: "5yr loss ratio > 80% routes to non-Lloyd's carriers",
    dest_id: 'acturis',
  },
  // --- Fallback (builtin — the safety net, cannot be deleted) ---
  {
    id: 'R-09', tier: 'fallback', priority: 999, kind: 'builtin',
    name: 'Unrouted → manual review', description: 'No rule matched',
    dest_id: 'review',
  },
];

export const TIER_ORDER = ['gate', 'facility', 'compliance', 'class', 'size', 'loss', 'fallback'];
// Which rule ids may never be deleted — the admin UI and DELETE endpoint
// both enforce this.
export const UNDELETABLE_RULE_IDS = new Set(['R-09']);

// Bucket thresholds are 10x'd vs. the v1 mock:
//   Small    < $250k
//   Medium   $250k – $1.5M
//   Large    ≥ $1.5M
// Note: `value` stays in $k (so 1500 = $1.5M) to avoid churning every
// downstream consumer that expects premiumK units.
export function bucketFor(premiumK) {
  if (premiumK >= 1500) return { bucket: 'large',  label: 'Large',  range: '$1.5M+',     value: premiumK };
  if (premiumK >= 250)  return { bucket: 'medium', label: 'Medium', range: '$250k–1.5M', value: premiumK };
  return                  { bucket: 'small',  label: 'Small',  range: '$0–250k',    value: premiumK };
}

// --- Predicate evaluation ---
//
// The editable predicate AST is intentionally tiny. Shape:
//   { all: [cond, cond, ...] }   // AND
//   { any: [cond, cond, ...] }   // OR
//   cond = { field, op, value }
// One level of nesting is allowed (an all/any can contain an any/all),
// but the UI only exposes a flat list with a top-level ALL/ANY toggle.
//
// `extraction` is the normalised extraction object — the same shape
// passed to route(). Missing fields evaluate as null.
export function evaluatePredicate(pred, ex) {
  if (!pred || typeof pred !== 'object') return false;
  if (Array.isArray(pred.all)) {
    return pred.all.every(c => evaluatePredicate(c, ex));
  }
  if (Array.isArray(pred.any)) {
    return pred.any.some(c => evaluatePredicate(c, ex));
  }
  // Leaf condition
  return evalCondition(pred, ex);
}

function evalCondition(c, ex) {
  if (!c || !c.field || !c.op) return false;
  const v = ex[c.field];
  const t = c.value;
  switch (c.op) {
    case '==': return v === t;
    case '!=': return v !== t;
    case '>':  return num(v) > num(t);
    case '>=': return num(v) >= num(t);
    case '<':  return num(v) < num(t);
    case '<=': return num(v) <= num(t);
    case 'in': return Array.isArray(t) && t.includes(v);
    case 'not_in': return Array.isArray(t) && !t.includes(v);
    case 'present': return v != null && v !== '' && !(Array.isArray(v) && v.length === 0);
    case 'absent':  return v == null || v === '' || (Array.isArray(v) && v.length === 0);
    case 'contains':
      if (Array.isArray(v)) return v.includes(t);
      if (typeof v === 'string') return v.includes(String(t));
      return false;
    default:
      return false;
  }
}
function num(x) { const n = Number(x); return Number.isFinite(n) ? n : -Infinity; }

// Render a predicate as a short human-readable chip ("premium_k >= 1500 AND cls in [Cyber,D&O,PI]").
export function predicateToText(pred) {
  if (!pred) return '(no conditions)';
  if (Array.isArray(pred.all)) return pred.all.map(predicateToText).join(' AND ') || '(empty)';
  if (Array.isArray(pred.any)) return pred.any.map(predicateToText).join(' OR ')  || '(empty)';
  const { field, op, value } = pred;
  if (op === 'present' || op === 'absent') return `${field} ${op}`;
  if (op === 'in' || op === 'not_in') return `${field} ${op.replace('_', ' ')} [${(value || []).join(',')}]`;
  return `${field} ${op} ${JSON.stringify(value)}`;
}

// --- DB accessors ---
//
// The DB is the source of truth for rules at runtime. `loadRules(db)` is
// cheap (one query), and ingest/augment call it fresh every time so
// edits from the admin UI take effect without a server restart.
export function loadRules(db) {
  const rows = db.prepare(`
    SELECT id, tier, name, description, enabled, priority, kind, predicate_json, dest_id, updated_at
    FROM rules
    ORDER BY priority ASC
  `).all();
  return rows.map(dbRowToRule);
}

function dbRowToRule(r) {
  let predicate = null;
  if (r.predicate_json) {
    try { predicate = JSON.parse(r.predicate_json); }
    catch { predicate = null; }
  }
  return {
    id: r.id,
    tier: r.tier,
    name: r.name,
    description: r.description || '',
    desc: r.description || '',       // UI compatibility (rule-item expects .desc)
    enabled: !!r.enabled,
    priority: r.priority,
    kind: r.kind,
    predicate,
    dest_id: r.dest_id,
    updatedAt: r.updated_at,
  };
}

export function seedRulesIfEmpty(db) {
  const n = db.prepare('SELECT COUNT(*) as n FROM rules').get().n;
  if (n > 0) return false;
  writeSeedRules(db);
  return true;
}

// Used by POST /api/rules/reset — nukes and re-seeds.
export function resetRulesToDefaults(db) {
  db.prepare('DELETE FROM rules').run();
  writeSeedRules(db);
}

function writeSeedRules(db) {
  const insert = db.prepare(`
    INSERT INTO rules (id, tier, name, description, enabled, priority, kind, predicate_json, dest_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    for (const r of RULES) {
      insert.run(
        r.id, r.tier, r.name, r.description || '',
        1, r.priority, r.kind,
        r.predicate ? JSON.stringify(r.predicate) : null,
        r.dest_id, now,
      );
    }
  });
  tx();
}

// --- Routing ---
//
// The rules array is the live, ordered list of rules (from loadRules).
// Evaluation follows the tier order strictly — within a tier, rules are
// in priority order. 'predicate' rules fire when their AST evaluates
// truthy; 'builtin' rules fall through to the hardcoded branches below
// (which are still gated on the enabled flag).
export function route(e, rules) {
  const list = Array.isArray(rules) && rules.length ? rules : RULES;
  // Build a lookup of enabled rules keyed by id, plus a flag for every
  // builtin id. Evaluation order within the function below still
  // follows the hardcoded tier logic for builtins (size ladder, loss
  // overlays) — it just checks enabled + reads dest_id dynamically.
  const byId = new Map(list.map(r => [r.id, r]));
  const trace = [];
  const isEnabled = (id) => {
    const r = byId.get(id);
    return r ? r.enabled !== false : false;
  };
  const destOf = (id, fallback) => (byId.get(id)?.dest_id) || fallback;
  const step = (id, fired, detail) => { trace.push({ id, fired, detail }); return fired; };

  const size = e.premium_k ?? 0;
  const cls = e.cls;
  const confidence = e.confidence ?? 0;
  const lossRatio = e.loss_ratio_5yr;

  // 1) Predicate rules — walk the ordered list and fire the first match,
  //    but only within the pre-size tiers (gate/facility/compliance/class).
  //    Size & loss tiers stay builtin because they interact with the class
  //    ladder picked below.
  for (const r of list) {
    if (r.kind !== 'predicate') continue;
    if (!r.enabled) continue;
    if (!['gate', 'facility', 'compliance', 'class'].includes(r.tier)) continue;
    const fired = !!evaluatePredicate(r.predicate, e);
    step(r.id, fired, predicateToText(r.predicate));
    if (fired) return finish(r.dest_id, r.id, trace);
  }

  // 2) G-03 builtin — missing critical field. Treated as a gate regardless
  //    of priority in the list; if enabled and it matches, short-circuit.
  if (isEnabled('G-03') && step('G-03', !e.assured || !cls || size === 0, 'missing assured / class / premium')) {
    return finish(destOf('G-03', 'review'), 'G-03', trace);
  }

  // 3) Size ladder — specialty vs mainstream.
  const specialty = ['Cyber', 'D&O', 'PI'].includes(cls);
  const mainstream = ['Property', 'Casualty'].includes(cls);

  let baseDest = null, baseRule = null;
  if (specialty) {
    if (isEnabled('R-06') && step('R-06', size >= 1500, `class=${cls}, size=$${size}k`)) { baseDest = destOf('R-06', 'trade'); baseRule = 'R-06'; }
    else if (isEnabled('R-05') && step('R-05', size >= 250, `class=${cls}, size=$${size}k`)) { baseDest = destOf('R-05', 'trade'); baseRule = 'R-05'; }
    else if (isEnabled('R-01') && step('R-01', true, `class=${cls}, size=$${size}k (SME specialty)`)) { baseDest = destOf('R-01', 'trade'); baseRule = 'R-01'; }
  } else if (mainstream) {
    if (isEnabled('R-03') && step('R-03', size >= 1500, `class=${cls}, size=$${size}k`)) { baseDest = destOf('R-03', 'trade'); baseRule = 'R-03'; }
    else if (isEnabled('R-02') && step('R-02', size >= 250, `class=${cls}, size=$${size}k`)) { baseDest = destOf('R-02', 'trade'); baseRule = 'R-02'; }
    else if (isEnabled('R-01') && step('R-01', true, `class=${cls}, size=$${size}k (SME)`)) { baseDest = destOf('R-01', 'trade'); baseRule = 'R-01'; }
  }

  // 4) Loss overlays — applied on top of a base dest.
  if (baseDest) {
    if (isEnabled('L-01') && step('L-01', lossRatio != null && lossRatio > 1.5, `loss_ratio_5yr=${formatRatio(lossRatio)}`)) {
      return finish(destOf('L-01', 'review'), 'L-01', trace);
    }
    if (isEnabled('L-02') && step('L-02', lossRatio != null && lossRatio > 0.8, `loss_ratio_5yr=${formatRatio(lossRatio)}, → ${destOf('L-02', 'acturis')}`)) {
      return finish(destOf('L-02', 'acturis'), 'L-02', trace);
    }
    return finish(baseDest, baseRule, trace);
  }

  // 5) Fallback — always fires if we got here.
  step('R-09', true, 'no tier matched');
  return finish(destOf('R-09', 'review'), 'R-09', trace);
}

// --- Fallback selection ---
export function pickFallback(e, primaryDestId) {
  const size = e.premium_k ?? 0;
  const cls = e.cls;
  const hasUS = (e.geography || []).includes('US');
  const lloydsClass = ['Marine', 'Aviation', 'Political Risk', 'Terrorism', 'Kidnap & Ransom'].includes(cls);

  // Manual review: fallback is the route it would have taken without the gate.
  if (primaryDestId === 'review') {
    if (e.binder_id) return { destId: 'gxb', ruleId: 'F-01', reason: 'Binder facility (ignoring gate)' };
    if (hasUS) return { destId: 'trade', ruleId: 'C-01', reason: 'US surplus (ignoring gate)' };
    if (cls === 'Marine' || cls === 'Political Risk') return { destId: 'whitespace', ruleId: 'R-04', reason: "Lloyd's specialty" };
    if (lloydsClass) return { destId: 'ppl', ruleId: 'R-10', reason: "Lloyd's specialty" };
    if (size >= 1500) return { destId: 'trade', ruleId: 'R-03', reason: 'Large premium' };
    if (size >= 250) return { destId: 'trade', ruleId: 'R-02', reason: 'Mid premium' };
    return { destId: 'trade', ruleId: 'R-01', reason: 'SME facility' };
  }

  if (primaryDestId === 'gxb') {
    if (cls === 'Marine' || cls === 'Political Risk') return { destId: 'whitespace', ruleId: 'R-04', reason: "Open market Lloyd's" };
    if (lloydsClass) return { destId: 'ppl', ruleId: 'R-10', reason: "Open market Lloyd's" };
    return { destId: 'trade', ruleId: 'R-03', reason: 'Open market' };
  }

  if (primaryDestId === 'whitespace') {
    return { destId: 'ppl', ruleId: 'R-10', reason: "Alternate Lloyd's platform" };
  }

  if (primaryDestId === 'ppl') {
    return { destId: 'whitespace', ruleId: 'R-04', reason: "Alternate Lloyd's platform" };
  }

  if (primaryDestId === 'trade') {
    // From Trade+ we only ever fall back to a Lloyd's e-placing platform.
    // Aviation / Terrorism / K&R naturally route to PPL; everything else
    // (Property, Casualty, Cyber, D&O, PI, Marine, Political Risk) routes
    // to Whitespace. We never fall back to GXB (binder-only) or Acturis
    // (non-Lloyd's retail) from a Trade+ primary.
    if (cls === 'Aviation' || cls === 'Terrorism' || cls === 'Kidnap & Ransom') {
      return { destId: 'ppl', ruleId: 'R-10', reason: "Lloyd's PPL open-market alternate" };
    }
    return { destId: 'whitespace', ruleId: 'R-04', reason: "Lloyd's Whitespace open-market alternate" };
  }

  if (primaryDestId === 'acturis') {
    return { destId: 'trade', ruleId: 'R-02', reason: 'Retry Trade+ facility' };
  }

  return { destId: 'review', ruleId: 'R-09', reason: 'No obvious fallback — broker review' };
}

// --- Decision scorecard ---
export function scoreDecision(e, destId, ruleId) {
  const size = e.premium_k ?? 0;
  const cls = e.cls;
  const confidence = e.confidence ?? 0;
  const lossRatio = e.loss_ratio_5yr;
  const hasUS = (e.geography || []).includes('US');
  const hasLoss = lossRatio != null;

  // --- Eligibility: hard rules pass? ---
  let eligibility = 100;
  let eligReason = 'All hard rules pass';
  if (destId === 'review') { eligibility = 40; eligReason = 'Failed gate — cannot auto-route'; }
  else if (!e.assured || !cls || size === 0) { eligibility = 30; eligReason = 'Missing critical field'; }
  else if (confidence < 70) { eligibility = 55; eligReason = `Low confidence ${confidence}%`; }

  // --- Client fit: does the destination match this class/size/geo? ---
  let clientFit = 70;
  let fitReason = 'Generic match';
  const lloydsClass = ['Marine', 'Aviation', 'Political Risk', 'Terrorism', 'Kidnap & Ransom'].includes(cls);
  if (destId === 'gxb' && e.binder_id) { clientFit = 95; fitReason = `Binder ${e.binder_id} matched`; }
  else if ((destId === 'whitespace' || destId === 'ppl') && lloydsClass) { clientFit = 92; fitReason = `${cls} is Lloyd's specialty`; }
  else if (destId === 'trade' && size >= 1500) { clientFit = 88; fitReason = `Large ${cls} fits open market`; }
  else if (destId === 'trade' && hasUS) { clientFit = 82; fitReason = 'US exposure → surplus lines'; }
  else if (destId === 'trade' && size >= 250) { clientFit = 85; fitReason = `Mid-market ${cls} on facility`; }
  else if (destId === 'trade' && size < 250) { clientFit = 78; fitReason = 'SME profile fits facility'; }
  else if (destId === 'acturis') { clientFit = 65; fitReason = "Non-Lloyd's fallback"; }
  else if (destId === 'review') { clientFit = 35; fitReason = 'Routing requires broker judgement'; }

  // --- Probability of bind ---
  let pbind = 70;
  let pbindReason = 'Typical bind rate';
  if (destId === 'gxb') { pbind = 82; pbindReason = 'Binder: quote tracks delegated authority'; }
  else if (destId === 'trade' && ruleId === 'R-01') { pbind = 85; pbindReason = 'Facility auto-bind for SME'; }
  else if (destId === 'trade' && (ruleId === 'R-02' || ruleId === 'R-05')) { pbind = 76; pbindReason = 'Facility has named leader'; }
  else if (destId === 'whitespace' || destId === 'ppl') { pbind = 68; pbindReason = "Lloyd's — strong appetite, slower bind"; }
  else if (destId === 'trade') { pbind = 58; pbindReason = 'Open market — underwriter-led, more variance'; }
  else if (destId === 'acturis') { pbind = 62; pbindReason = 'Retail regional carriers'; }
  else if (destId === 'review') { pbind = 30; pbindReason = 'Manual review first'; }
  if (hasLoss) {
    if (lossRatio > 1.5) { pbind = Math.round(pbind * 0.5); pbindReason = `Loss ratio ${Math.round(lossRatio * 100)}% — markets will decline`; }
    else if (lossRatio > 0.8) { pbind = Math.round(pbind * 0.8); pbindReason = `Loss ratio ${Math.round(lossRatio * 100)}% — pricing pressure`; }
    else if (lossRatio < 0.3) { pbind = Math.min(96, pbind + 8); pbindReason = `Clean losses ${Math.round(lossRatio * 100)}%`; }
  }
  if (e.expiring_carrier) { pbind = Math.min(96, pbind + 3); }

  // --- Economic value ---
  let commissionPct = 0.125;
  if (destId === 'trade' && size >= 1500) commissionPct = 0.15;
  else if (destId === 'trade' && size >= 250) commissionPct = 0.125;
  else if (destId === 'trade') commissionPct = 0.11;  // SME facility
  else if (destId === 'whitespace' || destId === 'ppl') commissionPct = 0.13;
  else if (destId === 'gxb') commissionPct = 0.17;
  else if (destId === 'acturis') commissionPct = 0.11;
  else if (destId === 'review') commissionPct = 0.10;
  const mdiK = Math.round(size * commissionPct);
  let economicValue = Math.max(20, Math.min(100, Math.round(30 + Math.log10(Math.max(1, mdiK)) * 28)));
  const econReason = `Est. MDI $${mdiK}k @ ${Math.round(commissionPct * 100)}% commission`;

  // --- Speed / SLA ---
  let speed = 70;
  let speedReason = 'Standard SLA';
  if (destId === 'trade' && ruleId === 'R-01') { speed = 90; speedReason = 'Facility auto-quote under 5 minutes'; }
  else if (destId === 'trade' && (ruleId === 'R-02' || ruleId === 'R-05')) { speed = 82; speedReason = 'Facility: hours not days'; }
  else if (destId === 'gxb') { speed = 80; speedReason = 'Binder: quote within SLA'; }
  else if (destId === 'trade') { speed = 55; speedReason = 'Open market: 3-5 day turnaround'; }
  else if (destId === 'whitespace' || destId === 'ppl') { speed = 45; speedReason = "Lloyd's: 5-10 day placement"; }
  else if (destId === 'acturis') { speed = 50; speedReason = 'Regional quoting: 2-4 days'; }
  else if (destId === 'review') { speed = 25; speedReason = 'Manual step adds 24-48h'; }

  return {
    eligibility: { score: eligibility, reason: eligReason },
    clientFit:   { score: clientFit,   reason: fitReason },
    pbind:       { score: pbind,       reason: pbindReason },
    economicValue: { score: economicValue, reason: econReason, mdiK },
    speed:       { score: speed,       reason: speedReason },
  };
}

function formatRatio(r) {
  if (r == null) return 'null';
  return `${Math.round(r * 100)}%`;
}

function finish(destId, ruleId, trace) {
  return { destId, ruleId, trace };
}
