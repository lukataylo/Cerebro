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

function ClassPill({ cls }) {
  return <span className="class-pill">{cls}</span>;
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
