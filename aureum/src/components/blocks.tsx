"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CalendarClock, CircleAlert, Info, Lightbulb, TriangleAlert } from "lucide-react";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/calc/dates";
import type { Metrics } from "@/lib/calc/metrics";
import { DEADLINE_KIND_LABEL, type Deadline, type Insight, type InsightLevel } from "@/lib/calc/deadlines";
import { dateDE, inDays } from "@/lib/format";
import type { UnitStatus } from "@/lib/types";
import { UNIT_STATUS_LABEL } from "@/lib/types";
import { Cascade, type CascadeStep } from "./charts";
import { Badge, cx, type Tone } from "./ui";

/** Bestand und Stichtag; der Stichtag ist pro Sitzung stabil. */
export function usePf() {
  const pf = useStore((s) => s.pf);
  const today = useMemo(() => todayISO(), []);
  return { pf, today };
}

const STATUS_TONE: Record<UnitStatus, Tone> = { vermietet: "good", leer: "bad", vermarktung: "warn", sanierung: "info", eigennutzung: "neutral" };
export const StatusBadge = ({ status }: { status: UnitStatus }) => <Badge tone={STATUS_TONE[status]} dot>{UNIT_STATUS_LABEL[status]}</Badge>;

/** Von der Kaltmiete zum Cashflow nach Steuern. */
export function CashflowCascade({ m, monthly }: { m: Metrics; monthly?: boolean }) {
  const f = monthly ? 1 / 12 : 1;
  const steps: CascadeStep[] = [
    { label: "Kaltmiete (Ist)", value: m.rentActual * f, kind: "start" },
    { label: "Bewirtschaftung", value: m.opex * f, kind: "minus", hint: "Verwaltung, Instandhaltung, sonstige nicht umlagefähige Kosten, Betriebskosten leerer Flächen" },
    { label: "Reinertrag", value: m.noi * f, kind: "sum" },
    { label: "Zinsen", value: m.interest * f, kind: "minus" },
    { label: "Cashflow vor Tilgung", value: m.cfBeforePrincipal * f, kind: "sum" },
    { label: "Tilgung", value: m.principal * f, kind: "minus", hint: "Vermögensaufbau, kein Aufwand" },
    { label: "Cashflow vor Steuern", value: m.cfPreTax * f, kind: "sum" },
  ];
  return (
    <div>
      <Cascade steps={steps} />
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[13px]">
        <div>
          <div className="text-muted">{m.tax >= 0 ? "Steuerlast" : "Steuerersparnis"}</div>
          <div className="tnum mt-0.5 font-semibold">{Math.round(Math.abs(m.tax) * f).toLocaleString("de-DE")} €</div>
        </div>
        <div className="text-right">
          <div className="text-muted">Cashflow nach Steuern</div>
          <div className={cx("tnum mt-0.5 font-semibold", m.cfAfterTax < 0 ? "text-bad" : "text-good")}>
            {m.cfAfterTax < 0 ? "−" : "+"}{Math.round(Math.abs(m.cfAfterTax) * f).toLocaleString("de-DE")} €
          </div>
        </div>
      </div>
    </div>
  );
}

const LEVEL: Record<InsightLevel, { icon: typeof Info; tone: string; label: string }> = {
  kritisch: { icon: CircleAlert, tone: "text-bad bg-bad-soft", label: "Kritisch" },
  warnung: { icon: TriangleAlert, tone: "text-warn bg-warn-soft", label: "Achtung" },
  chance: { icon: Lightbulb, tone: "text-good bg-good-soft", label: "Chance" },
  info: { icon: Info, tone: "text-info bg-info-soft", label: "Hinweis" },
};

export function InsightList({ items, limit }: { items: Insight[]; limit?: number }) {
  const shown = limit ? items.slice(0, limit) : items;
  if (shown.length === 0) return <p className="py-6 text-center text-text-2">Keine Auffälligkeiten. Ihr Bestand läuft rund.</p>;
  return (
    <ul className="-mx-2">
      {shown.map((i) => {
        const L = LEVEL[i.level];
        const body = (
          <>
            <span className={cx("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", L.tone)} title={L.label}><L.icon size={15} /></span>
            <span className="min-w-0">
              <span className="block font-medium leading-snug">{i.title}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-text-2">{i.detail}</span>
            </span>
          </>
        );
        return (
          <li key={i.id}>
            {i.propertyId
              ? <Link href={`/objekte/${i.propertyId}`} className="flex gap-3 rounded-[10px] px-2 py-2.5 transition-colors hover:bg-surface-2">{body}</Link>
              : <div className="flex gap-3 px-2 py-2.5">{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}

export function DeadlineList({ items, limit, onEdit }: { items: Deadline[]; limit?: number; onEdit?: (reminderId: string) => void }) {
  const shown = limit ? items.slice(0, limit) : items;
  if (shown.length === 0) return <p className="py-6 text-center text-text-2">Keine Fristen in diesem Zeitraum.</p>;
  return (
    <ul className="-mx-2">
      {shown.map((d) => {
        const urgent = d.days <= 30;
        const body = (
          <>
            <span className={cx("flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-[10px] border text-center leading-none", urgent ? "border-accent-line bg-accent-soft" : "border-line bg-surface-2")}>
              <span className="tnum text-[15px] font-semibold">{d.date.slice(8, 10)}</span>
              <span className="mt-[3px] text-[10px] uppercase tracking-wide text-muted">{["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"][Number(d.date.slice(5, 7)) - 1]}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium leading-snug">{d.title}</span>
                <span className={cx("text-[12px]", d.days < 0 ? "text-bad" : urgent ? "text-accent" : "text-muted")}>{inDays(d.days)}</span>
              </span>
              <span className="mt-0.5 block text-[13px] leading-snug text-text-2">{d.detail || `${DEADLINE_KIND_LABEL[d.kind]} · ${dateDE(d.date)}`}</span>
            </span>
          </>
        );
        const cls = "flex w-full gap-3 rounded-[10px] px-2 py-2.5 text-left transition-colors hover:bg-surface-2";
        return (
          <li key={d.id}>
            {d.reminderId && onEdit
              ? <button className={cls} onClick={() => onEdit(d.reminderId!)}>{body}</button>
              : d.propertyId
                ? <Link href={`/objekte/${d.propertyId}`} className={cls}>{body}</Link>
                : <div className={cls}>{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}

export const EmptyIcon = CalendarClock;
