// Shared demo data for Cerebro triage

const DESTINATIONS = {
  // Trade+ (formerly xTrade OM + xTrade Smart Follow) — Howden's unified
  // e-trading surface. Handles open market + facility + SME follow.
  trade:       { id: 'trade',       label: 'xTrade',        sub: 'Open market & Facility', color: '#173F35', pistachio: true },
  // Lloyd's e-placing platforms
  whitespace:  { id: 'whitespace',  label: 'Whitespace',    sub: "Lloyd's platform",       color: '#0857C3' },
  ppl:         { id: 'ppl',         label: 'PPL',           sub: "Lloyd's platform",       color: '#1A2F5C' },
  // Delegated / non-Lloyd's
  gxb:         { id: 'gxb',         label: 'GXB',           sub: "Lloyd's binder",         color: '#0D6E63' },
  acturis:     { id: 'acturis',     label: 'Acturis',       sub: "Non-Lloyd's",            color: '#B85C00' },
  iba:         { id: 'iba',         label: 'IBA',           sub: 'Accounts',               color: '#4B4B4B' },
  review:      { id: 'review',      label: 'Manual review', sub: 'Needs broker',           color: '#C0392B' },
};

const CLASSES = [
  'Property', 'Marine', 'Cyber', 'D&O', 'Casualty', 'Aviation', 'PI', 'Terrorism', 'Political Risk', 'Kidnap & Ransom'
];

const ASSUREDS = [
  'Meridian Foods Ltd',          'Cromwell Capital plc',          'Ardent Re SE',
  'Kingfisher Logistics Group',  'Saltmarsh & Co. LLP',            'Halberd Maritime AS',
  'Northwind Energy plc',        'Stirling Pharmaceuticals',       'Blackfriars Mutual',
  'Orchard Wine Estates',        'Verity Technologies Inc',        'Taurus Mining Holdings',
  'Harrington Estates Ltd',      'Pelagos Offshore BV',            'Clarendon Infrastructure',
  'Broadgate Hospitality',       'Rowan Semiconductor',            'Iveagh Private Office',
  'Pembroke Shipping Co',        'Linden Agriculture Group',       'Mercato Retail Holdings',
  'Fairfield Aerospace',         'Copperleaf Ventures',            'Tamar Healthcare Trust',
];

const BROKERS = [
  'Howden London',            'Howden Dubai',             'Howden Singapore',
  'Howden Madrid',            'Howden Mumbai',            'Howden Hong Kong',
  'Howden Paris',             'Howden Sydney',            'Howden Zurich',
  'Kestrel Risk Partners',    'Arden & Vale Brokers',     'Meridian Placement Co',
];

// Rule definitions — mirrors server/rules.js so the Admin rules panel
// and routing trace look the same in offline mode as against the backend.
const RULES = [
  { id: 'G-03', tier: 'gate',       name: 'Missing critical field',       desc: 'Assured, class or premium unparseable' },
  { id: 'G-04', tier: 'gate',       name: 'Low extraction confidence',    desc: 'Confidence < 70%' },
  { id: 'F-01', tier: 'facility',   name: 'Binder match → GXB',           desc: 'Existing binder / scheme identifier present' },
  { id: 'C-01', tier: 'compliance', name: 'US surplus lines → Trade+',    desc: 'US exposure requires surplus-lines carrier' },
  { id: 'R-04', tier: 'class',      name: 'Marine → Whitespace',          desc: "Lloyd's specialty market for Marine" },
  { id: 'R-10', tier: 'class',      name: 'Aviation → PPL',               desc: "Lloyd's dominates Aviation" },
  { id: 'R-11', tier: 'class',      name: 'Political Risk → Whitespace',  desc: "Lloyd's specialty for PR / Trade Credit" },
  { id: 'R-12', tier: 'class',      name: 'Terrorism / K&R → PPL',        desc: "Lloyd's specialty syndicates" },
  { id: 'R-03', tier: 'size',       name: 'Large → Trade+ Open Market',   desc: 'Premium ≥ $1.5M, underwriter-led' },
  { id: 'R-02', tier: 'size',       name: 'Mid → Trade+ Facility',        desc: 'Premium $250k–1.5M with market leader' },
  { id: 'R-06', tier: 'size',       name: 'Large specialty → Trade+',     desc: 'Cyber / D&O / PI ≥ $1.5M' },
  { id: 'R-05', tier: 'size',       name: 'Mid specialty → Trade+',       desc: 'Cyber / D&O / PI $250k–1.5M' },
  { id: 'R-01', tier: 'size',       name: 'SME → Trade+ Facility',        desc: 'Small Property/Casualty/Cyber < $250k' },
  { id: 'L-01', tier: 'loss',       name: 'Ugly losses → review',         desc: '5yr loss ratio > 150% overrides destination' },
  { id: 'L-02', tier: 'loss',       name: 'Bad losses → Acturis',         desc: '5yr loss ratio > 80% routes to non-Lloyd\'s carriers' },
  { id: 'R-09', tier: 'fallback',   name: 'Unrouted → manual review',     desc: 'No rule matched' },
];

// Format premium amounts consistently across the app.
// `k` is the premium in thousands. Below $1M we show "$NNk",
// above we collapse to "$N.NM" so 4-digit-k figures don't look cramped.
function fmtPremium(k) {
  if (k == null || Number.isNaN(Number(k))) return '';
  const n = Number(k);
  if (n >= 1000) {
    const m = n / 1000;
    const rounded = m % 1 === 0 ? m.toFixed(0) : m.toFixed(1);
    return `$${rounded}M`;
  }
  return `$${Math.round(n)}k`;
}

// Bucket thresholds mirror server/rules.js#bucketFor (post-10x scale):
// Small < $250k, Medium $250k–$1.5M, Large ≥ $1.5M.
const BUCKET_SMALL_MAX  = 250;   // < $250k = small
const BUCKET_MEDIUM_MAX = 1500;  // < $1.5M = medium, else large
function bucketFromPremiumK(premiumK) {
  if (premiumK >= BUCKET_MEDIUM_MAX) return { bucket: 'large',  label: 'Large',  range: '$1.5M+',     value: premiumK };
  if (premiumK >= BUCKET_SMALL_MAX)  return { bucket: 'medium', label: 'Medium', range: '$250k–1.5M', value: premiumK };
  return                              { bucket: 'small',  label: 'Small',  range: '$0–250k',    value: premiumK };
}

// Helpers
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randBucket = () => {
  const r = Math.random();
  if (r < 0.55) return bucketFromPremiumK(Math.floor(30 + Math.random() * 220));    // small: $30–250k
  if (r < 0.88) return bucketFromPremiumK(Math.floor(260 + Math.random() * 1240));  // medium: $260k–$1.5M
  return                bucketFromPremiumK(Math.floor(1500 + Math.random() * 4000));// large: $1.5–5.5M
};

function pickDestination(cls, size, lowConf, nonLloyds, binder) {
  if (lowConf) return { destId: 'review', ruleId: 'G-04' };
  if (binder) return { destId: 'gxb', ruleId: 'F-01' };
  if (nonLloyds && ['Property','Casualty'].includes(cls)) return { destId: 'acturis', ruleId: 'L-02' };
  if (cls === 'Marine') return { destId: 'whitespace', ruleId: 'R-04' };
  if (cls === 'Aviation') return { destId: 'ppl', ruleId: 'R-10' };
  if (cls === 'Political Risk') return { destId: 'whitespace', ruleId: 'R-11' };
  if (cls === 'Terrorism' || cls === 'Kidnap & Ransom') return { destId: 'ppl', ruleId: 'R-12' };
  if (['Cyber','D&O','PI'].includes(cls)) {
    if (size >= BUCKET_MEDIUM_MAX) return { destId: 'trade', ruleId: 'R-06' };
    if (size >= BUCKET_SMALL_MAX)  return { destId: 'trade', ruleId: 'R-05' };
    return { destId: 'trade', ruleId: 'R-01' };
  }
  if (['Property','Casualty'].includes(cls)) {
    if (size >= BUCKET_MEDIUM_MAX) return { destId: 'trade', ruleId: 'R-03' };
    if (size >= BUCKET_SMALL_MAX)  return { destId: 'trade', ruleId: 'R-02' };
    return { destId: 'trade', ruleId: 'R-01' };
  }
  // Fallback
  if (size >= BUCKET_MEDIUM_MAX) return { destId: 'trade', ruleId: 'R-03' };
  return { destId: 'review', ruleId: 'R-09' };
}

const STATES = {
  submitted:  { id: 'submitted',  label: 'Submitted',       color: 'var(--cobalt)',           bg: 'var(--cobalt-05)' },
  bound:      { id: 'bound',      label: 'Bound',           color: 'var(--status-positive)',  bg: '#E3F5E3' },
  processing: { id: 'processing', label: 'Processing',      color: '#7A3FBF',                 bg: '#F2EBFB' },
};

// Spread minutes-ago across today / this week / this month / this quarter /
// this year so the Kanban time-split tabs have content in every bucket.
// Using deterministic bands keyed off the seed index keeps tests stable.
const MIN_PER_DAY = 60 * 24;
function seedMinsAgo(i) {
  // 100-risk distribution: 30 today, 25 this week, 20 this month,
  // 15 this quarter, 10 this year.
  if (i < 30)  return 2 + i * 7;                                 // today: 2m – ~3.5h
  if (i < 55)  return MIN_PER_DAY + (i - 30) * 240;              // week: 1-5d
  if (i < 75)  return 7 * MIN_PER_DAY + (i - 55) * MIN_PER_DAY;  // month: 7-27d
  if (i < 90)  return 30 * MIN_PER_DAY + (i - 75) * 4 * MIN_PER_DAY; // quarter: 30-85d
  return 100 * MIN_PER_DAY + (i - 90) * 20 * MIN_PER_DAY;        // year: 100-280d
}

// Deterministic demo set — seeded
let __nextId = 1;
function makeQuote(i, opts = {}) {
  const cls = opts.cls || CLASSES[i % CLASSES.length];
  const bucket = opts.bucket || bucketFromPremiumK(
    i % 11 === 0 ? 1500 + (i * 370) % 4000 :   // large: $1.5M–5.5M
    i % 5  === 0 ? 250 + (i * 170) % 1240 :    // medium: $250k–1.5M
                   30 + (i * 70)  % 220         // small: $30k–250k
  );
  const assured = opts.assured || ASSUREDS[i % ASSUREDS.length];
  const broker = opts.broker || BROKERS[i % BROKERS.length];
  const confidence = opts.confidence ?? (70 + ((i * 13) % 30));
  const lowConf = confidence < 72;
  const nonLloyds = opts.nonLloyds ?? (i % 9 === 0);
  const binder = opts.binder ?? (i % 13 === 0);
  const resolved = (opts.destId && opts.ruleId)
    ? { destId: opts.destId, ruleId: opts.ruleId }
    : pickDestination(cls, bucket.value, lowConf, nonLloyds, binder);
  const { destId, ruleId } = resolved;
  // State distribution weighted toward "passed" (bound / processing).
  // ~20% stay submitted so each Kanban column still shows items that
  // need attention. Review rows are always left in submitted.
  const needsAttention = destId === 'review' || (i % 5 === 1);
  const state = opts.state || (
    needsAttention ? 'submitted'
    : (i % 3 === 0) ? 'processing'
    : 'bound'
  );
  const ref = `M${(20250000 + i * 137).toString().slice(-7)}`;
  const minsAgo = opts.minsAgo ?? seedMinsAgo(i);
  // Bound / processing → fully extracted (100%). Submitted varies so the
  // broker has something to finish.
  const isPassed = state === 'bound' || state === 'processing';
  const completenessPct = isPassed
    ? 100
    : Math.max(35, Math.min(95, 45 + ((i * 11) % 50)));
  // HAT is now a per-risk tag (Howden's own follow capacity), not a
  // destination. Randomised across all risks except review.
  const hatEligible = opts.hatEligible ?? (destId !== 'review' && (i * 37) % 100 < 35);
  return {
    id: `Q-${__nextId++}`,
    ref,
    assured,
    cls,
    broker,
    bucket,
    confidence,
    destId,
    ruleId,
    state,
    minsAgo,
    createdAt: Date.now() - minsAgo * 60 * 1000,
    subject: `${cls} renewal — ${assured}`,
    premiumK: bucket.value,
    premium: bucket.value * 1000,
    completeness: {
      pct: completenessPct,
      filled: Math.round((completenessPct / 100) * 14),
      total: 14,
    },
    locked: isPassed,
    hatEligible,
  };
}

// ============================================================
// 100-risk seed with a deterministic per-platform distribution.
// Totals add up to 100, and GXB and Acturis get an even split.
//   trade        60  │  whitespace   8  │  gxb      10
//                     │  ppl          7  │  acturis  10
//                                          review    5
// ============================================================
const SEED_PLAN = [
  // Large open market routed to Trade+
  { destId: 'trade',      ruleId: 'R-03', classes: ['Property','Casualty'],               premiums: [1500, 1750, 1900, 2100, 2400, 2700, 3000, 3300, 3700, 4000, 4400, 4800, 5200, 1600, 2200, 2800, 3500, 5500] },
  // Specialty large → Trade+
  { destId: 'trade',      ruleId: 'R-06', classes: ['Cyber','D&O','PI'],                  premiums: [1550, 2100, 3200] },
  // Mid facility → Trade+
  { destId: 'trade',      ruleId: 'R-02', classes: ['Property','Casualty'],               premiums: [260, 320, 410, 490, 580, 660, 750, 830, 920, 1010, 1100, 1200, 1280, 1360, 1450] },
  // Mid specialty → Trade+
  { destId: 'trade',      ruleId: 'R-05', classes: ['Cyber','D&O','PI'],                  premiums: [280, 560, 880, 1280] },
  // SME → Trade+ Facility (was HAT destination, now routed to Trade+ with
  // the HAT eligibility tag applied to a subset)
  { destId: 'trade',      ruleId: 'R-01', classes: ['Property','Cyber','Casualty'],      premiums: [30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 220, 235, 50, 80, 115, 170, 240] },

  // Lloyd's specialty — Whitespace
  { destId: 'whitespace', ruleId: 'R-04', classes: ['Marine'],                            premiums: [320, 560, 820, 1100, 1400] },
  { destId: 'whitespace', ruleId: 'R-11', classes: ['Political Risk'],                    premiums: [450, 820, 1200] },

  // Lloyd's specialty — PPL
  { destId: 'ppl',        ruleId: 'R-10', classes: ['Aviation'],                          premiums: [1500, 2100, 3000, 4200] },
  { destId: 'ppl',        ruleId: 'R-12', classes: ['Terrorism', 'Kidnap & Ransom'],     premiums: [380, 720, 1100] },

  // Delegated / binder carriers
  { destId: 'gxb',        ruleId: 'F-01', classes: ['Property','Marine','Casualty'],     premiums: [280, 420, 560, 720, 880, 1040, 1200, 340, 680, 1400] },
  { destId: 'acturis',    ruleId: 'L-02', classes: ['Property','Casualty'],              premiums: [110, 170, 220, 60, 90, 140, 180, 205, 240, 125] },

  // Manual review (low confidence)
  { destId: 'review',     ruleId: 'G-04', classes: ['Cyber','Property','Casualty'],      premiums: [180, 240, 80, 140, 60] },
];

function buildSeedQuotes() {
  const out = [];
  let i = 0;
  for (const row of SEED_PLAN) {
    for (let j = 0; j < row.premiums.length; j++) {
      const cls = row.classes[(i + j) % row.classes.length];
      const premiumK = row.premiums[j];
      // For 'review' we want a lowConf flag so the card carries the right
      // reason text; for everything else seed a healthy confidence.
      const confidence = row.destId === 'review' ? 58 + (i % 12) : 76 + ((i * 13) % 22);
      out.push(makeQuote(i, {
        cls,
        bucket: bucketFromPremiumK(premiumK),
        destId: row.destId,
        ruleId: row.ruleId,
        confidence,
        binder: row.destId === 'gxb',
        nonLloyds: row.destId === 'acturis',
      }));
      i++;
    }
  }
  return out;
}

const SEED_QUOTES = buildSeedQuotes();

Object.assign(window, {
  DESTINATIONS, CLASSES, ASSUREDS, BROKERS, RULES, STATES, SEED_QUOTES,
  makeQuote, pickDestination, randBucket, rand,
  fmtPremium, bucketFromPremiumK,
});
