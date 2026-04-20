import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';
import mammoth from 'mammoth';
import db from './db.js';
import {
  route, pickFallback, scoreDecision, bucketFor,
  DESTINATIONS, RULES, TIER_ORDER, UNDELETABLE_RULE_IDS,
  loadRules, seedRulesIfEmpty, resetRulesToDefaults, evaluatePredicate,
} from './rules.js';
import { extract } from './extractor.js';
import { SEED_EMAILS } from './seeds/emails.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// Raise limit so base64-encoded PDFs/images can fit (Claude allows up to ~32MB per doc)
app.use(express.json({ limit: '40mb' }));

const insertEmail = db.prepare(`
  INSERT INTO emails (from_addr, to_addr, subject, body, received_at, attachments, source_type, source_url)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertQuote = db.prepare(`
  INSERT INTO quotes (
    ref, assured, domicile_country, industry,
    cls, sub_class, geography, tiv_usd,
    placement_type, inception_date, premium_k, expiring_carrier, binder_id,
    loss_ratio_5yr, years_of_losses,
    dest_id, rule_id, fallback_dest_id, fallback_rule_id, score_json,
    state, confidence, reasoning, trace,
    broker, email_id, created_at
  ) VALUES (?, ?, ?, ?,  ?, ?, ?, ?,  ?, ?, ?, ?, ?,  ?, ?,  ?, ?, ?, ?, ?,  ?, ?, ?, ?,  ?, ?, ?)
`);
const selectQuotes = db.prepare(`
  SELECT q.*, e.from_addr, e.to_addr, e.subject, e.body, e.received_at, e.attachments,
         e.source_type, e.source_url
  FROM quotes q LEFT JOIN emails e ON e.id = q.email_id
  ORDER BY q.id DESC LIMIT 100
`);
const selectQuoteById = db.prepare(`
  SELECT q.*, e.from_addr, e.to_addr, e.subject, e.body, e.received_at, e.attachments,
         e.source_type, e.source_url
  FROM quotes q LEFT JOIN emails e ON e.id = q.email_id WHERE q.id = ?
`);
const updateQuoteState = db.prepare(`UPDATE quotes SET state = ?, dest_id = ? WHERE id = ?`);
const updateQuoteRoute = db.prepare(`
  UPDATE quotes SET dest_id = ?, rule_id = ?, fallback_dest_id = ?, fallback_rule_id = ?, score_json = ? WHERE id = ?
`);
const lockQuoteBound = db.prepare(`
  UPDATE quotes SET state = ?, final_terms_json = ?, bound_at = ?, locked = 1 WHERE id = ?
`);
const setQuoteState = db.prepare(`UPDATE quotes SET state = ? WHERE id = ?`);

const insertAudit = db.prepare(`
  INSERT INTO audit_log (quote_id, ts, actor, event, detail_json) VALUES (?, ?, ?, ?, ?)
`);
const selectAuditForQuote = db.prepare(`
  SELECT * FROM audit_log WHERE quote_id = ? ORDER BY ts ASC, id ASC
`);
const selectAuditAll = db.prepare(`
  SELECT a.*, q.ref, q.assured FROM audit_log a
  LEFT JOIN quotes q ON q.id = a.quote_id
  ORDER BY a.ts DESC, a.id DESC LIMIT 500
`);

function logAudit(quoteId, actor, event, detail) {
  insertAudit.run(quoteId, new Date().toISOString(), actor, event, detail ? JSON.stringify(detail) : null);
}
function rowToAuditEntry(r) {
  return {
    id: r.id, quoteId: r.quote_id, ts: r.ts, actor: r.actor, event: r.event,
    detail: r.detail_json ? JSON.parse(r.detail_json) : null,
    ref: r.ref || null, assured: r.assured || null,
  };
}
const updateQuoteFull = db.prepare(`
  UPDATE quotes SET
    assured = ?, domicile_country = ?, industry = ?,
    cls = ?, sub_class = ?, geography = ?, tiv_usd = ?,
    placement_type = ?, inception_date = ?, premium_k = ?, expiring_carrier = ?, binder_id = ?,
    loss_ratio_5yr = ?, years_of_losses = ?,
    dest_id = ?, rule_id = ?, confidence = ?, reasoning = ?, trace = ?
  WHERE id = ?
`);
const updateEmailBodyAndAttachments = db.prepare(`
  UPDATE emails SET body = ?, attachments = ? WHERE id = ?
`);

function refFor(cls) {
  const code = { Property: 'PRP', Marine: 'MAR', Cyber: 'CYB', 'D&O': 'DNO', Casualty: 'CAS',
                 Aviation: 'AVI', PI: 'PI', Terrorism: 'TER', 'Political Risk': 'POL',
                 'Kidnap & Ransom': 'KNR' }[cls] || 'GEN';
  const n = Math.floor(100000 + Math.random() * 899999);
  return `HDN-${code}-${n}`;
}

// Completeness = filled / applicable. Required fields always count. Optional
// fields (tiv_usd, expiring_carrier, binder_id) only count when they should
// apply — a Cyber new-business placement has no TIV and no expiring carrier,
// so scoring them against it would be a false negative. This way a fully
// referred submission can legitimately score 100%.
const REQUIRED_FIELDS = [
  'assured', 'domicile_country', 'industry',
  'cls', 'sub_class', 'geography',
  'placement_type', 'inception_date', 'premium_k',
  'loss_ratio_5yr', 'years_of_losses',
];
const EXTRACTABLE_FIELDS = [
  ...REQUIRED_FIELDS,
  'tiv_usd', 'expiring_carrier', 'binder_id',
];
function isFieldApplicable(field, row) {
  if (REQUIRED_FIELDS.includes(field)) return true;
  if (field === 'tiv_usd') {
    return row.cls === 'Property' || row.cls === 'Casualty';
  }
  if (field === 'expiring_carrier') {
    const pt = row.placement_type;
    return pt === 'renewal' || pt === 'endorsement' || pt === 'mid_term';
  }
  if (field === 'binder_id') {
    return row.dest_id === 'gxb' || !!row.binder_id;
  }
  return true;
}
function fieldHasValue(field, row) {
  const v = row[field];
  if (v == null) return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  if (field === 'geography') {
    try { return JSON.parse(v).length > 0; } catch { return false; }
  }
  return true;
}
function computeCompleteness(row) {
  let filled = 0, applicable = 0;
  for (const f of EXTRACTABLE_FIELDS) {
    if (!isFieldApplicable(f, row)) continue;
    applicable++;
    if (fieldHasValue(f, row)) filled++;
  }
  return {
    pct: applicable ? Math.round((filled / applicable) * 100) : 0,
    filled,
    total: applicable,
  };
}

function rowToQuote(row) {
  if (!row) return null;
  const createdAt = row.created_at;
  const minsAgo = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
  const completeness = computeCompleteness(row);
  return {
    id: row.id,
    ref: row.ref,

    // Assured
    assured: row.assured,
    domicileCountry: row.domicile_country,
    industry: row.industry,

    // Risk
    cls: row.cls,
    subClass: row.sub_class,
    geography: row.geography ? JSON.parse(row.geography) : [],
    tivUsd: row.tiv_usd,

    // Placement
    placementType: row.placement_type,
    inceptionDate: row.inception_date,
    premiumK: row.premium_k,
    premium: row.premium_k * 1000,
    bucket: bucketFor(row.premium_k),
    expiringCarrier: row.expiring_carrier,
    binderId: row.binder_id,

    // Loss history
    lossRatio5yr: row.loss_ratio_5yr,
    yearsOfLosses: row.years_of_losses,

    // Routing
    destId: row.dest_id,
    ruleId: row.rule_id,
    fallbackDestId: row.fallback_dest_id,
    fallbackRuleId: row.fallback_rule_id,
    score: row.score_json ? JSON.parse(row.score_json) : null,
    state: row.state,
    confidence: row.confidence,
    reasoning: row.reasoning,
    trace: row.trace ? JSON.parse(row.trace) : [],

    // Lifecycle
    finalTerms: row.final_terms_json ? JSON.parse(row.final_terms_json) : null,
    boundAt: row.bound_at,
    locked: !!row.locked,

    // Metadata
    broker: row.broker,
    subject: row.subject || `${row.cls} — ${row.assured}`,
    createdAt,
    minsAgo,
    completeness,
    email: row.email_id ? {
      id: row.email_id,
      from: row.from_addr,
      to: row.to_addr,
      subject: row.subject,
      body: row.body,
      receivedAt: row.received_at,
      attachments: row.attachments ? JSON.parse(row.attachments) : [],
      sourceType: row.source_type || 'email',
      sourceUrl: row.source_url || null,
    } : null,
  };
}

// Map a MIME type / filename to one of the source_type buckets the drawer
// knows how to render. Defaults to 'email' for plain text, since the email
// chrome handles raw text nicely.
function classifySource({ name = '', type = '' }) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (type?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) return 'image';
  if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    type === 'application/msword' ||
    ext === 'docx' || ext === 'doc'
  ) return 'docx';
  return 'email';
}

// Persist an attachment's bytes under /uploads/ so the drawer can show
// the actual document via Chrome's native viewer. Returns { absolutePath,
// relativeUrl, sanitizedName }.
async function saveAttachment(attachment) {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  const buf = Buffer.from(attachment.dataBase64, 'base64');
  const safeBase = (attachment.name || 'document')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .slice(0, 80) || 'document';
  const stamp = Date.now().toString(36);
  const tag = crypto.randomBytes(3).toString('hex');
  const dotIdx = safeBase.lastIndexOf('.');
  const filename = dotIdx > 0
    ? `${safeBase.slice(0, dotIdx)}-${stamp}-${tag}${safeBase.slice(dotIdx)}`
    : `${safeBase}-${stamp}-${tag}`;
  const absolutePath = path.join(UPLOADS_DIR, filename);
  await fs.writeFile(absolutePath, buf);
  return {
    absolutePath,
    relativeUrl: `/uploads/${filename}`,
    sanitizedName: filename,
  };
}

async function ingestEmail({ from, to, subject, body, attachments = [], attachment, broker }) {
  // Binary attachments (PDF/DOCX/image) get persisted to /uploads/ so the
  // drawer can render the actual document via Chrome's native viewer.
  // Plain text / .eml never reaches this branch — those stay in `body`.
  let sourceType = 'email';
  let sourceUrl = null;
  const allAttachments = [...(attachments || [])];

  if (attachment?.dataBase64) {
    sourceType = classifySource(attachment);
    if (sourceType !== 'email') {
      const saved = await saveAttachment(attachment);
      sourceUrl = saved.relativeUrl;
      if (attachment.name && !allAttachments.includes(attachment.name)) {
        allAttachments.push(attachment.name);
      }
    }
  } else if (attachment?.name && !allAttachments.includes(attachment.name)) {
    allAttachments.push(attachment.name);
  }

  // Claude's `document` content block only accepts PDFs. For DOCX we extract
  // the text with mammoth and merge it into the body so the extractor sees
  // real content instead of a base64 ZIP. The binary still gets saved to
  // /uploads/ for the drawer preview.
  let extractedBody = body || '';
  let extractAttachment = attachment;
  if (attachment?.dataBase64 && sourceType === 'docx') {
    try {
      const buf = Buffer.from(attachment.dataBase64, 'base64');
      const out = await mammoth.extractRawText({ buffer: buf });
      const docText = (out.value || '').trim();
      if (docText) {
        const header = `--- Attached document: ${attachment.name || 'document.docx'} ---`;
        extractedBody = extractedBody
          ? `${extractedBody}\n\n${header}\n${docText}`
          : `${header}\n${docText}`;
      }
    } catch (err) {
      console.warn('[ingest] mammoth failed:', err.message);
    }
    // Don't ship the docx bytes to Claude — it can't read them.
    extractAttachment = undefined;
  }

  const emailRes = insertEmail.run(
    from, to || 'triage@howden.com', subject, body || '',
    new Date().toISOString(), JSON.stringify(allAttachments),
    sourceType, sourceUrl,
  );
  const emailId = emailRes.lastInsertRowid;

  const extraction = await extract({ subject, from, body: extractedBody, attachment: extractAttachment });
  // Load rules fresh on every ingest so admin edits take effect without
  // a server restart.
  const liveRules = loadRules(db);
  const routing = route(extraction, liveRules);
  const fallback = pickFallback(extraction, routing.destId);
  const score = scoreDecision(extraction, routing.destId, routing.ruleId);

  const nowIso = new Date().toISOString();
  const quoteRes = insertQuote.run(
    refFor(extraction.cls),
    extraction.assured,
    extraction.domicile_country,
    extraction.industry,
    extraction.cls,
    extraction.sub_class,
    JSON.stringify(extraction.geography || []),
    extraction.tiv_usd,
    extraction.placement_type,
    extraction.inception_date,
    extraction.premium_k,
    extraction.expiring_carrier,
    extraction.binder_id,
    extraction.loss_ratio_5yr,
    extraction.years_of_losses,
    routing.destId,
    routing.ruleId,
    fallback.destId,
    fallback.ruleId,
    JSON.stringify(score),
    'submitted',
    extraction.confidence,
    extraction.reasoning,
    JSON.stringify(routing.trace),
    broker || from.split('@')[1] || 'Unknown',
    emailId,
    nowIso,
  );
  const quoteId = quoteRes.lastInsertRowid;

  // Audit trail — three entries per ingest so the broker/admin can see
  // the full arrival story.
  logAudit(quoteId, 'cerebro', 'ingested', {
    source: sourceType,
    from, subject,
    attachments: allAttachments,
  });
  logAudit(quoteId, 'cerebro', 'extracted', {
    confidence: extraction.confidence,
    reasoning: extraction.reasoning,
    fields: EXTRACTABLE_FIELDS.reduce((acc, f) => {
      const v = extraction[f];
      if (v != null && v !== '' && !(Array.isArray(v) && v.length === 0)) acc[f] = v;
      return acc;
    }, {}),
  });
  logAudit(quoteId, 'cerebro', 'routed', {
    primary: { destId: routing.destId, ruleId: routing.ruleId },
    fallback: { destId: fallback.destId, ruleId: fallback.ruleId, reason: fallback.reason },
    score,
  });

  return rowToQuote(selectQuoteById.get(quoteId));
}

// --- API ---

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    claudeConfigured: !!process.env.ANTHROPIC_API_KEY,
    model: process.env.CLAUDE_MODEL || 'claude-opus-4-7',
    mode: process.env.ANTHROPIC_API_KEY ? 'live' : 'mock',
  });
});

// ============================================================
// Rules engine CRUD — editable from the admin UI. The DB is the
// source of truth at runtime; ingest/augment call loadRules() on
// every invocation so edits take effect without restarting the
// server. See server/rules.js for the predicate AST shape.
// ============================================================

// Fields that the predicate AST understands. The UI uses this list to
// populate the "field" dropdown and to pick sensible input types.
const PREDICATE_FIELDS = [
  { id: 'premium_k',        label: 'Premium (thousands)', type: 'number' },
  { id: 'cls',              label: 'Class',               type: 'class'  },
  { id: 'geography',        label: 'Geography',           type: 'geo'    },
  { id: 'binder_id',        label: 'Binder ID',           type: 'string' },
  { id: 'confidence',       label: 'Extraction confidence', type: 'number' },
  { id: 'loss_ratio_5yr',   label: '5yr loss ratio',      type: 'number' },
  { id: 'domicile_country', label: 'Domicile country',    type: 'string' },
  { id: 'placement_type',   label: 'Placement type',      type: 'string' },
  { id: 'sub_class',        label: 'Sub-class',           type: 'string' },
  { id: 'tiv_usd',          label: 'TIV (USD)',           type: 'number' },
  { id: 'expiring_carrier', label: 'Expiring carrier',    type: 'string' },
];
const VALID_FIELDS = new Set(PREDICATE_FIELDS.map(f => f.id));
const VALID_OPS = new Set(['==', '!=', '>', '>=', '<', '<=', 'in', 'not_in', 'present', 'absent', 'contains']);

function validatePredicate(pred) {
  if (!pred) return { ok: true };
  if (typeof pred !== 'object') return { ok: false, error: 'predicate must be an object' };
  if (Array.isArray(pred.all) || Array.isArray(pred.any)) {
    const arr = pred.all || pred.any;
    for (const c of arr) {
      const r = validatePredicate(c);
      if (!r.ok) return r;
    }
    return { ok: true };
  }
  const { field, op } = pred;
  if (!field || !VALID_FIELDS.has(field)) return { ok: false, error: `unknown field: ${field}` };
  if (!op || !VALID_OPS.has(op)) return { ok: false, error: `unknown operator: ${op}` };
  return { ok: true };
}

const insertRule = db.prepare(`
  INSERT INTO rules (id, tier, name, description, enabled, priority, kind, predicate_json, dest_id, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const updateRuleStmt = db.prepare(`
  UPDATE rules SET name = ?, description = ?, enabled = ?, priority = ?,
                   kind = ?, predicate_json = ?, dest_id = ?, tier = ?, updated_at = ?
  WHERE id = ?
`);
const deleteRuleStmt = db.prepare('DELETE FROM rules WHERE id = ?');
const selectRuleById = db.prepare('SELECT * FROM rules WHERE id = ?');
const bumpPriority = db.prepare('UPDATE rules SET priority = ?, updated_at = ? WHERE id = ?');

function logRuleChange(event, detail) {
  // Audit entries for rule edits aren't attached to a quote, so we
  // store quote_id = 0 and surface them in the general audit feed.
  insertAudit.run(0, new Date().toISOString(), 'admin', event, JSON.stringify(detail));
}

app.get('/api/rules', (req, res) => {
  const rules = loadRules(db);
  res.json({
    rules,
    destinations: DESTINATIONS,
    tiers: TIER_ORDER,
    fields: PREDICATE_FIELDS,
    ops: Array.from(VALID_OPS),
    undeletable: Array.from(UNDELETABLE_RULE_IDS),
  });
});

app.put('/api/rules/:id', (req, res) => {
  const id = req.params.id;
  const existing = selectRuleById.get(id);
  if (!existing) return res.status(404).json({ error: 'rule not found' });

  const patch = req.body || {};
  // dest_id must resolve to a real destination.
  const destId = patch.dest_id ?? existing.dest_id;
  if (!DESTINATIONS[destId]) return res.status(400).json({ error: `invalid dest_id: ${destId}` });

  // Predicate must parse & reference valid fields. For builtin rules we
  // keep whatever predicate they had (ignored at runtime anyway).
  let predicate = patch.predicate !== undefined ? patch.predicate : (existing.predicate_json ? JSON.parse(existing.predicate_json) : null);
  const kind = patch.kind ?? existing.kind;
  if (kind === 'predicate') {
    const v = validatePredicate(predicate);
    if (!v.ok) return res.status(400).json({ error: `invalid predicate: ${v.error}` });
  }

  const tier = patch.tier ?? existing.tier;
  if (!TIER_ORDER.includes(tier)) return res.status(400).json({ error: `invalid tier: ${tier}` });

  const next = {
    name: patch.name ?? existing.name,
    description: patch.description ?? existing.description ?? '',
    enabled: patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : existing.enabled,
    priority: patch.priority ?? existing.priority,
    kind,
    predicate_json: predicate ? JSON.stringify(predicate) : null,
    dest_id: destId,
    tier,
    updated_at: new Date().toISOString(),
  };
  updateRuleStmt.run(
    next.name, next.description, next.enabled, next.priority,
    next.kind, next.predicate_json, next.dest_id, next.tier, next.updated_at,
    id,
  );
  logRuleChange('rule_edited', {
    id,
    before: {
      name: existing.name, enabled: !!existing.enabled, priority: existing.priority,
      dest_id: existing.dest_id, predicate: existing.predicate_json ? JSON.parse(existing.predicate_json) : null,
    },
    after: { ...next, enabled: !!next.enabled, predicate },
  });

  res.json({ rule: loadRules(db).find(r => r.id === id) });
});

app.post('/api/rules', (req, res) => {
  const { id, tier, name, description, enabled, kind, predicate, dest_id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id is required' });
  if (selectRuleById.get(id)) return res.status(409).json({ error: 'rule id already exists' });
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!tier || !TIER_ORDER.includes(tier)) return res.status(400).json({ error: 'valid tier is required' });
  if (!dest_id || !DESTINATIONS[dest_id]) return res.status(400).json({ error: 'valid dest_id is required' });
  const k = kind || 'predicate';
  if (k === 'predicate') {
    const v = validatePredicate(predicate);
    if (!v.ok) return res.status(400).json({ error: `invalid predicate: ${v.error}` });
  }

  // New rules fire at the top of their tier by default — priority is
  // min-of-tier minus 1 so reorder-by-index still produces a sane sort.
  const tierMin = db.prepare('SELECT MIN(priority) as p FROM rules WHERE tier = ?').get(tier).p;
  const priority = (tierMin ?? 1000) - 1;
  const now = new Date().toISOString();
  insertRule.run(
    id, tier, name, description || '',
    enabled === false ? 0 : 1, priority, k,
    predicate ? JSON.stringify(predicate) : null,
    dest_id, now,
  );
  logRuleChange('rule_created', { id, tier, name, dest_id, kind: k });
  res.json({ rule: loadRules(db).find(r => r.id === id) });
});

app.delete('/api/rules/:id', (req, res) => {
  const id = req.params.id;
  if (UNDELETABLE_RULE_IDS.has(id)) {
    return res.status(409).json({ error: `${id} is the safety-net fallback and cannot be deleted` });
  }
  const existing = selectRuleById.get(id);
  if (!existing) return res.status(404).json({ error: 'rule not found' });
  if (existing.kind === 'builtin') {
    return res.status(409).json({ error: 'built-in rules cannot be deleted — disable them instead' });
  }
  deleteRuleStmt.run(id);
  logRuleChange('rule_deleted', { id, name: existing.name, tier: existing.tier });
  res.json({ ok: true });
});

// Body: { ids: [ruleId, ...] } — array position becomes new priority.
// Priorities are sparse (multiples of 10) so single-rule edits later on
// don't need to renumber the whole list.
app.post('/api/rules/reorder', (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array is required' });
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    ids.forEach((id, idx) => bumpPriority.run((idx + 1) * 10, now, id));
  });
  tx();
  logRuleChange('rule_reordered', { ids });
  res.json({ rules: loadRules(db) });
});

app.post('/api/rules/reset', (req, res) => {
  resetRulesToDefaults(db);
  logRuleChange('rule_reset', { note: 'Rules reset to factory defaults' });
  res.json({ rules: loadRules(db) });
});

app.get('/api/quotes', (req, res) => {
  res.json({ quotes: selectQuotes.all().map(rowToQuote) });
});

app.get('/api/quotes/:id', (req, res) => {
  const q = rowToQuote(selectQuoteById.get(Number(req.params.id)));
  if (!q) return res.status(404).json({ error: 'not found' });
  res.json({ quote: q });
});

// Pasted / forwarded email → full pipeline. Accepts an optional `attachment`
// ({ name, type, dataBase64 }) for PDFs or images — Claude reads it directly.
app.post('/api/ingest', async (req, res) => {
  try {
    const { from, to, subject, body, attachments, attachment, broker } = req.body || {};
    const hasAttachment = attachment?.dataBase64;
    if (!hasAttachment && (!subject || !body)) {
      return res.status(400).json({ error: 'subject and body are required when no attachment is provided' });
    }
    const quote = await ingestEmail({
      from: from || 'demo@howden.com',
      to, subject, body, attachments, attachment, broker,
    });
    res.json({ quote });
  } catch (err) {
    console.error('[ingest] error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Trigger one of the seed emails (demo convenience).
app.post('/api/ingest-sample', async (req, res) => {
  try {
    const idx = Number(req.body?.index);
    const sample = Number.isInteger(idx) && SEED_EMAILS[idx]
      ? SEED_EMAILS[idx]
      : SEED_EMAILS[Math.floor(Math.random() * SEED_EMAILS.length)];
    const quote = await ingestEmail(sample);
    res.json({ quote, sample: { subject: sample.subject, from: sample.from } });
  } catch (err) {
    console.error('[ingest-sample] error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/samples', (req, res) => {
  res.json({
    samples: SEED_EMAILS.map((e, i) => ({
      index: i, from: e.from, to: e.to, subject: e.subject,
      body: e.body, attachments: e.attachments || [],
    })),
  });
});

// Legacy — keep for backward compat. Just moves a quote to a destination
// without audit. Prefer /accept or /override.
app.post('/api/quotes/:id/forward', (req, res) => {
  const id = Number(req.params.id);
  const existing = selectQuoteById.get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const dest = req.body?.destId || existing.dest_id;
  updateQuoteState.run('submitted', dest, id);
  res.json({ quote: rowToQuote(selectQuoteById.get(id)) });
});

// ============================================================
// Lifecycle actions (broker control)
// ============================================================

// Accept Cerebro's recommendation (or the chosen route) and bind.
// Body: { finalTerms: { premium_k, carrier, inception_date, notes }, actor }
// Sets state → bound, captures final terms, locks the record. Then
// auto-advances to 'processing' after a short delay so the UI can show
// the transition.
app.post('/api/quotes/:id/accept', (req, res) => {
  const id = Number(req.params.id);
  const existing = selectQuoteById.get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (existing.locked) return res.status(409).json({ error: 'quote is already locked' });

  const { finalTerms, actor } = req.body || {};
  const terms = {
    premium_k: finalTerms?.premium_k ?? existing.premium_k,
    carrier: finalTerms?.carrier ?? existing.expiring_carrier ?? 'TBC',
    inception_date: finalTerms?.inception_date ?? existing.inception_date,
    notes: finalTerms?.notes || '',
  };
  lockQuoteBound.run('bound', JSON.stringify(terms), new Date().toISOString(), id);
  logAudit(id, actor || 'broker', 'accepted', { destId: existing.dest_id, ruleId: existing.rule_id });
  logAudit(id, 'system', 'bound', { finalTerms: terms });

  // Auto-advance to processing to represent downstream data distribution.
  setTimeout(() => {
    try {
      setQuoteState.run('processing', id);
      logAudit(id, 'system', 'processing', { note: 'Downstream distribution started' });
    } catch (err) { console.warn('[accept] auto-advance failed:', err.message); }
  }, 2500);

  res.json({ quote: rowToQuote(selectQuoteById.get(id)) });
});

// Broker overrides Cerebro's pick. Body: { destId, reason, actor }.
// Updates primary route + logs rationale. State remains 'submitted'.
app.post('/api/quotes/:id/override', (req, res) => {
  const id = Number(req.params.id);
  const existing = selectQuoteById.get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (existing.locked) return res.status(409).json({ error: 'quote is already locked' });

  const { destId, reason, actor } = req.body || {};
  if (!destId || !DESTINATIONS[destId]) return res.status(400).json({ error: 'valid destId is required' });

  const extraction = rowToExtraction(existing);
  const fb = pickFallback(extraction, destId);
  const score = scoreDecision(extraction, destId, 'OVERRIDE');
  updateQuoteRoute.run(destId, 'OVERRIDE', fb.destId, fb.ruleId, JSON.stringify(score), id);
  logAudit(id, actor || 'broker', 'overridden', {
    from: { destId: existing.dest_id, ruleId: existing.rule_id },
    to:   { destId, ruleId: 'OVERRIDE' },
    reason: reason || '(none provided)',
  });

  res.json({ quote: rowToQuote(selectQuoteById.get(id)) });
});

// Request more data from the producing broker. Body: { fields[], notes, actor }.
// For the demo we just log it — a real system would draft an email.
app.post('/api/quotes/:id/rfi', (req, res) => {
  const id = Number(req.params.id);
  const existing = selectQuoteById.get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (existing.locked) return res.status(409).json({ error: 'quote is already locked' });

  const { fields = [], notes = '', actor } = req.body || {};
  logAudit(id, actor || 'broker', 'rfi_sent', {
    fields,
    notes,
    to: existing.from_addr || 'producing broker',
  });

  res.json({ quote: rowToQuote(selectQuoteById.get(id)) });
});

app.get('/api/quotes/:id/audit', (req, res) => {
  const id = Number(req.params.id);
  const rows = selectAuditForQuote.all(id);
  res.json({ entries: rows.map(rowToAuditEntry) });
});

app.get('/api/audit', (req, res) => {
  const rows = selectAuditAll.all();
  res.json({ entries: rows.map(rowToAuditEntry) });
});

// ============================================================
// Augment an existing quote — broker found more info (e.g. selected
// extra text on a page, dropped a follow-up document) and wants to
// fold it into a partially-complete quote rather than open a new one.
//
// The new content is appended to the email's body, Claude re-extracts
// from the combined corpus, and the merged extraction is persisted.
// ============================================================
function rowToExtraction(row) {
  return {
    assured: row.assured,
    domicile_country: row.domicile_country,
    industry: row.industry,
    cls: row.cls,
    sub_class: row.sub_class,
    geography: row.geography ? JSON.parse(row.geography) : [],
    tiv_usd: row.tiv_usd,
    placement_type: row.placement_type,
    inception_date: row.inception_date,
    premium_k: row.premium_k,
    expiring_carrier: row.expiring_carrier,
    binder_id: row.binder_id,
    loss_ratio_5yr: row.loss_ratio_5yr,
    years_of_losses: row.years_of_losses,
    confidence: row.confidence,
    reasoning: row.reasoning,
  };
}

const isEmpty = (v) =>
  v == null ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0);

// Merge two extractions. Prefer fresh non-null values; fall back to
// existing ones when fresh is null/empty. Confidence is monotonic up:
// more context shouldn't make us less sure.
function mergeExtractions(existing, fresh) {
  const out = { ...existing };
  for (const k of Object.keys(fresh)) {
    if (isEmpty(fresh[k])) continue;
    out[k] = fresh[k];
  }
  if (fresh.confidence != null) {
    out.confidence = Math.max(existing.confidence ?? 0, fresh.confidence);
  }
  return out;
}

app.post('/api/quotes/:id/augment', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = selectQuoteById.get(id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    if (!existing.email_id) {
      return res.status(409).json({ error: 'this quote has no source email to augment' });
    }

    const { from: addFrom, subject: addSubject, body: addBody, attachment } = req.body || {};
    if (!addBody?.trim() && !attachment?.dataBase64) {
      return res.status(400).json({ error: 'body or attachment is required' });
    }

    const prevConfidence = existing.confidence;
    const prevCompleteness = computeCompleteness(existing).pct;

    // Resolve any new docx text via mammoth (Claude can't read .docx natively)
    let augmentText = (addBody || '').trim();
    let extractAttachment = attachment;
    if (attachment?.dataBase64 && classifySource(attachment) === 'docx') {
      try {
        const buf = Buffer.from(attachment.dataBase64, 'base64');
        const out = await mammoth.extractRawText({ buffer: buf });
        if (out.value) {
          const docHeader = `--- Attached document: ${attachment.name || 'document.docx'} ---`;
          augmentText = augmentText ? `${augmentText}\n\n${docHeader}\n${out.value}` : `${docHeader}\n${out.value}`;
        }
      } catch (err) {
        console.warn('[augment] mammoth failed:', err.message);
      }
      extractAttachment = undefined;
    }

    // Persist any new binary attachment (PDF/image) to /uploads/ and add its
    // filename to the email's attachments list. The original source_url stays.
    const existingAttachmentNames = existing.attachments ? JSON.parse(existing.attachments) : [];
    const updatedAttachmentNames = [...existingAttachmentNames];
    if (attachment?.dataBase64) {
      const cs = classifySource(attachment);
      if (cs !== 'email') await saveAttachment(attachment);
      if (attachment.name && !updatedAttachmentNames.includes(attachment.name)) {
        updatedAttachmentNames.push(attachment.name);
      }
    }

    // Compose augmented body for Claude
    const augHeader = '--- AUGMENTATION (broker added more info) ---'
      + (addFrom ? `\nFrom: ${addFrom}` : '')
      + (addSubject ? `\nSubject: ${addSubject}` : '');
    const combinedBody = `${existing.body || ''}\n\n${augHeader}\n${augmentText}`;

    // If the original source was a PDF/image, re-attach it so Claude has
    // the full picture (its content isn't in the body).
    if (!extractAttachment && existing.source_url && (existing.source_type === 'pdf' || existing.source_type === 'image')) {
      try {
        const filePath = path.resolve(__dirname, '..', existing.source_url.replace(/^\//, ''));
        const data = await fs.readFile(filePath);
        const mime = existing.source_type === 'pdf'
          ? 'application/pdf'
          : (`image/${(existing.source_url.split('.').pop() || 'png').toLowerCase().replace('jpg', 'jpeg')}`);
        extractAttachment = {
          name: existingAttachmentNames[0] || (existing.source_type + ' document'),
          type: mime,
          dataBase64: data.toString('base64'),
        };
      } catch (err) {
        console.warn('[augment] could not re-attach original source:', err.message);
      }
    }

    const newExtraction = await extract({
      subject: existing.subject,
      from: existing.from_addr,
      body: combinedBody,
      attachment: extractAttachment,
    });

    const merged = mergeExtractions(rowToExtraction(existing), newExtraction);
    // Load rules fresh for every augment so live edits take effect.
    const liveRules = loadRules(db);
    const routing = route(merged, liveRules);
    const fallback = pickFallback(merged, routing.destId);
    const score = scoreDecision(merged, routing.destId, routing.ruleId);

    updateQuoteFull.run(
      merged.assured,
      merged.domicile_country,
      merged.industry,
      merged.cls,
      merged.sub_class,
      JSON.stringify(merged.geography || []),
      merged.tiv_usd,
      merged.placement_type,
      merged.inception_date,
      merged.premium_k,
      merged.expiring_carrier,
      merged.binder_id,
      merged.loss_ratio_5yr,
      merged.years_of_losses,
      routing.destId,
      routing.ruleId,
      merged.confidence,
      newExtraction.reasoning || merged.reasoning,
      JSON.stringify(routing.trace),
      id,
    );
    updateQuoteRoute.run(routing.destId, routing.ruleId, fallback.destId, fallback.ruleId, JSON.stringify(score), id);
    updateEmailBodyAndAttachments.run(
      combinedBody,
      JSON.stringify(updatedAttachmentNames),
      existing.email_id,
    );
    logAudit(id, 'broker', 'augmented', {
      prevConfidence: prevConfidence,
      newConfidence: merged.confidence,
      addedSubject: addSubject || null,
      addedAttachment: attachment?.name || null,
    });

    const fresh = selectQuoteById.get(id);
    const newCompleteness = computeCompleteness(fresh).pct;
    res.json({
      quote: rowToQuote(fresh),
      delta: {
        prevConfidence,
        newConfidence: merged.confidence,
        prevCompleteness,
        newCompleteness,
      },
    });
  } catch (err) {
    console.error('[augment] error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Placeholder for future Postmark/SendGrid inbound parsing. Same signature,
// different input shape — leaving the route wired so we can plug it in.
app.post('/api/email/inbound', async (req, res) => {
  try {
    const body = req.body || {};
    const quote = await ingestEmail({
      from: body.From || body.from,
      to: body.To || body.to,
      subject: body.Subject || body.subject,
      body: body.TextBody || body.text || body.body || '',
      attachments: (body.Attachments || body.attachments || []).map(a => a.Name || a.filename),
    });
    res.json({ quote });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Static frontend (so you can run the whole demo on one port) ---
app.use(express.static(path.join(__dirname, '..')));

// --- Startup: seed if empty ---
async function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) as n FROM quotes').get().n;
  if (count > 0) return;
  console.log('[seed] empty DB — ingesting sample emails…');
  for (const email of SEED_EMAILS) {
    try { await ingestEmail(email); } catch (err) { console.warn('[seed] failed:', err.message); }
  }
  console.log(`[seed] done — ${SEED_EMAILS.length} quotes`);
}

app.listen(PORT, async () => {
  console.log(`Cerebro server on http://localhost:${PORT}`);
  console.log(`  mode: ${process.env.ANTHROPIC_API_KEY ? 'live (Claude)' : 'mock (keyword extractor)'}`);
  // Seed the editable rules table from the canonical RULES array on first boot.
  const seeded = seedRulesIfEmpty(db);
  if (seeded) console.log(`[seed] rules table seeded from defaults (${RULES.length} rules)`);
  await seedIfEmpty();
});
