import Anthropic from '@anthropic-ai/sdk';

// Tool schema for structured extraction. Matches the reduced v2 data model
// in TRIAGE_MODEL.md — 14 fields plus confidence/reasoning. Nullable fields
// should be returned as null when not present in the source, not guessed.
const EXTRACT_TOOL = {
  name: 'submit_quote_extraction',
  description: 'Submit the structured extraction of the insurance quote referral.',
  input_schema: {
    type: 'object',
    properties: {
      // --- Assured ---
      assured: {
        type: 'string',
        description: 'Insured legal entity name. Exact legal-entity spelling if available.',
      },
      domicile_country: {
        type: ['string', 'null'],
        description: "ISO-3166 alpha-2 country code where the assured is domiciled (e.g. 'GB', 'US', 'NO'). Null if not stated.",
      },
      industry: {
        type: ['string', 'null'],
        description: "One-line industry description, e.g. 'Cold-storage food manufacturing', 'Offshore supply shipping', 'SaaS software'.",
      },

      // --- Risk ---
      cls: {
        type: 'string',
        enum: ['Property', 'Marine', 'Cyber', 'D&O', 'Casualty', 'Aviation', 'PI', 'Terrorism', 'Political Risk', 'Kidnap & Ransom'],
        description: 'Primary insurance class.',
      },
      sub_class: {
        type: ['string', 'null'],
        description: "Sub-class if clear (e.g. 'All Risks', 'Hull & Machinery', 'Cargo', 'GL', 'EL', 'Cyber liability', 'Hull War').",
      },
      geography: {
        type: 'array',
        items: { type: 'string' },
        description: "ISO-3166 alpha-2 codes of every country where exposure sits. Empty array if unknown. Presence of 'US' is load-bearing for routing.",
      },
      tiv_usd: {
        type: ['integer', 'null'],
        description: 'Total Insurable Value in USD (Property risks). Null if not applicable or not stated.',
      },

      // --- Placement ---
      placement_type: {
        type: 'string',
        enum: ['new_business', 'renewal', 'endorsement', 'mid_term'],
        description: 'What kind of placement this is. Default to new_business if unclear.',
      },
      inception_date: {
        type: ['string', 'null'],
        description: 'ISO date (YYYY-MM-DD) of policy inception / renewal date. Null if not stated.',
      },
      premium_k: {
        type: 'integer',
        description: 'Target premium in thousands of USD. If only a range is given, use the midpoint. If wholly unstated, infer from limits/TIV/revenue (small SME 5–20, mid 30–120, large 200+).',
      },
      expiring_carrier: {
        type: ['string', 'null'],
        description: "Lead carrier on the expiring policy (renewals only). Null for new business.",
      },
      binder_id: {
        type: ['string', 'null'],
        description: "ONLY populate this when the email references a NAMED binder, delegated-authority scheme, or facility with an explicit identifier (e.g. 'GXB-MARINE-24', 'GXB-AVIA-26', 'Solicitors PI Scheme'). Do NOT populate for generic references to 'Trade+ Facility', 'Smart Follow', 'open market', 'facility placement', or any non-binder platform preference. When in doubt, return null.",
      },

      // --- Loss history ---
      loss_ratio_5yr: {
        type: ['number', 'null'],
        description: 'Five-year loss ratio as a decimal (0.45 = 45%). Null if no loss data.',
      },
      years_of_losses: {
        type: ['integer', 'null'],
        description: 'How many years of loss history were supplied. Null if none provided.',
      },

      // --- Meta ---
      confidence: {
        type: 'integer',
        description: 'Confidence 0-100 in this extraction overall. Be conservative — if assured/class/premium are ambiguous, drop below 70 so the submission is routed to manual review.',
      },
      reasoning: {
        type: 'string',
        description: 'One or two sentences explaining the key signals you used. Shown to the broker.',
      },
    },
    required: ['assured', 'cls', 'premium_k', 'placement_type', 'geography', 'confidence', 'reasoning'],
  },
};

const SYSTEM = `You are Cerebro, an insurance-referral triage assistant for Howden brokers.
A broker has forwarded an inbound submission (email and/or attached slip/SOV/PDF). Your job is to extract a structured summary so a deterministic rules engine can route it to the right placement platform (Trade+, Whitespace, PPL, GXB, Acturis, or manual review).

Rules for extraction:
- If a field is not present or inferable, return null. Do NOT guess.
- Geography must be every country where exposure sits, not where the broker is.
- For renewals, include the expiring carrier if named.
- For binder_id: only populate when the email names an explicit binder/scheme identifier (like 'GXB-MARINE-24' or 'Solicitors PI Scheme'). Generic mentions of "Trade+ Facility", "Smart Follow", "open market", or platform preferences are NOT binders — leave binder_id null.
- Loss ratio is a decimal (0.45 not 45).
- Be conservative on confidence — any real ambiguity should drop below 70.
- If the assured name is truly unstated, return "Unknown assured" (plain text, no angle brackets). Never use placeholders like <UNKNOWN> or N/A.

Always call the submit_quote_extraction tool exactly once.`;

export async function extractLive({ subject, from, body, attachment }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const client = new Anthropic({ apiKey });
  const model = process.env.CLAUDE_MODEL || 'claude-opus-4-7';

  const introLines = [];
  if (attachment) {
    introLines.push(`The broker attached a ${attachment.type} called "${attachment.name}". The main referral content is likely inside that attachment (slip, SOV, MRC, or quote request).`);
  }
  introLines.push(`Forwarded email:`);
  introLines.push(`From: ${from || '(not provided)'}`);
  introLines.push(`Subject: ${subject || '(not provided)'}`);
  introLines.push('');
  introLines.push('---');
  introLines.push(body || '(email body empty — rely on the attachment)');
  introLines.push('---');
  introLines.push('');
  introLines.push('Extract the structured fields and call submit_quote_extraction.');

  const content = [];
  if (attachment?.dataBase64) {
    if (attachment.type === 'application/pdf') {
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: attachment.dataBase64 },
      });
    } else if (attachment.type?.startsWith('image/')) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: attachment.type, data: attachment.dataBase64 },
      });
    }
  }
  content.push({ type: 'text', text: introLines.join('\n') });

  const resp = await client.messages.create({
    model,
    max_tokens: 1536,
    system: SYSTEM,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: 'tool', name: 'submit_quote_extraction' },
    messages: [{ role: 'user', content }],
  });

  const toolUse = resp.content.find(b => b.type === 'tool_use');
  if (!toolUse) throw new Error('Claude did not return a tool_use block');
  return { ...toolUse.input, source: 'claude', model };
}

// Deterministic mock used when ANTHROPIC_API_KEY is absent. Keyword-based —
// good enough to demo the flow without a key, but leaves the new nullable
// fields as null (honest about what it can't infer).
export function extractMock({ subject, from, body }) {
  const text = `${subject}\n${body}`.toLowerCase();
  const has = (w) => text.includes(w);

  let cls = 'Property';
  if (has('marine') || has('hull') || has('cargo') || has('vessel')) cls = 'Marine';
  else if (has('aviation') || has('aircraft')) cls = 'Aviation';
  else if (has('cyber') || has('ransomware') || has('data breach')) cls = 'Cyber';
  else if (has('d&o') || has('directors')) cls = 'D&O';
  else if (has('professional indemnity') || has(' pi ')) cls = 'PI';
  else if (has('terror')) cls = 'Terrorism';
  else if (has('casualty') || has('liability')) cls = 'Casualty';

  let premium_k = 15;
  const m1 = text.match(/\$?\s?(\d{1,4})\s?k/);
  const m2 = text.match(/\$\s?(\d{1,3})(?:,(\d{3}))/);
  const m3 = text.match(/(\d+(?:\.\d+)?)\s?m(?:illion)?/);
  if (m1) premium_k = parseInt(m1[1], 10);
  else if (m2) premium_k = Math.round(parseInt(m2[1] + (m2[2] || '000'), 10) / 1000);
  else if (m3) premium_k = Math.round(parseFloat(m3[1]) * 1000);

  const geography = [];
  if (has(' us ') || has('usa') || has('united states') || has('american')) geography.push('US');
  if (has(' uk ') || has('united kingdom') || has('british') || has('london')) geography.push('GB');
  if (has('europe')) geography.push('EU');

  const binderMatch = text.match(/binder[^\n]{0,80}([A-Z0-9][\w-]{2,})/i);
  const binder_id = has('binder') || has('delegated authority') || has('scheme')
    ? (binderMatch?.[1] || 'UNSPECIFIED_BINDER')
    : null;

  const placement_type = has('renewal') || has('renew') ? 'renewal'
    : has('endorse') ? 'endorsement'
    : 'new_business';

  let assured = 'Unknown Assured';
  const m4 = body.match(/\b(?:for|insured|assured|re:)\s+([A-Z][A-Za-z0-9&' ]{2,40}(?:Ltd|LLP|Inc|plc|SE|AG|AS|BV|Co|Holdings|Group)?)/);
  if (m4) assured = m4[1].trim();

  const confidence = 55 + Math.min(35, (m1 || m2 || m3 ? 15 : 0) + (m4 ? 10 : 0) + (cls !== 'Property' ? 5 : 0) + (geography.length ? 5 : 0));

  return {
    assured,
    domicile_country: null,
    industry: null,
    cls,
    sub_class: null,
    geography,
    tiv_usd: null,
    placement_type,
    inception_date: null,
    premium_k,
    expiring_carrier: null,
    binder_id,
    loss_ratio_5yr: null,
    years_of_losses: null,
    confidence,
    reasoning: `Mock extractor: matched class "${cls}" via keyword scan; premium parsed as $${premium_k}k.`,
    source: 'mock',
  };
}

export async function extract(email) {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await extractLive(email);
    } catch (err) {
      console.warn('[extractor] live call failed, falling back to mock:', err.message);
      return { ...extractMock(email), fallbackReason: err.message };
    }
  }
  if (email.attachment) {
    return {
      assured: 'Unknown (attachment-only)',
      domicile_country: null, industry: null,
      cls: 'Property', sub_class: null, geography: [], tiv_usd: null,
      placement_type: 'new_business', inception_date: null,
      premium_k: 25, expiring_carrier: null, binder_id: null,
      loss_ratio_5yr: null, years_of_losses: null,
      confidence: 35,
      reasoning: `Mock extractor can't read ${email.attachment.type} — set ANTHROPIC_API_KEY to use Claude for document extraction.`,
      source: 'mock',
    };
  }
  return extractMock(email);
}
