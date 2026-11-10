import { Document, Font, Page, Path, Rect, StyleSheet, Svg, Text, View, Line, Circle } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { niceScale } from "@/lib/scale";
import { axisCompact } from "@/lib/format";

/**
 * Bausteine der Berichte. Ein Erscheinungsbild für alle Dokumente: dunkles
 * Deckblatt mit Goldlinie, danach helle Seiten mit Kopf- und Fußzeile,
 * Serifenschrift für Titel, Inter für Text und Zahlen.
 */

export const C = {
  ink: "#1b1812",
  text: "#3a352b",
  muted: "#857c6a",
  line: "#e6dfd0",
  paper: "#ffffff",
  cream: "#f8f4ea",
  gold: "#a37c22",
  goldLight: "#d6b36c",
  night: "#100e0a",
  good: "#1c7a4c",
  bad: "#b23f35",
  s1: "#a37c22",
  s2: "#00907a",
  s3: "#4a68cc",
  s4: "#c4533a",
  sMuted: "#c9c2b2",
};

let registered = false;
export function registerFonts(base = "/fonts"): void {
  if (registered) return;
  registered = true;
  Font.register({
    family: "Inter",
    fonts: [400, 500, 600, 700].map((w) => ({ src: `${base}/inter-latin-${w}-normal.woff`, fontWeight: w })),
  });
  Font.register({ family: "Serif", src: `${base}/instrument-serif-latin-400-normal.woff` });
  // Keine Silbentrennung: Zahlen und Fachbegriffe bleiben ganz.
  Font.registerHyphenationCallback((word) => [word]);
}

const PAD = 46;
export const CONTENT_W = 595.28 - PAD * 2;

const s = StyleSheet.create({
  page: { paddingTop: 74, paddingBottom: 60, paddingHorizontal: PAD, fontFamily: "Inter", fontSize: 9, color: C.text, lineHeight: 1.45 },
  header: { position: "absolute", top: 30, left: PAD, right: PAD, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 9, borderBottomWidth: 0.6, borderBottomColor: C.line },
  footer: { position: "absolute", bottom: 26, left: PAD, right: PAD, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.muted, paddingTop: 8, borderTopWidth: 0.6, borderTopColor: C.line },
  brand: { fontFamily: "Serif", fontSize: 13, color: C.ink },
  eyebrow: { fontSize: 7, letterSpacing: 1.1, textTransform: "uppercase", color: C.muted, fontWeight: 600 },
  h1: { fontFamily: "Serif", fontSize: 24, color: C.ink, lineHeight: 1.1, marginBottom: 4 },
  h2: { fontFamily: "Serif", fontSize: 15, color: C.ink, lineHeight: 1.15, marginTop: 18, marginBottom: 8 },
  rule: { height: 1, width: 36, backgroundColor: C.gold, marginBottom: 12, marginTop: 2 },
  kpi: { paddingVertical: 9, paddingRight: 8 },
  kpiValue: { fontSize: 14, fontWeight: 600, color: C.ink, marginTop: 3, lineHeight: 1.25 },
  th: { fontSize: 6.8, letterSpacing: 0.7, textTransform: "uppercase", color: C.muted, fontWeight: 600 },
  td: { fontSize: 8.4, color: C.text },
});

export function Mark({ size = 16, color = C.gold }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Rect x={0.75} y={0.75} width={30.5} height={30.5} rx={8.5} stroke={color} strokeWidth={1.2} fill="none" />
      <Path d="M8.5 23 L16 8 L23.5 23 M11.6 17.5 H20.4" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export interface DocMeta { title: string; subtitle: string; owner: string; date: string }

export function Doc({ meta, children }: { meta: DocMeta; children: ReactNode }) {
  return (
    <Document title={`${meta.title} · ${meta.subtitle}`} author={meta.owner || "Aureum"} creator="Aureum" producer="Aureum" language="de-DE">
      {children}
    </Document>
  );
}

export function Cover({ meta, facts }: { meta: DocMeta; facts: { label: string; value: string }[] }) {
  return (
    <Page size="A4" style={{ backgroundColor: C.night, color: "#f3eee4", fontFamily: "Inter", padding: 54 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Mark size={22} color={C.goldLight} />
        <Text style={{ fontFamily: "Serif", fontSize: 19, marginLeft: 9, color: "#f3eee4" }}>Aureum</Text>
      </View>
      <View style={{ marginTop: 210 }}>
        <Text style={{ fontSize: 8, letterSpacing: 1.6, textTransform: "uppercase", color: C.goldLight, fontWeight: 600 }}>{meta.subtitle}</Text>
        <Text style={{ fontFamily: "Serif", fontSize: 46, lineHeight: 1.05, marginTop: 14, color: "#f8f4ea" }}>{meta.title}</Text>
        <View style={{ height: 1, width: 64, backgroundColor: C.goldLight, marginTop: 26, marginBottom: 26 }} />
        {meta.owner ? <Text style={{ fontSize: 11, color: "#d9d2c3" }}>{meta.owner}</Text> : null}
        <Text style={{ fontSize: 9.5, color: "#958d7d", marginTop: 4 }}>Stichtag {meta.date}</Text>
      </View>
      <View style={{ position: "absolute", left: 54, right: 54, bottom: 86, flexDirection: "row", borderTopWidth: 0.6, borderTopColor: "#3a352b", paddingTop: 16 }}>
        {facts.map((f) => (
          <View key={f.label} style={{ flex: 1 }}>
            <Text style={{ fontSize: 7, letterSpacing: 1.1, textTransform: "uppercase", color: "#958d7d", fontWeight: 600 }}>{f.label}</Text>
            <Text style={{ fontSize: 15, fontWeight: 600, marginTop: 4, color: "#f8f4ea" }}>{f.value}</Text>
          </View>
        ))}
      </View>
      <Text style={{ position: "absolute", left: 54, right: 54, bottom: 40, fontSize: 7.5, color: "#6f685b" }}>
        Vertraulich. Erstellt mit Aureum aus den Angaben des Eigentümers. Marktwerte sind Schätzungen; der Bericht ersetzt weder Gutachten noch Steuer- oder Rechtsberatung.
      </Text>
    </Page>
  );
}

export function Sheet({ meta, children, landscape }: { meta: DocMeta; children: ReactNode; landscape?: boolean }) {
  return (
    <Page size="A4" orientation={landscape ? "landscape" : "portrait"} style={s.page}>
      <View style={s.header} fixed>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Mark size={13} />
          <Text style={[s.brand, { marginLeft: 6 }]}>Aureum</Text>
        </View>
        <Text style={{ fontSize: 7.5, color: C.muted }}>{meta.title} · {meta.subtitle}</Text>
      </View>
      {children}
      <View style={s.footer} fixed>
        <Text>{[meta.owner, `Stichtag ${meta.date}`].filter(Boolean).join(" · ")}</Text>
        <Text render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`} />
      </View>
    </Page>
  );
}

export const H1 = ({ eyebrow, children }: { eyebrow?: string; children: ReactNode }) => (
  <View>
    {eyebrow ? <Text style={[s.eyebrow, { marginBottom: 5 }]}>{eyebrow}</Text> : null}
    <Text style={s.h1}>{children}</Text>
    <View style={s.rule} />
  </View>
);
export const H2 = ({ children }: { children: ReactNode }) => <Text style={s.h2} minPresenceAhead={60}>{children}</Text>;
/** Überschrift und Inhalt bleiben zusammen auf einer Seite. */
export const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <View wrap={false}>
    <Text style={s.h2}>{title}</Text>
    {children}
  </View>
);
export const P = ({ children, muted }: { children: ReactNode; muted?: boolean }) => <Text style={{ marginBottom: 6, color: muted ? C.muted : C.text, fontSize: muted ? 7.8 : 9 }}>{children}</Text>;

export function KpiGrid({ items, cols = 4 }: { items: { label: string; value: string; hint?: string; tone?: "bad" | "good" }[]; cols?: number }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", borderTopWidth: 0.6, borderTopColor: C.line, marginBottom: 4 }}>
      {items.map((k) => (
        <View key={k.label} style={[s.kpi, { width: `${100 / cols}%`, borderBottomWidth: 0.6, borderBottomColor: C.line }]}>
          <Text style={s.eyebrow}>{k.label}</Text>
          <Text style={[s.kpiValue, k.tone === "bad" ? { color: C.bad } : k.tone === "good" ? { color: C.good } : {}]}>{k.value}</Text>
          {k.hint ? <Text style={{ fontSize: 7.4, color: C.muted, marginTop: 3, lineHeight: 1.3 }}>{k.hint}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export interface Col { label: string; w: number; right?: boolean }

/** Tabelle mit Haarlinien; `w` sind Gewichte, die auf die Seitenbreite verteilt werden. */
export function Table({ cols, rows, foot, zebra }: { cols: Col[]; rows: (string | { text: string; bold?: boolean; color?: string; sub?: string })[][]; foot?: string[]; zebra?: boolean }) {
  const total = cols.reduce((a, c) => a + c.w, 0);
  const width = (c: Col) => `${(c.w / total) * 100}%`;
  return (
    <View style={{ marginBottom: 6 }}>
      <View wrap={false} style={{ flexDirection: "row", alignItems: "flex-end", borderBottomWidth: 0.8, borderBottomColor: C.ink, paddingBottom: 5 }}>
        {cols.map((c, n) => <Text key={`${c.label}${n}`} style={[s.th, { width: width(c), textAlign: c.right ? "right" : "left", paddingLeft: n === 0 ? 0 : 8 }]}>{c.label}</Text>)}
      </View>
      {rows.map((r, i) => (
        <View key={i} wrap={false} style={{ flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line, paddingVertical: 4.6, backgroundColor: zebra && i % 2 ? C.cream : undefined }}>
          {r.map((cell, n) => {
            const c = cols[n];
            const v = typeof cell === "string" ? { text: cell } : cell;
            return (
              <View key={n} style={{ width: width(c), paddingLeft: n === 0 ? 0 : 8 }}>
                <Text style={[s.td, { textAlign: c.right ? "right" : "left", fontWeight: v.bold ? 600 : 400, color: v.color ?? (v.bold ? C.ink : C.text) }]}>{v.text}</Text>
                {v.sub ? <Text style={{ fontSize: 7, color: C.muted, textAlign: c.right ? "right" : "left" }}>{v.sub}</Text> : null}
              </View>
            );
          })}
        </View>
      ))}
      {foot ? (
        <View wrap={false} style={{ flexDirection: "row", borderTopWidth: 0.8, borderTopColor: C.ink, paddingTop: 5, marginTop: -0.5 }}>
          {foot.map((f, n) => <Text key={n} style={[s.td, { width: width(cols[n]), textAlign: cols[n].right ? "right" : "left", fontWeight: 600, color: C.ink, paddingLeft: n === 0 ? 0 : 8 }]}>{f}</Text>)}
        </View>
      ) : null}
    </View>
  );
}

export function KeyValue({ rows }: { rows: [string, string, boolean?][] }) {
  return (
    <View>
      {rows.map(([k, v, strong]) => (
        <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 0.5, borderBottomColor: C.line, paddingVertical: 4.2 }}>
          <Text style={{ fontSize: 8.4, color: strong ? C.ink : C.text, fontWeight: strong ? 600 : 400 }}>{k}</Text>
          <Text style={{ fontSize: 8.4, color: C.ink, fontWeight: strong ? 600 : 400 }}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

export const Cols = ({ children, gap = 22 }: { children: ReactNode; gap?: number }) => <View style={{ flexDirection: "row", gap }}>{children}</View>;
export const Box = ({ children, flex = 1 }: { children: ReactNode; flex?: number }) => <View style={{ flex }}>{children}</View>;

export function Callout({ title, children, tone = "gold" }: { title: string; children: ReactNode; tone?: "gold" | "bad" | "good" }) {
  const color = tone === "bad" ? C.bad : tone === "good" ? C.good : C.gold;
  return (
    <View wrap={false} style={{ flexDirection: "row", marginBottom: 6 }}>
      <View style={{ width: 2, backgroundColor: color, marginRight: 9, borderRadius: 1 }} />
      <View style={{ flex: 1, paddingVertical: 1 }}>
        <Text style={{ fontSize: 8.6, fontWeight: 600, color: C.ink }}>{title}</Text>
        <Text style={{ fontSize: 8, color: C.text }}>{children}</Text>
      </View>
    </View>
  );
}

/* ───────────── Diagramme ───────────── */

export interface PSeries { label: string; color: string; values: number[]; dashed?: boolean }

export function Legend({ series }: { series: { label: string; color: string }[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
      {series.map((x) => (
        <View key={x.label} style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ width: 9, height: 2.4, backgroundColor: x.color, borderRadius: 1, marginRight: 4 }} />
          <Text style={{ fontSize: 7.4, color: C.text }}>{x.label}</Text>
        </View>
      ))}
    </View>
  );
}

const ML = 40, MR = 14, MT = 6, MB = 16;

function Axes({ w, h, lo, hi, ticks, labels, xs }: { w: number; h: number; lo: number; hi: number; ticks: number[]; labels: string[]; xs: (i: number) => number }) {
  const y = (v: number) => MT + (h - MT - MB) - ((v - lo) / (hi - lo)) * (h - MT - MB);
  const step = Math.max(1, Math.ceil(labels.length / Math.floor((w - ML - MR) / 34)));
  return (
    <>
      {ticks.map((t) => (
        <Line key={`g${t}`} x1={ML} x2={w - MR} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#b9b1a0" : C.line} strokeWidth={t === 0 ? 0.7 : 0.5} />
      ))}
      {ticks.map((t) => (
        <Text key={`t${t}`} x={ML - 5} y={y(t) + 2.4} style={{ fontSize: 6.6, fontFamily: "Inter" }} fill={C.muted} textAnchor="end">{axisCompact(t)}</Text>
      ))}
      {labels.map((l, i) => (i % step === 0 ? (
        <Text key={`x${i}`} x={xs(i)} y={h - 3} style={{ fontSize: 6.6, fontFamily: "Inter" }} fill={C.muted} textAnchor="middle">{l}</Text>
      ) : null))}
    </>
  );
}

export function LineChart({ labels, series, w = CONTENT_W, h = 170 }: { labels: string[]; series: PSeries[]; w?: number; h?: number }) {
  const all = series.flatMap((x) => x.values);
  const { lo, hi, ticks } = niceScale(Math.min(...all, 0), Math.max(...all, 1));
  const n = labels.length;
  const xs = (i: number) => ML + (n <= 1 ? (w - ML - MR) / 2 : (i / (n - 1)) * (w - ML - MR));
  const y = (v: number) => MT + (h - MT - MB) - ((v - lo) / (hi - lo)) * (h - MT - MB);
  return (
    <View wrap={false}>
      {series.length > 1 ? <Legend series={series} /> : null}
      <Svg width={w} height={h}>
        <Axes w={w} h={h} lo={lo} hi={hi} ticks={ticks} labels={labels} xs={xs} />
        {series.map((x) => (
          <Path key={x.label} d={x.values.map((v, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ")} stroke={x.color} strokeWidth={1.5} fill="none" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={x.dashed ? "3 2.5" : undefined} />
        ))}
        {series.map((x) => (n > 0 ? <Circle key={`d${x.label}`} cx={xs(n - 1)} cy={y(x.values[n - 1])} r={2.2} fill={x.color} stroke="#ffffff" strokeWidth={1} /> : null))}
      </Svg>
    </View>
  );
}

/** Säulen; mehrere Reihen werden gestapelt (nur nichtnegative Werte), eine einzelne darf negativ sein. */
export function BarChart({ labels, series, w = CONTENT_W, h = 160 }: { labels: string[]; series: PSeries[]; w?: number; h?: number }) {
  const stacked = series.length > 1;
  const sums = labels.map((_, i) => series.reduce((a, r) => a + Math.max(0, r.values[i] ?? 0), 0));
  const vals = stacked ? sums : series[0].values;
  const { lo, hi, ticks } = niceScale(Math.min(...(stacked ? [0] : vals), 0), Math.max(...vals, 1));
  const n = labels.length;
  const band = (w - ML - MR) / Math.max(1, n);
  const bw = Math.max(2, Math.min(15, band * 0.6));
  const xs = (i: number) => ML + band * i + band / 2;
  const y = (v: number) => MT + (h - MT - MB) - ((v - lo) / (hi - lo)) * (h - MT - MB);
  return (
    <View wrap={false}>
      {stacked ? <Legend series={series} /> : null}
      <Svg width={w} height={h}>
        <Axes w={w} h={h} lo={lo} hi={hi} ticks={ticks} labels={labels} xs={xs} />
        {labels.map((_, i) => {
          let acc = 0;
          return series.map((r) => {
            const v = r.values[i] ?? 0;
            if (stacked) {
              if (v <= 0) return null;
              const y1 = y(acc + v);
              const hh = y(acc) - y1 - (acc > 0 ? 1 : 0);
              acc += v;
              return <Rect key={`${r.label}${i}`} x={xs(i) - bw / 2} y={y1} width={bw} height={Math.max(0, hh)} fill={r.color} />;
            }
            const top = Math.min(y(v), y(0));
            return <Rect key={`${r.label}${i}`} x={xs(i) - bw / 2} y={top} width={bw} height={Math.abs(y(v) - y(0))} fill={v < 0 ? C.s4 : r.color} rx={1.5} />;
          });
        })}
      </Svg>
    </View>
  );
}

export interface PStep { label: string; value: number; kind: "start" | "minus" | "sum" }

/** Kaskade von der Miete zum Cashflow, als Balkenzeilen. */
export function Cascade({ steps, fmt }: { steps: PStep[]; fmt: (n: number) => string }) {
  const max = Math.max(...steps.map((x) => Math.abs(x.value)), 1);
  let running = 0;
  return (
    <View>
      {steps.map((x) => {
        let left = 0;
        let width = (Math.abs(x.value) / max) * 100;
        if (x.kind === "minus") {
          left = (Math.max(0, running - Math.abs(x.value)) / max) * 100;
          width = Math.max(0, (running / max) * 100 - left);
          running -= Math.abs(x.value);
        } else running = x.value;
        const neg = x.kind !== "minus" && x.value < 0;
        return (
          <View key={x.label} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 3.4, borderBottomWidth: x.kind === "minus" ? 0 : 0.5, borderBottomColor: C.line }}>
            <Text style={{ width: "34%", fontSize: 8.4, color: x.kind === "minus" ? C.text : C.ink, fontWeight: x.kind === "minus" ? 400 : 600 }}>{x.kind === "minus" ? `−  ${x.label}` : x.label}</Text>
            <View style={{ flex: 1, height: 6, position: "relative" }}>
              <View style={{ position: "absolute", left: `${left}%`, width: `${Math.max(width, 0.5)}%`, top: 0, bottom: 0, backgroundColor: x.kind === "minus" ? C.sMuted : neg ? C.s4 : C.s1, borderRadius: 1.5 }} />
            </View>
            <Text style={{ width: "22%", textAlign: "right", fontSize: 8.4, color: neg ? C.bad : C.ink, fontWeight: x.kind === "minus" ? 400 : 600 }}>{x.kind === "minus" ? fmt(-Math.abs(x.value)) : fmt(x.value)}</Text>
          </View>
        );
      })}
    </View>
  );
}
