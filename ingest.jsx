/* global React */
const { useState: useStateIng, useEffect: useEffectIng, useMemo: useMemoIng } = React;

// ============================================================
// Ingestion modal — the unstructured → structured flow
// Left pane: raw email (editable textarea or sample picker)
// Right pane: animated structured-field reveal as Claude extracts
// ============================================================

const EMPTY_FIELDS = {
  assured: null, domicileCountry: null, industry: null,
  cls: null, subClass: null, geography: null, tivUsd: null,
  placementType: null, inceptionDate: null, premiumK: null,
  expiringCarrier: null, binderId: null,
  lossRatio5yr: null, yearsOfLosses: null,
  confidence: null, reasoning: null,
  destId: null, ruleId: null, trace: [],
};

function Field({ label, value, highlight, mono, animate }) {
  return (
    <div className={`ing-field ${animate ? 'pop' : ''}`}>
      <div className="ing-field-label">{label}</div>
      <div className={`ing-field-value ${mono ? 'mono' : ''} ${highlight ? 'highlight' : ''}`}>
        {value == null || value === ''
          ? <span className="ing-placeholder">—</span>
          : value}
      </div>
    </div>
  );
}

// Minimal RFC 822 / plain-text email parser. Handles .eml exports from
// Outlook, Apple Mail, Gmail "Show original", and plain forwarded bodies.
function parseEmailText(text) {
  // Split headers from body at the first blank line
  const sepIdx = text.search(/\r?\n\r?\n/);
  let headerBlock = '', body = text;
  if (sepIdx > 0 && sepIdx < 6000) {
    headerBlock = text.slice(0, sepIdx);
    body = text.slice(sepIdx).replace(/^\r?\n\r?\n/, '');
  }
  // Unfold continuation lines (leading whitespace means continuation)
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
  // If body is MIME-multipart, try to extract the text/plain part
  const boundaryMatch = (headers['content-type'] || '').match(/boundary="?([^";\s]+)"?/);
  if (boundaryMatch) {
    const parts = body.split(new RegExp('--' + boundaryMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const textPart = parts.find(p => /content-type:\s*text\/plain/i.test(p));
    if (textPart) {
      const innerSep = textPart.search(/\r?\n\r?\n/);
      if (innerSep > 0) body = textPart.slice(innerSep).replace(/^\r?\n\r?\n/, '').trim();
    }
  }
  return { from, subject, body: body.trim() };
}

function IngestModal({ open, onClose, onIngested }) {
  const [samples, setSamples] = useStateIng([]);
  const [sampleIndex, setSampleIndex] = useStateIng(0);
  const [subject, setSubject] = useStateIng('');
  const [from, setFrom] = useStateIng('');
  const [body, setBody] = useStateIng('');
  const [busy, setBusy] = useStateIng(false);
  const [error, setError] = useStateIng(null);
  const [fields, setFields] = useStateIng(EMPTY_FIELDS);
  const [animateKey, setAnimateKey] = useStateIng(0);
  const [stage, setStage] = useStateIng('idle'); // idle | extracting | routing | done
  const [dragOver, setDragOver] = useStateIng(false);
  const [droppedFileName, setDroppedFileName] = useStateIng(null);
  const [attachment, setAttachment] = useStateIng(null); // { name, type, size, dataBase64 } for PDFs/images

  useEffectIng(() => {
    if (!open) return;
    window.cerebroAPI?.samples().then(setSamples).catch(() => {});
  }, [open]);

  useEffectIng(() => {
    if (!samples.length) return;
    const s = samples[sampleIndex];
    if (!s) return;
    setSubject(s.subject); setFrom(s.from); setBody(s.body);
  }, [samples, sampleIndex]);

  async function handleIngest() {
    if (!attachment && (!subject.trim() || !body.trim())) {
      setError('Subject and body are required (or attach a PDF/image)');
      return;
    }
    setError(null); setBusy(true); setFields(EMPTY_FIELDS); setStage('extracting');

    try {
      const quote = await window.cerebroAPI.ingest({ from, subject, body, attachment });
      // Staged reveal for drama — shows the "unstructured → structured" story
      await revealStaged(quote);
      setStage('done');
      onIngested?.(quote);
    } catch (err) {
      setError(err.message);
      setStage('idle');
    } finally {
      setBusy(false);
    }
  }

  function revealStaged(quote) {
    return new Promise((resolve) => {
      const steps = [
        { delay: 180, patch: { assured: quote.assured, domicileCountry: quote.domicileCountry, industry: quote.industry } },
        { delay: 180, patch: { cls: quote.cls, subClass: quote.subClass } },
        { delay: 160, patch: { geography: quote.geography, tivUsd: quote.tivUsd } },
        { delay: 160, patch: { placementType: quote.placementType, inceptionDate: quote.inceptionDate } },
        { delay: 180, patch: { premiumK: quote.premiumK, expiringCarrier: quote.expiringCarrier, binderId: quote.binderId } },
        { delay: 160, patch: { lossRatio5yr: quote.lossRatio5yr, yearsOfLosses: quote.yearsOfLosses } },
        { delay: 220, patch: { confidence: quote.confidence, reasoning: quote.reasoning } },
        { delay: 280, patch: { __stage: 'routing' } },
        { delay: 260, patch: { destId: quote.destId, ruleId: quote.ruleId, trace: quote.trace } },
      ];
      let t = 0;
      steps.forEach((s) => {
        t += s.delay;
        setTimeout(() => {
          if (s.patch.__stage) setStage(s.patch.__stage);
          else {
            setFields(f => ({ ...f, ...s.patch }));
            setAnimateKey(k => k + 1);
          }
        }, t);
      });
      setTimeout(resolve, t + 200);
    });
  }

  function reset() {
    setFields(EMPTY_FIELDS); setStage('idle'); setError(null);
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        // result is "data:<mime>;base64,<data>"
        const s = String(r.result || '');
        resolve(s.split(',')[1] || '');
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  async function handleFiles(files) {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    const name = file.name || 'file';
    const type = file.type || '';
    const isPdf = type === 'application/pdf' || /\.pdf$/i.test(name);
    const isImage = type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(name);
    const isDocx = type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      || /\.docx$/i.test(name);
    const isEml = /\.eml$/i.test(name) || type === 'message/rfc822';
    const isText = type.startsWith('text/') || /\.txt$/i.test(name);

    if (/\.msg$/i.test(name)) {
      setError("Outlook .msg isn't supported — drag the message from Outlook (it exports as .eml), or save as .eml and drop that.");
      return;
    }
    if (/\.(xlsx?|pptx?|docm?)$/i.test(name) && !isDocx) {
      setError(`${name.split('.').pop().toUpperCase()} files aren't supported yet. Convert to PDF and drop it here.`);
      return;
    }

    try {
      if (isPdf || isImage || isDocx) {
        const dataBase64 = await fileToBase64(file);
        const mediaType = isPdf ? 'application/pdf'
          : isDocx ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : (type || 'image/png');
        setAttachment({ name, type: mediaType, size: file.size, dataBase64 });
        setDroppedFileName(name);
        const kind = isPdf ? 'PDF' : isDocx ? 'Word document' : 'image';
        if (!subject) setSubject(name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '));
        if (!body) setBody(`(Attached ${kind}: ${name}. Claude will extract the referral details directly from the file.)`);
        reset();
        return;
      }
      if (isEml || isText) {
        const text = await file.text();
        const parsed = parseEmailText(text);
        setFrom(parsed.from || from);
        setSubject(parsed.subject || subject || name.replace(/\.[^.]+$/, ''));
        setBody(parsed.body || text);
        setDroppedFileName(name);
        setAttachment(null);
        reset();
        return;
      }
      setError(`Unsupported file type: ${type || name}. Try .eml, .pdf, .png/.jpg, or plain text.`);
    } catch (err) {
      setError(`Could not read file: ${err.message}`);
    }
  }

  function removeAttachment() {
    setAttachment(null);
    setDroppedFileName(null);
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function onDrop(e) {
    e.preventDefault(); e.stopPropagation();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }
  function onDragOver(e) {
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer?.types?.includes('Files')) setDragOver(true);
  }
  function onDragLeave(e) {
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
    setDragOver(false);
  }

  if (!open) return null;

  const dest = fields.destId ? window.DESTINATIONS?.[fields.destId] : null;

  return (
    <div className="ing-backdrop" onClick={onClose}>
      <div className="ing-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ing-hd">
          <div>
            <div className="ing-eyebrow">INGEST · claude reasoning</div>
            <div className="ing-title">Unstructured email → structured referral</div>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="ing-body">
          {/* LEFT — raw email */}
          <div
            className={`ing-pane ing-pane-left ${dragOver ? 'drag-over' : ''}`}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragEnter={onDragOver}
            onDragLeave={onDragLeave}
          >
            <div className="ing-pane-hd">
              <span className="material-symbols-outlined">mail</span>
              <div className="ing-pane-title">Raw email</div>
              <label className="ing-upload-btn" title="Upload .eml file">
                <span className="material-symbols-outlined">upload_file</span>
                <input
                  type="file"
                  accept=".eml,.txt,.pdf,.docx,.png,.jpg,.jpeg,.webp,message/rfc822,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </label>
              {samples.length > 0 && (
                <select
                  className="ing-sample-picker"
                  value={sampleIndex}
                  onChange={(e) => { setSampleIndex(Number(e.target.value)); setDroppedFileName(null); reset(); }}
                >
                  {samples.map((s, i) => (
                    <option key={i} value={i}>{s.subject.slice(0, 46)}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="ing-dropzone">
              {attachment ? (
                <div className="ing-attached">
                  <span className="material-symbols-outlined ing-attached-icon">
                    {attachment.type === 'application/pdf' ? 'picture_as_pdf'
                      : attachment.type?.includes('wordprocessing') ? 'description'
                      : 'image'}
                  </span>
                  <div className="ing-attached-main">
                    <div className="ing-attached-name">{attachment.name}</div>
                    <div className="ing-attached-meta">
                      {attachment.type} · {formatSize(attachment.size)} · Claude will read this directly
                    </div>
                  </div>
                  <button className="ing-attached-remove" onClick={removeAttachment} title="Remove attachment">
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
              ) : (
                <div className="ing-dropzone-inner">
                  <span className="material-symbols-outlined">attach_file</span>
                  <div>
                    <div className="ing-dz-title">
                      {droppedFileName
                        ? <>Loaded: <b>{droppedFileName}</b> · drop another to replace</>
                        : <>Drag & drop an <b>.eml</b>, <b>.pdf</b>, <b>.docx</b> or image here</>}
                    </div>
                    <div className="ing-dz-sub">
                      or paste below · or pick a sample · PDFs, Word docs &amp; images go straight to Claude
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="ing-email-form">
              <label className="ing-label">From</label>
              <input className="ing-input mono" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="broker@howden.com" />
              <label className="ing-label">Subject</label>
              <input className="ing-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="FW: Property renewal — …" />
              <label className="ing-label">Body</label>
              <textarea
                className="ing-textarea"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Paste the forwarded broker email here…"
              />
            </div>
            {dragOver && (
              <div className="ing-drop-overlay">
                <div className="ing-drop-overlay-inner">
                  <span className="material-symbols-outlined">download</span>
                  <div>Drop the email to load it</div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT — structured extraction */}
          <div className="ing-pane ing-pane-right">
            <div className="ing-pane-hd">
              <span className="material-symbols-outlined">bolt</span>
              <div className="ing-pane-title">Structured extraction</div>
              <div className={`ing-stage ing-stage-${stage}`}>
                {stage === 'idle' && 'Idle'}
                {stage === 'extracting' && 'Claude extracting…'}
                {stage === 'routing' && 'Rules engine routing…'}
                {stage === 'done' && 'Done'}
              </div>
            </div>

            <div className="ing-fields">
              <Field label="Assured" value={fields.assured} highlight animate={animateKey} />
              <Field label="Domicile" value={fields.domicileCountry} mono animate={animateKey} />
              <Field label="Industry" value={fields.industry} animate={animateKey} />
              <Field label="Class" value={fields.cls ? `${fields.cls}${fields.subClass ? ' · ' + fields.subClass : ''}` : null} animate={animateKey} />
              <Field label="Geography" value={fields.geography?.length ? fields.geography.join(', ') : null} mono animate={animateKey} />
              <Field label="TIV" value={fields.tivUsd != null ? `$${Number(fields.tivUsd).toLocaleString()}` : null} mono animate={animateKey} />
              <Field label="Placement" value={fields.placementType ? fields.placementType.replace(/_/g, ' ') : null} animate={animateKey} />
              <Field label="Inception" value={fields.inceptionDate} mono animate={animateKey} />
              <Field label="Premium" value={fields.premiumK != null ? window.fmtPremium(fields.premiumK) : null} mono animate={animateKey} />
              <Field label="Expiring carrier" value={fields.expiringCarrier} animate={animateKey} />
              <Field label="Binder id" value={fields.binderId} mono animate={animateKey} />
              <Field label="5yr loss ratio" value={fields.lossRatio5yr != null ? `${Math.round(fields.lossRatio5yr * 100)}%${fields.yearsOfLosses ? ` (${fields.yearsOfLosses}y)` : ''}` : null} mono animate={animateKey} />
              <Field label="Confidence" value={fields.confidence != null ? `${fields.confidence}%` : null} mono animate={animateKey} />
            </div>

            {fields.reasoning && (
              <div className="ing-reasoning">
                <div className="ing-field-label">Claude's reasoning</div>
                <p>{fields.reasoning}</p>
              </div>
            )}

            {fields.trace && fields.trace.length > 0 && (
              <div className="ing-trace">
                <div className="ing-field-label">Rule trace</div>
                <div className="ing-trace-steps">
                  {fields.trace.map((t, i) => (
                    <div key={i} className={`ing-trace-step ${t.fired ? 'fired' : 'skipped'}`}>
                      <span className="material-symbols-outlined">
                        {t.fired ? 'check_circle' : 'remove'}
                      </span>
                      <span className="mono">{t.id}</span>
                      <span className="detail">{t.detail}</span>
                    </div>
                  ))}
                </div>
                {dest && (
                  <div className="ing-destination">
                    <span className="material-symbols-outlined">north_east</span>
                    Forwarded to <b>{dest.label}</b> <span className="sub">· {dest.sub}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="ing-ft">
          {error && <div className="ing-error">{error}</div>}
          <div className="spacer" />
          {stage === 'done' ? (
            <>
              <button className="btn ghost" onClick={() => { reset(); }}>
                <span className="material-symbols-outlined">refresh</span>INGEST ANOTHER
              </button>
              <button className="btn primary" onClick={onClose}>
                <span className="material-symbols-outlined">visibility</span>VIEW IN QUEUE
              </button>
            </>
          ) : (
            <>
              <button className="btn ghost" onClick={onClose}>CANCEL</button>
              <button className="btn primary" onClick={handleIngest} disabled={busy}>
                {busy ? (
                  <><span className="material-symbols-outlined spin">progress_activity</span>PROCESSING…</>
                ) : (
                  <><span className="material-symbols-outlined">auto_awesome</span>INGEST WITH CLAUDE</>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { IngestModal });
