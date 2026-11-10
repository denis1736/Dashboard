"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Building2, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { portfolioMetrics, propertyMetrics, type Metrics } from "@/lib/calc/metrics";
import { eur, eurCompact, pct } from "@/lib/format";
import { PROPERTY_TYPE_LABEL } from "@/lib/types";
import { usePf } from "@/components/blocks";
import { InlineBar } from "@/components/charts";
import { Badge, Button, Card, cx, Empty, PageHeader } from "@/components/ui";
import { PropertyForm } from "@/components/forms";

type Col = { key: string; label: string; get: (m: Metrics) => number; fmt: (n: number) => string; bar?: boolean; lowGood?: boolean };

const COLS: Col[] = [
  { key: "value", label: "Marktwert", get: (m) => m.value, fmt: eurCompact },
  { key: "equity", label: "Eigenkapital", get: (m) => m.equity, fmt: eurCompact },
  { key: "ltv", label: "Beleihung", get: (m) => m.ltvPct, fmt: (n) => pct(n, 0), lowGood: true },
  { key: "rent", label: "Kaltmiete p. a.", get: (m) => m.rentActual, fmt: eur },
  { key: "gross", label: "Brutto", get: (m) => m.grossYieldPct, fmt: (n) => pct(n, 2), bar: true },
  { key: "net", label: "Netto", get: (m) => m.netYieldPct, fmt: (n) => pct(n, 2), bar: true },
  { key: "cf", label: "Cashflow / Monat", get: (m) => m.cfPreTax / 12, fmt: eur, bar: true },
  { key: "coc", label: "Cash-on-Cash", get: (m) => m.cashOnCashPct ?? 0, fmt: (n) => pct(n, 1), bar: true },
];

export default function Objekte() {
  const { pf, today } = usePf();
  const router = useRouter();
  const [form, setForm] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "value", dir: -1 });

  const rows = useMemo(() => {
    const col = COLS.find((c) => c.key === sort.key)!;
    return pf.properties
      .map((p) => ({ p, m: propertyMetrics(p, pf, today) }))
      .sort((a, b) => (col.get(a.m) - col.get(b.m)) * sort.dir);
  }, [pf, today, sort]);
  const total = useMemo(() => portfolioMetrics(pf, today), [pf, today]);
  const max = (c: Col) => Math.max(...rows.map((r) => Math.abs(c.get(r.m))), 0.0001);

  return (
    <>
      <PageHeader title="Objekte" sub="Alle Objekte im direkten Vergleich. Ein Klick auf eine Spalte sortiert, ein Klick auf eine Zeile öffnet das Objekt.">
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setForm(true)}>Objekt anlegen</Button>
      </PageHeader>

      {rows.length === 0 ? (
        <div className="card"><Empty icon={<Building2 size={22} />} title="Noch kein Objekt" text="Erfassen Sie Kaufdaten, Finanzierung und Mieten. Daraus entstehen alle Kennzahlen."><Button variant="primary" onClick={() => setForm(true)}>Objekt anlegen</Button><Button onClick={() => useStore.getState().loadDemo()}>Beispielportfolio laden</Button></Empty></div>
      ) : (
        <>
          <Card pad={false} className="rise rise-1 hidden md:block">
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Objekt</th>
                    {COLS.map((c) => (
                      <th key={c.key} className="r" aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                        <button className="inline-flex items-center gap-1 uppercase tracking-[0.07em] hover:text-text" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : -1 }))}>
                          {c.label}
                          {sort.key === c.key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ p, m }) => (
                    <tr key={p.id} className="cursor-pointer" onClick={() => router.push(`/objekte/${p.id}`)}>
                      <td className="min-w-[220px]">
                        <Link href={`/objekte/${p.id}`} className="font-medium hover:text-accent">{p.name}</Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
                          {p.city} · {PROPERTY_TYPE_LABEL[p.type]} · {m.units} {m.units === 1 ? "Einheit" : "Einheiten"}
                          {m.unitsVacant > 0 && <Badge tone="bad">{m.unitsVacant} leer</Badge>}
                        </div>
                      </td>
                      {COLS.map((c) => {
                        const v = c.get(m);
                        return (
                          <td key={c.key} className={cx("r", v < 0 && "text-bad")}>
                            {c.key === "coc" && m.cashOnCashPct === null ? "–" : c.fmt(v)}
                            {c.bar && <InlineBar value={v} max={max(c)} negative={v < 0} />}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Gesamter Bestand</td>
                    {COLS.map((c) => <td key={c.key} className={cx("r", c.get(total) < 0 && "text-bad")}>{c.key === "coc" && total.cashOnCashPct === null ? "–" : c.fmt(c.get(total))}</td>)}
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <div className="space-y-3 md:hidden">
            {rows.map(({ p, m }, i) => (
              <Link key={p.id} href={`/objekte/${p.id}`} className={`card rise rise-${Math.min(i + 1, 5)} block p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{p.name}</div>
                    <div className="text-[12px] text-muted">{p.city} · {PROPERTY_TYPE_LABEL[p.type]}</div>
                  </div>
                  {m.unitsVacant > 0 ? <Badge tone="bad">{m.unitsVacant} leer</Badge> : <Badge tone="good">vermietet</Badge>}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-[13px]">
                  <div><div className="text-[11px] text-muted">Wert</div><div className="tnum font-semibold">{eurCompact(m.value)}</div></div>
                  <div><div className="text-[11px] text-muted">Netto</div><div className="tnum font-semibold">{pct(m.netYieldPct, 2)}</div></div>
                  <div className="text-right"><div className="text-[11px] text-muted">Cashflow / Monat</div><div className={cx("tnum font-semibold", m.cfPreTax < 0 && "text-bad")}>{eur(m.cfPreTax / 12)}</div></div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
      <PropertyForm open={form} onClose={() => setForm(false)} onSaved={(id) => router.push(`/objekte/${id}`)} />
    </>
  );
}
