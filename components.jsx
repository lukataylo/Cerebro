/* global React */
const { useState, useEffect, useRef, useMemo } = React;

// ============================================================
// Shared utility components
// ============================================================

function DestChip({ destId, withLabel = true }) {
  const d = window.DESTINATIONS[destId];
  if (!d) return null;
  const initials = d.label.slice(0, 2).toUpperCase();
  return (
    <span className="dest-chip">
      <span className="swatch" style={{ background: d.color }}>{initials}</span>
      {withLabel && (
        <>
          <span>{d.label}</span>
          <span className="sub">{d.sub}</span>
        </>
      )}
    </span>
  );
}

function StatePill({ stateId }) {
  const s = window.STATES[stateId];
  if (!s) return null;
  return (
    <span className="pill" style={{ background: s.bg, color: s.color, borderColor: s.color }}>
      <span className="dot" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

// Per-class tint — shared with the admin overview palette so the line of
// business a risk belongs to reads consistently across every surface.
const CLASS_TINTS = {
  Property:         '#4A6C62',
  Marine:           '#173F35',
  Cyber:            '#0857C3',
  'D&O':            '#4B4F9B',
  Casualty:         '#7A3FBF',
  Aviation:         '#B85C00',
  PI:               '#0D6E63',
  Terrorism:        '#C0392B',
  'Political Risk': '#8A6E2F',
  'Kidnap & Ransom':'#5B2E0E',
};
function classTint(cls) { return CLASS_TINTS[cls] || '#4B4B4B'; }
function hexToRgba(hex, a) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return `rgba(0,0,0,${a})`;
  return `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${a})`;
}
function ClassPill({ cls }) {
  const tint = classTint(cls);
  return (
    <span
      className="class-pill"
      style={{
        color: tint,
        background: hexToRgba(tint, 0.08),
        borderColor: hexToRgba(tint, 0.25),
      }}
    >
      <span className="class-pill-dot" style={{ background: tint }} />
      {cls}
    </span>
  );
}

function ConfidenceMeter({ value }) {
  const level = value >= 85 ? 'high' : value >= 72 ? 'med' : 'low';
  return (
    <span className={`conf ${level}`}>
      <span className="conf-bar"><span style={{ width: `${value}%` }} /></span>
      <span>{value}%</span>
    </span>
  );
}

function SizeViz({ bucket }) {
  const { bucket: b } = bucket;
  return (
    <span className="size-viz" title={`${bucket.label} — ${bucket.range}`}>
      <span className={`bar ${b === 'small' ? 'active small' : ''}`} style={{ height: '35%' }} />
      <span className={`bar ${b === 'medium' ? 'active medium' : ''}`} style={{ height: '65%' }} />
      <span className={`bar ${b === 'large' ? 'active large' : ''}`} style={{ height: '100%' }} />
    </span>
  );
}

function MonoTime({ mins }) {
  if (mins < 1) return <span className="mono">NOW</span>;
  if (mins < 60) return <span className="mono">{mins}M AGO</span>;
  const h = Math.floor(mins / 60);
  return <span className="mono">{h}H AGO</span>;
}

Object.assign(window, { DestChip, StatePill, ClassPill, ConfidenceMeter, SizeViz, MonoTime });
