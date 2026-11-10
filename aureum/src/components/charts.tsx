"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Table2, ChartLine } from "lucide-react";
import { axisCompact, eur } from "@/lib/format";
import { niceScale } from "@/lib/scale";
import { cx, IconButton } from "./ui";

/**
 * Diagramme. Regeln: eine Achse, dünne Marken, Haarlinien-Raster, Legende ab zwei
 * Reihen, Tooltip auf jeder Marke, Tabellenansicht als gleichwertige Alternative.
 * Text trägt nie die Datenfarbe; die Zuordnung leistet das Farbfeld daneben.
 */

export interface Series {
  key: string;
  label: string;
  /** CSS-Farbe, in der Regel var(--s1) bis var(--s4). */
  color: string;
  values: number[];
  area?: boolean;
  dashed?: boolean;
}

export const S = { gold: "var(--s1)", teal: "var(--s2)", blue: "var(--s3)", terra: "var(--s4)", muted: "var(--s-muted)" };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-text-2">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="h-[3px] w-3.5 rounded-full" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function Tip({ x, width, title, rows }: { x: number; width: number; title: string; rows: { label: string; color?: string; value: string; strong?: boolean }[] }) {
  const flip = x > width * 0.6;
  return (
    <div
      className="pointer-events-none absolute top-1 z-10 min-w-[168px] rounded-[10px] bg-surface px-3 py-2.5 text-[12px] shadow-[var(--shadow-pop)]"
      style={flip ? { right: width - x + 14 } : { left: x + 14 }}
    >
      <div className="mb-1.5 font-semibold">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className={cx("flex items-center justify-between gap-4 py-[2px]", r.strong && "mt-1 border-t border-line pt-1.5 font-semibold")}>
          <span className="inline-flex items-center gap-1.5 text-text-2">
            {r.color && <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="tnum">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function DataTable({ labels, series, format, head }: { labels: string[]; series: Series[]; format: (n: number) => string; head: string }) {
  return (
    <div className="max-h-[320px] overflow-auto">
      <table className="tbl text-[13px]">
        <thead>
          <tr><th>{head}</th>{series.map((s) => <th key={s.key} className="r">{s.label}</th>)}</tr>
        </thead>
        <tbody>
          {labels.map((l, i) => (
            <tr key={l}>
              <td>{l}</td>
              {series.map((s) => <td key={s.key} className="r">{format(s.values[i] ?? 0)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ChartProps {
  labels: string[];
  series: Series[];
  height?: number;
  format?: (n: number) => string;
  /** Spaltenkopf der ersten Tabellenspalte, z. B. "Jahr". */
  head?: string;
  /** Summenzeile im Tooltip. */
  total?: string;
  ariaLabel: string;
}

/** Rahmen mit Umschalter zwischen Diagramm und Tabelle. */
function Frame({ children, table, ariaLabel }: { children: ReactNode; table: ReactNode; ariaLabel: string }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <div className="relative">
      <div className="absolute -top-1 right-0 z-[5]">
        <IconButton label={asTable ? "Als Diagramm anzeigen" : "Als Tabelle anzeigen"} onClick={() => setAsTable((v) => !v)} className="h-8 w-8">
          {asTable ? <ChartLine size={15} /> : <Table2 size={15} />}
        </IconButton>
      </div>
      {asTable ? <div className="pt-8">{table}</div> : <div role="img" aria-label={ariaLabel}>{children}</div>}
    </div>
  );
}

const M = { top: 10, right: 14, bottom: 26, left: 56 };

/** Jede n-te Beschriftung, damit sich Achsentexte nicht überlappen. */
const labelStep = (n: number, innerW: number, minGap = 46): number => Math.max(1, Math.ceil(n / Math.max(1, Math.floor(innerW / minGap))));

/* ───────────── Linien ───────────── */

export function LineChart({ labels, series, height = 260, format = eur, head = "Jahr", ariaLabel }: ChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const n = labels.length;
  const all = series.flatMap((s) => s.values);
  const { lo, hi, ticks } = niceScale(Math.min(...all, 0), Math.max(...all, 1));
  const iw = Math.max(10, width - M.left - M.right);
  const ih = height - M.top - M.bottom;
  const x = (i: number) => M.left + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => M.top + ih - ((v - lo) / (hi - lo)) * ih;
  const step = labelStep(n, iw);

  const move = (clientX: number, rect: DOMRect) => {
    const rel = (clientX - rect.left - M.left) / iw;
    setHover(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))));
  };

  return (
    <Frame ariaLabel={ariaLabel} table={<DataTable labels={labels} series={series} format={format} head={head} />}>
      <Legend series={series} />
      <div ref={ref} className="relative" style={{ height }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            className="block touch-pan-y outline-none"
            tabIndex={0}
            onPointerMove={(e) => move(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerLeave={() => setHover(null)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") setHover((h) => Math.min(n - 1, (h ?? -1) + 1));
              if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? n) - 1));
            }}
          >
            <defs>
              {series.filter((s) => s.area).map((s) => (
                <linearGradient key={s.key} id={`${id}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" style={{ stopColor: s.color, stopOpacity: 0.16 }} />
                  <stop offset="1" style={{ stopColor: s.color, stopOpacity: 0 }} />
                </linearGradient>
              ))}
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} style={{ stroke: t === 0 ? "var(--line-strong)" : "var(--grid)" }} />
                <text x={M.left - 10} y={y(t)} dy="0.32em" textAnchor="end" className="tnum" style={{ fill: "var(--muted)", fontSize: 11 }}>{axisCompact(t)}</text>
              </g>
            ))}
            {labels.map((l, i) => (i % step === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= step * 0.6) ? (
              <text key={l} x={x(i)} y={height - 6} textAnchor={i === n - 1 ? "end" : i === 0 ? "start" : "middle"} style={{ fill: "var(--muted)", fontSize: 11 }}>{l}</text>
            ) : null)}
            {/* Erste Reihe zuletzt zeichnen: Sie ist die Hauptreihe und liegt obenauf. */}
            {[...series].reverse().map((s) => {
              const d = s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
              return (
                <g key={s.key}>
                  {s.area && n > 1 && <path d={`${d}L${x(n - 1)},${y(lo)}L${x(0)},${y(lo)}Z`} fill={`url(#${id}-${s.key})`} />}
                  <path
                    d={d}
                    fill="none"
                    pathLength={1}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeDasharray={s.dashed ? undefined : 1}
                    style={{ stroke: s.color, opacity: s.dashed ? 0.75 : 1, animation: s.dashed ? undefined : "draw .9s var(--ease-out-expo) both" }}
                  />
                  {n > 0 && hover === null && (
                    <circle cx={x(n - 1)} cy={y(s.values[n - 1])} r={4} style={{ fill: s.color, stroke: "var(--surface)", strokeWidth: 2 }} />
                  )}
                </g>
              );
            })}
            {hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + ih} style={{ stroke: "var(--line-strong)" }} />
                {series.map((s) => (
                  <circle key={s.key} cx={x(hover)} cy={y(s.values[hover])} r={4.5} style={{ fill: s.color, stroke: "var(--surface)", strokeWidth: 2 }} />
                ))}
              </g>
            )}
          </svg>
        )}
        {hover !== null && width > 0 && (
          <Tip x={x(hover)} width={width} title={labels[hover]} rows={series.map((s) => ({ label: s.label, color: s.color, value: format(s.values[hover]) }))} />
        )}
      </div>
    </Frame>
  );
}

/* ───────────── Säulen (einzeln oder gestapelt) ───────────── */

const topRounded = (x: number, y: number, w: number, h: number, r: number, down = false): string => {
  r = Math.min(r, w / 2, Math.abs(h));
  if (h <= 0) return "";
  return down
    ? `M${x},${y}h${w}v${h - r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - 2 * r)}a${r},${r} 0 0 1 ${-r},${-r}Z`
    : `M${x},${y + h}v${-(h - r)}a${r},${r} 0 0 1 ${r},${-r}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - r}Z`;
};

export function BarChart({ labels, series, height = 240, format = eur, head = "Jahr", total, ariaLabel }: ChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const stacked = series.length > 1;
  const sums = labels.map((_, i) => series.reduce((s, r) => s + Math.max(0, r.values[i] ?? 0), 0));
  const mins = stacked ? [0] : series[0]?.values ?? [0];
  const { lo, hi, ticks } = niceScale(Math.min(...mins, 0), Math.max(...(stacked ? sums : series[0]?.values ?? [1]), 1));
  const iw = Math.max(10, width - M.left - M.right);
  const ih = height - M.top - M.bottom;
  const band = iw / Math.max(1, n);
  const bw = Math.max(3, Math.min(24, band * 0.62));
  const y = (v: number) => M.top + ih - ((v - lo) / (hi - lo)) * ih;
  const step = labelStep(n, iw, 40);
  const gap = 2;

  return (
    <Frame ariaLabel={ariaLabel} table={<DataTable labels={labels} series={series} format={format} head={head} />}>
      <Legend series={series} />
      <div ref={ref} className="relative" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} className="block outline-none" tabIndex={0}
            onPointerLeave={() => setHover(null)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") setHover((h) => Math.min(n - 1, (h ?? -1) + 1));
              if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? n) - 1));
            }}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} style={{ stroke: t === 0 ? "var(--line-strong)" : "var(--grid)" }} />
                <text x={M.left - 10} y={y(t)} dy="0.32em" textAnchor="end" className="tnum" style={{ fill: "var(--muted)", fontSize: 11 }}>{axisCompact(t)}</text>
              </g>
            ))}
            {labels.map((l, i) => {
              const cx0 = M.left + band * i + band / 2;
              let acc = 0;
              return (
                <g key={l} onPointerEnter={() => setHover(i)} onPointerMove={() => setHover(i)}>
                  <rect x={M.left + band * i} y={M.top} width={band} height={ih} style={{ fill: hover === i ? "var(--accent-soft)" : "transparent" }} />
                  {series.map((s, si) => {
                    const v = s.values[i] ?? 0;
                    if (stacked) {
                      if (v <= 0) return null;
                      const y1 = y(acc + v);
                      const h = y(acc) - y1 - (acc > 0 ? gap : 0);
                      acc += v;
                      const isTop = series.slice(si + 1).every((r) => (r.values[i] ?? 0) <= 0);
                      return isTop
                        ? <path key={s.key} d={topRounded(cx0 - bw / 2, y1, bw, h, 4)} style={{ fill: s.color }} />
                        : <rect key={s.key} x={cx0 - bw / 2} y={y1} width={bw} height={Math.max(0, h)} style={{ fill: s.color }} />;
                    }
                    const h = Math.abs(y(v) - y(0));
                    return (
                      <path
                        key={s.key}
                        d={v >= 0 ? topRounded(cx0 - bw / 2, y(v), bw, h, 4) : topRounded(cx0 - bw / 2, y(0), bw, h, 4, true)}
                        style={{ fill: v >= 0 ? s.color : "var(--s4)", transformOrigin: `0 ${y(0)}px`, animation: `grow .7s var(--ease-out-expo) ${Math.min(i * 18, 400)}ms both` }}
                      />
                    );
                  })}
                  {(i % step === 0) && (
                    <text x={cx0} y={height - 6} textAnchor="middle" style={{ fill: "var(--muted)", fontSize: 11 }}>{l}</text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {hover !== null && width > 0 && (
          <Tip
            x={M.left + band * hover + band / 2}
            width={width}
            title={labels[hover]}
            rows={[
              ...series.map((s) => ({ label: s.label, color: stacked || (s.values[hover] ?? 0) >= 0 ? s.color : "var(--s4)", value: format(s.values[hover] ?? 0) })),
              ...(stacked && total ? [{ label: total, value: format(sums[hover]), strong: true }] : []),
            ]}
          />
        )}
      </div>
    </Frame>
  );
}

/* ───────────── Kaskade: von der Miete zum Cashflow ───────────── */

export interface CascadeStep {
  label: string;
  value: number;
  kind: "start" | "minus" | "sum";
  hint?: string;
}

/** Waagerechte Kaskade. Abzüge hängen am Ende des vorherigen Balkens, Zwischensummen beginnen bei null. */
export function Cascade({ steps }: { steps: CascadeStep[] }) {
  const max = Math.max(...steps.map((s) => Math.abs(s.value)), 1);
  let running = 0;
  return (
    <div className="space-y-[7px]">
      {steps.map((s, i) => {
        let left = 0;
        let w = (Math.abs(s.value) / max) * 100;
        if (s.kind === "minus") {
          left = (Math.max(0, running - Math.abs(s.value)) / max) * 100;
          w = Math.min(w, (running / max) * 100 - left);
          running -= Math.abs(s.value);
        } else {
          running = s.value;
        }
        const neg = s.kind !== "minus" && s.value < 0;
        const color = s.kind === "minus" ? "var(--s-muted)" : neg ? "var(--s4)" : "var(--s1)";
        return (
          <div key={s.label} className={cx("grid grid-cols-[minmax(132px,38%)_1fr_auto] items-center gap-2.5 sm:gap-3", s.kind === "sum" && "pt-1")} title={s.hint}>
            <span className={cx("truncate text-[13px]", s.kind === "minus" ? "text-text-2" : "font-medium")}>
              {s.kind === "minus" && <span className="mr-1 text-muted">−</span>}
              {s.label}
            </span>
            <span className="relative h-[10px]">
              <span className="absolute inset-y-[4.5px] left-0 right-0 bg-line" />
              <span
                className="absolute inset-y-0 origin-left rounded-[3px]"
                style={{ left: `${left}%`, width: `${Math.max(w, 0.6)}%`, background: color, animation: `growx .7s var(--ease-out-expo) ${i * 45}ms both` }}
              />
            </span>
            <span className={cx("tnum min-w-[72px] text-right text-[13px] sm:min-w-[84px]", s.kind !== "minus" && "font-semibold", neg && "text-bad")}>
              {s.kind === "minus" ? eur(-Math.abs(s.value)) : eur(s.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────── Segmentbalken: ein Ganzes in Teilen ───────────── */

export function SegmentBar({ parts, format = eur }: { parts: { label: string; value: number; color: string }[]; format?: (n: number) => string }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0) || 1;
  return (
    <div>
      <div className="flex h-2 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label} ${format(p.value)}`).join(", ")}>
        {parts.filter((p) => p.value > 0).map((p) => (
          <span key={p.label} title={`${p.label}: ${format(p.value)}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center justify-between gap-3">
            <span className="inline-flex min-w-0 items-center gap-2 text-text-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
              <span className="truncate">{p.label}</span>
            </span>
            <span className="tnum">{format(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Rangbalken in Tabellenzellen: Wert im Verhältnis zum Spaltenmaximum. */
export function InlineBar({ value, max, negative }: { value: number; max: number; negative?: boolean }) {
  const p = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  return (
    <span className="ml-auto mt-1 block h-[3px] w-full max-w-[72px] overflow-hidden rounded-full bg-line">
      <span className="block h-full rounded-full" style={{ width: `${p}%`, background: negative ? "var(--s4)" : "var(--s1)" }} />
    </span>
  );
}
