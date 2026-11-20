"use client";

import { useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { nf } from "@/lib/admin";

/** Short number for chart axes: 1200 -> 1.2k */
export function short(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "k";
  return String(Math.round(n));
}

/** Rounds a maximum up to 1, 2, 5 x 10^k and returns 4 evenly spaced axis steps. */
export function niceScale(max: number): { top: number; ticks: number[] } {
  const m = Math.max(4, max);
  const pow = Math.pow(10, Math.floor(Math.log10(m / 4)));
  const raw = m / 4 / pow;
  const step = (raw <= 1 ? 1 : raw <= 2 ? 2 : raw <= 5 ? 5 : 10) * pow;
  const top = step * 4;
  return { top, ticks: [0, 1, 2, 3, 4].map((i) => i * step) };
}

export type BarPoint = { label: string; a: number; b: number };

/** Two bars per day, dashed grid, and a white tooltip on hover or keyboard focus. */
export function GroupedBars({ points, aLabel, bLabel }: { points: BarPoint[]; aLabel: string; bLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...points.flatMap((p) => [p.a, p.b]));
  const { top, ticks } = niceScale(max);
  const every = Math.max(1, Math.ceil(points.length / 8));
  const n = points.length;
  const h = hover !== null ? points[hover] : null;
  const left = hover !== null && n > 0 ? ((hover + 0.5) / n) * 100 : 0;
  const alignRight = hover !== null && hover > n * 0.6;

  return (
    <div>
      <div className="ad-legend">
        <span>
          <i style={{ background: "#959de0" }} />
          {aLabel}
        </span>
        <span>
          <i style={{ background: "#4f63e6" }} />
          {bLabel}
        </span>
      </div>
      <div className="ad-chart">
        <div className="ad-yaxis" aria-hidden>
          {ticks.map((t) => (
            <span key={t} style={{ bottom: `${(t / top) * 100}%` }}>
              {short(t)}
            </span>
          ))}
        </div>
        <div className="ad-plot" role="img" aria-label={`${aLabel} and ${bLabel} per day`}>
          {ticks.map((t) => (
            <div key={t} className="ad-gridline" style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          <div className="ad-cols" onMouseLeave={() => setHover(null)}>
            {points.map((p, i) => (
              <div
                key={p.label + i}
                className="ad-col"
                tabIndex={0}
                aria-label={`${p.label}: ${aLabel} ${p.a}, ${bLabel} ${p.b}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                onTouchStart={() => setHover(i)}
              >
                <div className="ad-bar a" style={{ height: `${(p.a / top) * 100}%` }} />
                <div className="ad-bar b" style={{ height: `${(p.b / top) * 100}%` }} />
              </div>
            ))}
          </div>
          {h && (
            <div className="ad-tip" style={alignRight ? { right: `${100 - left}%`, marginRight: 8 } : { left: `${left}%`, marginLeft: 8 }}>
              <b>{h.label}</b>
              <div>
                <i style={{ background: "#7b84d6" }} />
                {nf(h.a)} <span style={{ fontWeight: 400, color: "#5b6486" }}>{aLabel}</span>
              </div>
              <div>
                <i style={{ background: "#4f63e6" }} />
                {nf(h.b)} <span style={{ fontWeight: 400, color: "#5b6486" }}>{bLabel}</span>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="ad-xaxis" aria-hidden>
        {points.map((p, i) => (
          <span key={p.label + i} style={hover === i ? { color: "#fff", fontWeight: 600 } : undefined}>
            {i % every === 0 || hover === i ? p.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

export type Ring = { label: string; pct: number; color: string; icon: ReactNode };

/** Concentric rings, the outer one first. Each ring shows its own percentage. */
export function RingStack({ rings, callout }: { rings: Ring[]; callout?: { big: string; small: string } }) {
  const size = 200;
  const c = size / 2;
  const stroke = 13;
  const gap = 5;
  const outer = 90;
  return (
    <div>
      <div className="ad-ring-wrap">
        {callout && (
          <div className="ad-callout">
            <strong>{callout.big}</strong>
            <span>{callout.small}</span>
          </div>
        )}
        <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={rings.map((r) => `${r.label} ${r.pct}%`).join(", ")}>
          {rings.map((r, i) => {
            const radius = outer - i * (stroke + gap);
            const len = 2 * Math.PI * radius;
            const p = Math.min(100, Math.max(0, r.pct));
            return (
              <g key={r.label} transform={`rotate(-90 ${c} ${c})`}>
                <circle cx={c} cy={c} r={radius} fill="none" stroke="#2a3458" strokeWidth={stroke} />
                <circle
                  cx={c}
                  cy={c}
                  r={radius}
                  fill="none"
                  stroke={r.color}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={`${(len * p) / 100} ${len}`}
                />
              </g>
            );
          })}
          <g transform={`translate(${c - 11} ${c - 11})`} stroke="#fff" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" transform="scale(0.9)" />
          </g>
        </svg>
      </div>
      <div className="ad-ring-legend">
        {rings.map((r) => (
          <div key={r.label}>
            <span aria-hidden>{r.icon}</span>
            <b>
              <i style={{ background: r.color }} />
              {r.pct}%
            </b>
            {r.label}
          </div>
        ))}
      </div>
    </div>
  );
}

const GRADIENTS = [
  "linear-gradient(90deg,#5b63f0,#7a7bf5)",
  "linear-gradient(90deg,#5b8bf5,#7aa7ff)",
  "linear-gradient(90deg,#7a63f0,#a46cf5)",
  "linear-gradient(90deg,#a05cf0,#d06cf0)",
  "linear-gradient(90deg,#4f7fe6,#8b5cf6)",
];

/** Rows with a name, a share and a gradient bar. */
export function RankList({ rows, empty }: { rows: { name: string; n: number; icon?: ReactNode }[]; empty: string }) {
  const total = rows.reduce((s, r) => s + r.n, 0);
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (rows.length === 0) return <p className="ad-note">{empty}</p>;
  return (
    <div className="ad-rank">
      {rows.map((r, i) => (
        <div key={r.name} className="ad-rank-row">
          <header>
            <span className="name">
              <span className="dot" aria-hidden>
                {r.icon}
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
            </span>
            <span>
              {nf(r.n)} <span style={{ color: "#8e99b8" }}>({total ? Math.round((r.n / total) * 100) : 0}%)</span>
            </span>
          </header>
          <div className="ad-track" aria-hidden>
            <div className="ad-fill" style={{ width: `${(r.n / max) * 100}%`, background: GRADIENTS[i % GRADIENTS.length] }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const LEVELS = ["#2b3558", "#36458a", "#4358c8", "#5a6df0", "#7a86ff"];

/** 7 weekdays across, time slots down. Colour shows how busy a slot is; the busiest ones get a spark. */
export function HeatGrid({ cells, rowLabels, colLabels }: { cells: number[][]; rowLabels: string[]; colLabels: string[] }) {
  const flat = cells.flat();
  const max = Math.max(0, ...flat);
  const sorted = [...flat].filter((v) => v > 0).sort((a, b) => b - a);
  const sparkFrom = sorted[Math.min(2, sorted.length - 1)] ?? Infinity;
  const level = (v: number) => (v <= 0 || max === 0 ? 0 : Math.min(4, 1 + Math.floor((v / max) * 3.999)));
  return (
    <div>
      <div className="ad-heat" role="table" aria-label="Builds by weekday and time">
        {cells.map((row, ri) => (
          <Row key={rowLabels[ri]} label={rowLabels[ri]}>
            {row.map((v, ci) => (
              <div key={ci} className="ad-cell" role="cell" aria-label={`${colLabels[ci]} ${rowLabels[ri]}: ${v}`} style={{ background: LEVELS[level(v)] }}>
                {v >= sparkFrom && v > 0 && <Sparkles size={11} aria-hidden />}
                {v}
              </div>
            ))}
          </Row>
        ))}
        <span />
        {colLabels.map((c) => (
          <span key={c} className="collabel">
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="rowlabel">{label}</span>
      {children}
    </>
  );
}

export function HeatScale() {
  return (
    <span className="ad-scale" aria-hidden>
      {LEVELS.map((c) => (
        <i key={c} style={{ background: c }} />
      ))}
    </span>
  );
}
