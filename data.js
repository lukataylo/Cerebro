// Shared demo data for Cerebro triage

const DESTINATIONS = {
  xtrade_om:   { id: 'xtrade_om',   label: 'xTrade',       sub: 'Open Market',      color: '#173F35', pistachio: true },
  xtrade_sf:   { id: 'xtrade_sf',   label: 'xTrade',       sub: 'Smart Follow',     color: '#2D6A5A', pistachio: true },
  ppl:         { id: 'ppl',         label: 'WhiteSpace',   sub: "Lloyd's PPL",      color: '#0857C3' },
  hat:         { id: 'hat',         label: 'HAT',          sub: 'Algorithmic',      color: '#7A3FBF' },
  gxb:         { id: 'gxb',         label: 'GXB',          sub: "Lloyd's",          color: '#0D6E63' },
  acturis:     { id: 'acturis',     label: 'Acturis',      sub: "Non-Lloyd's",      color: '#B85C00' },
  iba:         { id: 'iba',         label: 'IBA',          sub: 'Accounts',         color: '#4B4B4B' },
  review:      { id: 'review',      label: 'Manual review',sub: 'Needs broker',     color: '#C0392B' },
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

// Rule definitions — routing logic
const RULES = [
  { id: 'R-01', name: 'Small SME Property → HAT',          matches: ['Property'],    sizeMax: 25,   dest: 'hat',       desc: 'Algorithmic rate if premium < $25k and 3yr loss ratio clean' },
  { id: 'R-02', name: 'Mid Property → xTrade Smart Follow',matches: ['Property','Casualty'], sizeMin: 25, sizeMax: 150, dest: 'xtrade_sf', desc: 'Smart follow for mid-market with established leader' },
  { id: 'R-03', name: 'Large Property → xTrade Open Market', matches: ['Property','Casualty','Terrorism'], sizeMin: 150, dest: 'xtrade_om', desc: 'Open market placement, underwriter-led' },
  { id: 'R-04', name: 'Marine & Aviation → WhiteSpace PPL',matches: ['Marine','Aviation'], dest: 'ppl', desc: "Lloyd's specialty always via PPL" },
  { id: 'R-05', name: 'Cyber & D&O mid → xTrade Smart Follow', matches: ['Cyber','D&O','PI'], sizeMin: 25, sizeMax: 150, dest: 'xtrade_sf', desc: 'Specialty casualty follow' },
  { id: 'R-06', name: 'Cyber & D&O large → xTrade Open Market', matches: ['Cyber','D&O','PI'], sizeMin: 150, dest: 'xtrade_om', desc: 'Complex specialty to open market' },
  { id: 'R-07', name: 'Non-Lloyd\'s regional → Acturis',    matches: ['Property','Casualty'], nonLloyds: true, dest: 'acturis', desc: 'Company market, non-Lloyd\'s carriers' },
  { id: 'R-08', name: 'GXB binder match → GXB',            matches: ['Property','Marine'], binder: true, dest: 'gxb', desc: 'Existing binder facility match' },
  { id: 'R-09', name: 'Ambiguous / low-confidence → Review', matches: ['*'], lowConf: true, dest: 'review', desc: 'Confidence < 70% or multiple rules matched' },
];

// Helpers
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randBucket = () => {
  const r = Math.random();
  if (r < 0.72) return { bucket: 'small',  label: 'Small',  range: '$0–25k',   value: Math.floor(3 + Math.random() * 22) };
  if (r < 0.94) return { bucket: 'medium', label: 'Medium', range: '$25–150k', value: Math.floor(25 + Math.random() * 125) };
  return                { bucket: 'large',  label: 'Large',  range: '$150k+',   value: Math.floor(150 + Math.random() * 450) };
};

function pickDestination(cls, size, lowConf, nonLloyds, binder) {
  if (lowConf) return { destId: 'review', ruleId: 'R-09' };
  if (binder && ['Property','Marine'].includes(cls)) return { destId: 'gxb', ruleId: 'R-08' };
  if (nonLloyds && ['Property','Casualty'].includes(cls)) return { destId: 'acturis', ruleId: 'R-07' };
  if (['Marine','Aviation'].includes(cls)) return { destId: 'ppl', ruleId: 'R-04' };
  if (['Cyber','D&O','PI'].includes(cls)) {
    if (size >= 150) return { destId: 'xtrade_om', ruleId: 'R-06' };
    if (size >= 25)  return { destId: 'xtrade_sf', ruleId: 'R-05' };
  }
  if (['Property','Casualty','Terrorism'].includes(cls)) {
    if (size >= 150) return { destId: 'xtrade_om', ruleId: 'R-03' };
    if (size >= 25)  return { destId: 'xtrade_sf', ruleId: 'R-02' };
    return { destId: 'hat', ruleId: 'R-01' };
  }
  // Fallback
  if (size >= 150) return { destId: 'xtrade_om', ruleId: 'R-03' };
  return { destId: 'review', ruleId: 'R-09' };
}

const STATES = {
  classified: { id: 'classified', label: 'Classified',      color: 'var(--cobalt)',           bg: 'var(--cobalt-05)' },
  forwarded:  { id: 'forwarded',  label: 'Forwarded',       color: 'var(--neutral-amber)',    bg: 'var(--neutral-amber-light)' },
  populated:  { id: 'populated',  label: 'Populated',       color: 'var(--status-positive)',  bg: '#E3F5E3' },
  failed:     { id: 'failed',     label: 'Failed',          color: 'var(--status-negative)',  bg: 'var(--status-negative-10)' },
  review:     { id: 'review',     label: 'Needs review',    color: 'var(--status-pomegranate)', bg: 'var(--soft-pink)' },
};

// Deterministic demo set — seeded
let __nextId = 1;
function makeQuote(i, opts = {}) {
  const cls = opts.cls || CLASSES[i % CLASSES.length];
  const bucket = opts.bucket || (
    i % 11 === 0 ? { bucket: 'large',  label: 'Large',  range: '$150k+',   value: 150 + (i * 37) % 400 } :
    i % 5  === 0 ? { bucket: 'medium', label: 'Medium', range: '$25–150k', value: 25 + (i * 17) % 120 } :
                   { bucket: 'small',  label: 'Small',  range: '$0–25k',   value: 3 + (i * 7) % 22 }
  );
  const assured = ASSUREDS[i % ASSUREDS.length];
  const broker = BROKERS[i % BROKERS.length];
  const confidence = opts.confidence ?? (70 + ((i * 13) % 30));
  const lowConf = confidence < 72;
  const nonLloyds = i % 9 === 0;
  const binder = i % 13 === 0;
  const { destId, ruleId } = pickDestination(cls, bucket.value, lowConf, nonLloyds, binder);
  const state = opts.state || (
    destId === 'review' ? 'review' :
    i % 17 === 0 ? 'failed' :
    i % 4 === 0 ? 'populated' :
    i % 2 === 0 ? 'forwarded' : 'classified'
  );
  const ref = `M${(20250000 + i * 137).toString().slice(-7)}`;
  const minsAgo = opts.minsAgo ?? (2 + i * 3);
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
    subject: `${cls} renewal — ${assured}`,
    premium: bucket.value * 1000,
  };
}

const SEED_QUOTES = Array.from({ length: 28 }, (_, i) => makeQuote(i));

Object.assign(window, {
  DESTINATIONS, CLASSES, ASSUREDS, BROKERS, RULES, STATES, SEED_QUOTES,
  makeQuote, pickDestination, randBucket, rand,
});
