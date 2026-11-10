"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronLeft, Landmark, Pencil, Plus, Receipt, UserPlus } from "lucide-react";
import { propertyMetrics, unitState, wealthHistory } from "@/lib/calc/metrics";
import { loanStatus } from "@/lib/calc/loans";
import { afaBasis, afaSchedule, closingCostsTotal } from "@/lib/calc/afa";
import { insights } from "@/lib/calc/deadlines";
import { taxYear } from "@/lib/calc/tax";
import { yearOf } from "@/lib/calc/dates";
import { dateDE, eur, eur2, eurCompact, inDays, monthDE, num, pct } from "@/lib/format";
import { EXPENSE_CATEGORY_LABEL, LOAN_TYPE_LABEL, PROPERTY_TYPE_LABEL, type Expense, type Lease, type Loan, type Unit } from "@/lib/types";
import { BarChart, LineChart, S } from "@/components/charts";
import { CashflowCascade, InsightList, StatusBadge, usePf } from "@/components/blocks";
import { Badge, Button, Card, cx, Empty, IconButton, Meter, Row, Stat, Tabs } from "@/components/ui";
import { ExpenseForm, LeaseForm, LoanForm, PropertyForm, UnitForm } from "@/components/forms";
import { ReportButton } from "@/components/report-button";
import { DebtService } from "@/components/debt-service";

type Tab = "ueberblick" | "einheiten" | "finanzierung" | "ausgaben" | "steuer";

export default function ObjektDetail() {
  const { id } = useParams<{ id: string }>();
  const { pf, today } = usePf();
  const router = useRouter();
  const p = pf.properties.find((x) => x.id === id);
  const [tab, setTab] = useState<Tab>("ueberblick");
  const [edit, setEdit] = useState(false);
  const [unitForm, setUnitForm] = useState<{ open: boolean; unit?: Unit }>({ open: false });
  const [leaseForm, setLeaseForm] = useState<{ open: boolean; unit?: Unit; lease?: Lease }>({ open: false });
  const [loanForm, setLoanForm] = useState<{ open: boolean; loan?: Loan }>({ open: false });
  const [expForm, setExpForm] = useState<{ open: boolean; expense?: Expense }>({ open: false });

  const m = useMemo(() => (p ? propertyMetrics(p, pf, today) : null), [p, pf, today]);
  const history = useMemo(() => (p ? wealthHistory(pf, today, [p.id]) : []), [p, pf, today]);
  const notes = useMemo(() => insights(pf, today).filter((i) => i.propertyId === id), [pf, today, id]);

  if (!p || !m) {
    return (
      <div className="card mt-10">
        <Empty title="Objekt nicht gefunden" text="Es wurde möglicherweise gelöscht."><Button onClick={() => router.push("/objekte")}>Zur Objektliste</Button></Empty>
      </div>
    );
  }

  const units = pf.units.filter((u) => u.propertyId === p.id).map((u) => unitState(u, pf.leases, today));
  const loans = pf.loans.filter((l) => l.propertyId === p.id);
  const expenses = pf.expenses.filter((e) => e.propertyId === p.id).sort((a, b) => b.date.localeCompare(a.date));
  const year = yearOf(today);

  return (
    <>
      <Link href="/objekte" className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted hover:text-text"><ChevronLeft size={15} />Objekte</Link>
      <div className="rise mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="display text-[32px] sm:text-[40px]">{p.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-text-2">
            <span>{[p.street, `${p.zip} ${p.city}`.trim()].filter(Boolean).join(", ")}</span>
            <Badge>{PROPERTY_TYPE_LABEL[p.type]}</Badge>
            <Badge>Baujahr {p.yearBuilt}</Badge>
            {m.unitsVacant > 0 ? <Badge tone="bad" dot>{m.unitsVacant} von {m.units} nicht vermietet</Badge> : m.units > 0 && <Badge tone="good" dot>Voll vermietet</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          <ReportButton kind="objekt" opts={{ propertyId: p.id }} label="Objekt-Report" />
          <Button icon={<Pencil size={15} />} onClick={() => setEdit(true)}>Bearbeiten</Button>
        </div>
      </div>

      <div className="card rise rise-1 mb-5 grid grid-cols-2 gap-x-6 gap-y-6 p-5 md:grid-cols-3 xl:grid-cols-6">
        <Stat label={p.valuation.mode === "manuell" ? "Marktwert (eigener Wert)" : "Marktwert (Index)"} value={eurCompact(m.value)} hint={`Kauf ${eurCompact(p.purchasePrice)}`} />
        <Stat label="Eigenkapital" value={eurCompact(m.equity)} hint={`eingesetzt ${eurCompact(m.equityInvested)}`} tone="accent" />
        <Stat label="Beleihungsauslauf" value={pct(m.ltvPct)} hint={`Restschuld ${eurCompact(m.debt)}`} />
        <Stat label="Kaltmiete p. a." value={eur(m.rentActual)} hint={m.rentPerSqm ? `${eur2(m.rentPerSqm)} je m²` : undefined} />
        <Stat label="Nettomietrendite" value={pct(m.netYieldPct, 2)} hint={`brutto ${pct(m.grossYieldPct, 2)}`} />
        <Stat label="Cashflow / Monat" value={eur(m.cfPreTax / 12)} hint={`nach Steuern ${eur(m.cfAfterTax / 12)}`} tone={m.cfPreTax < 0 ? "bad" : undefined} />
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "ueberblick", label: "Überblick" },
          { value: "einheiten", label: "Einheiten und Mieter", count: units.length },
          { value: "finanzierung", label: "Finanzierung", count: loans.length },
          { value: "ausgaben", label: "Ausgaben", count: expenses.length },
          { value: "steuer", label: "Steuer" },
        ]}
      />

      {tab === "ueberblick" && (
        <div className="grid gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-5" eyebrow="Laufrate pro Jahr" title="Von der Miete zum Cashflow"><CashflowCascade m={m} /></Card>
          <Card className="lg:col-span-7" eyebrow="Seit Kauf" title="Wert, Schuld und Eigenkapital">
            <LineChart
              ariaLabel="Marktwert, Restschuld und Eigenkapital des Objekts je Jahr"
              labels={history.map((h) => String(h.year))}
              series={[
                { key: "eq", label: "Eigenkapital", color: S.gold, values: history.map((h) => h.equity), area: true },
                { key: "val", label: "Marktwert", color: S.teal, values: history.map((h) => h.value) },
                { key: "debt", label: "Restschuld", color: S.blue, values: history.map((h) => h.debt) },
              ]}
            />
          </Card>
          <Card className="lg:col-span-4" title="Kennzahlen">
            <Row label="Bruttomietrendite">{pct(m.grossYieldPct, 2)}</Row>
            <Row label="Nettomietrendite">{pct(m.netYieldPct, 2)}</Row>
            <Row label="Kaufpreisfaktor">{num(m.factor, 1)}</Row>
            <Row label="Cash-on-Cash">{m.cashOnCashPct === null ? "–" : pct(m.cashOnCashPct, 2)}</Row>
            <Row label="Schuldendienstdeckung (DSCR)">{m.dscr === null ? "–" : num(m.dscr, 2)}</Row>
            <Row label="Leerstandsquote">{pct(m.vacancyPct)}</Row>
            <Row label="Leerstandskosten p. a.">{eur(m.vacancyCost)}</Row>
            <Row label="Bewirtschaftung je m²">{eur2(m.opexPerSqm)}</Row>
            <Row label="Instandhaltung je m²">{eur2(m.maintenancePerSqm)}</Row>
            <Row label="Vermögenszuwachs p. a.">{eur(m.wealthGain)}</Row>
          </Card>
          <Card className="lg:col-span-4" title="Kauf und Investition">
            <Row label="Kaufvertrag">{dateDE(p.notaryDate)}</Row>
            <Row label="Übergang">{dateDE(p.purchaseDate)}</Row>
            <Row label="Kaufpreis">{eur(p.purchasePrice)}</Row>
            <Row label="Kaufnebenkosten">{eur(closingCostsTotal(p))} <span className="text-muted">({pct((closingCostsTotal(p) / p.purchasePrice) * 100)})</span></Row>
            <Row label="Anfangsinvestition">{eur(p.initialCapex)}</Row>
            <Row label="Gesamtinvestition" strong>{eur(m.investment)}</Row>
            <Row label="Fremdkapital">{eur(m.loanPrincipal)}</Row>
            <Row label="Eingesetztes Eigenkapital" strong>{eur(m.equityInvested)}</Row>
            <Row label="Wertzuwachs seit Kauf"><span className={m.valueGain < 0 ? "text-bad" : "text-good"}>{eur(m.valueGain)}</span></Row>
          </Card>
          <Card className="lg:col-span-4" eyebrow={`${notes.length} offen`} title="Hinweise"><InsightList items={notes} limit={4} /></Card>
        </div>
      )}

      {tab === "einheiten" && (
        <Card pad={false} title="Einheiten" action={<Button size="sm" icon={<Plus size={14} />} onClick={() => setUnitForm({ open: true })}>Einheit</Button>}>
          {units.length === 0 ? <Empty title="Noch keine Einheit" text="Legen Sie die Wohnungen oder Gewerbeflächen dieses Objekts an."><Button variant="primary" onClick={() => setUnitForm({ open: true })}>Einheit anlegen</Button></Empty> : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Einheit</th><th>Mieter</th><th>Status</th><th className="r">Fläche</th><th className="r">Kaltmiete</th><th className="r">je m²</th><th className="r">Marktmiete</th><th className="r">Potenzial p. a.</th><th /></tr></thead>
                <tbody>
                  {units.map((u) => {
                    const gap = (u.unit.marketRent - u.rent) * 12;
                    return (
                      <tr key={u.unit.id}>
                        <td className="font-medium">{u.unit.name}<div className="text-[12px] font-normal text-muted">{num(u.unit.rooms, u.unit.rooms % 1 ? 1 : 0)} Zimmer</div></td>
                        <td>
                          {u.lease ? (
                            <button className="text-left hover:text-accent" onClick={() => setLeaseForm({ open: true, unit: u.unit, lease: u.lease })}>
                              {u.lease.tenantName}
                              <div className="text-[12px] text-muted">seit {dateDE(u.lease.start)}{u.lease.end ? ` · bis ${dateDE(u.lease.end)}` : ""}{u.lease.rentType !== "standard" ? ` · ${u.lease.rentType === "staffel" ? "Staffel" : "Index"}` : ""}</div>
                            </button>
                          ) : <span className="text-muted">{u.vacantDays ? `leer seit ${u.vacantDays} Tagen` : "–"}</span>}
                        </td>
                        <td><StatusBadge status={u.status} /></td>
                        <td className="r">{num(u.unit.area, u.unit.area % 1 ? 1 : 0)} m²</td>
                        <td className="r">{u.rent ? eur(u.rent) : "–"}</td>
                        <td className="r">{u.rent && u.unit.area ? eur2(u.rent / u.unit.area) : "–"}</td>
                        <td className="r text-text-2">{eur(u.unit.marketRent)}</td>
                        <td className={cx("r", gap > 0 && "text-good")}>{gap > 0 ? `+${eur(gap)}` : "–"}</td>
                        <td className="r">
                          <span className="inline-flex">
                            {!u.lease && <IconButton label="Mietvertrag anlegen" onClick={() => setLeaseForm({ open: true, unit: u.unit })}><UserPlus size={15} /></IconButton>}
                            <IconButton label="Einheit bearbeiten" onClick={() => setUnitForm({ open: true, unit: u.unit })}><Pencil size={15} /></IconButton>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr><td colSpan={3}>Summe</td><td className="r">{num(m.area)} m²</td><td className="r">{eur(m.rentActual / 12)}</td><td className="r">{m.rentPerSqm ? eur2(m.rentPerSqm) : "–"}</td><td className="r">{eur(m.rentMarket / 12)}</td><td className="r text-good">{m.rentMarket > m.rentActual ? `+${eur(m.rentMarket - m.rentActual)}` : "–"}</td><td /></tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "finanzierung" && (
        <div className="grid gap-4 lg:grid-cols-12">
          {loans.length === 0 && (
            <div className="card lg:col-span-12"><Empty icon={<Landmark size={22} />} title="Kein Darlehen erfasst" text="Ohne Finanzierung rechnet Aureum mit vollständigem Eigenkapital."><Button variant="primary" onClick={() => setLoanForm({ open: true })}>Darlehen anlegen</Button></Empty></div>
          )}
          {loans.map((l) => {
            const st = loanStatus(l, today);
            return (
              <Card key={l.id} className="lg:col-span-6" eyebrow={LOAN_TYPE_LABEL[l.type]} title={`${l.lender}${l.label ? ` · ${l.label}` : ""}`} action={<IconButton label="Darlehen bearbeiten" onClick={() => setLoanForm({ open: true, loan: l })}><Pencil size={15} /></IconButton>}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-[28px] font-semibold tracking-[-0.02em]">{eur(st.balance)}</span>
                  <span className="text-[13px] text-text-2">von {eur(l.principal)}</span>
                </div>
                <Meter value={st.repaidPct} label="Getilgter Anteil in Prozent" />
                <div className="mb-3 mt-1.5 text-[12px] text-muted">{pct(st.repaidPct)} getilgt · {eur(st.interestPaid)} Zinsen bisher gezahlt</div>
                <Row label="Sollzins">{pct(st.ratePct, 2)}</Row>
                <Row label="Monatsrate">{eur2(st.payment)}</Row>
                <Row label="Zinsbindung bis">{dateDE(l.fixedUntil)} <span className={st.monthsToFixedEnd <= 12 ? "text-bad" : "text-muted"}>({st.monthsToFixedEnd < 0 ? "abgelaufen" : inDays(Math.round(st.monthsToFixedEnd * 30.4))})</span></Row>
                <Row label="Restschuld bei Bindungsende">{eur(st.balanceAtFixedEnd)}</Row>
                <Row label="Anschlusszins (Annahme)">{l.followUpPct !== undefined ? pct(l.followUpPct, 2) : "unverändert"}</Row>
                <Row label="Voraussichtlich getilgt">{st.payoffMonth ? monthDE(st.payoffMonth) : "nicht im Planungszeitraum"}</Row>
              </Card>
            );
          })}
          {loans.length > 0 && (
            <>
              <Card className="lg:col-span-12" eyebrow="Alle Darlehen des Objekts" title="Zins und Tilgung je Jahr" action={<Button size="sm" icon={<Plus size={14} />} onClick={() => setLoanForm({ open: true })}>Darlehen</Button>}>
                <DebtService loans={loans} from={year} />
              </Card>
            </>
          )}
        </div>
      )}

      {tab === "ausgaben" && (
        <Card pad={false} title="Einmalige Ausgaben" action={<Button size="sm" icon={<Plus size={14} />} onClick={() => setExpForm({ open: true })}>Ausgabe</Button>}>
          {expenses.length === 0 ? <Empty icon={<Receipt size={22} />} title="Keine Ausgaben erfasst" text="Reparaturen, Modernisierungen und Sonderumlagen fließen in Steuer und AfA ein."><Button variant="primary" onClick={() => setExpForm({ open: true })}>Ausgabe erfassen</Button></Empty> : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Datum</th><th>Beschreibung</th><th>Kategorie</th><th>Steuerlich</th><th className="r">Betrag</th></tr></thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id} className="cursor-pointer" onClick={() => setExpForm({ open: true, expense: e })}>
                      <td className="tnum whitespace-nowrap">{dateDE(e.date)}</td>
                      <td className="font-medium">{e.note || "–"}</td>
                      <td className="text-text-2">{EXPENSE_CATEGORY_LABEL[e.category]}</td>
                      <td>{e.deductible ? <Badge tone="good">Sofort abziehbar</Badge> : <Badge tone="info">Aktiviert (AfA)</Badge>}</td>
                      <td className="r">{eur2(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={4}>Summe</td><td className="r">{eur2(expenses.reduce((s, e) => s + e.amount, 0))}</td></tr></tfoot>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "steuer" && <TaxTab propertyId={p.id} />}

      <PropertyForm open={edit} onClose={() => setEdit(false)} property={p} onDeleted={() => router.push("/objekte")} />
      <UnitForm open={unitForm.open} onClose={() => setUnitForm({ open: false })} propertyId={p.id} unit={unitForm.unit} />
      {leaseForm.unit && <LeaseForm open={leaseForm.open} onClose={() => setLeaseForm((s) => ({ ...s, open: false }))} unit={leaseForm.unit} lease={leaseForm.lease} />}
      <LoanForm open={loanForm.open} onClose={() => setLoanForm({ open: false })} propertyId={p.id} loan={loanForm.loan} />
      <ExpenseForm open={expForm.open} onClose={() => setExpForm({ open: false })} propertyId={p.id} expense={expForm.expense} />
    </>
  );
}

function TaxTab({ propertyId }: { propertyId: string }) {
  const { pf, today } = usePf();
  const p = pf.properties.find((x) => x.id === propertyId)!;
  const year = yearOf(today);
  const [y, setY] = useState(year);
  const t = useMemo(() => taxYear(p, pf, y), [p, pf, y]);
  const plan = useMemo(() => afaSchedule(p, pf.expenses, Math.max(year + 12, yearOf(p.purchaseDate) + 12)).filter((r) => r.year >= year - 3), [p, pf, year]);
  const current = plan.find((r) => r.year === year);
  const years = Array.from({ length: Math.max(1, year - yearOf(p.purchaseDate) + 1) }, (_, i) => year - i).slice(0, 6);
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Card className="lg:col-span-5" eyebrow="Gebäudeabschreibung" title="AfA">
        <Row label="Bemessungsgrundlage">{eur(afaBasis(p))}</Row>
        <Row label="Bodenwertanteil">{pct(p.landSharePct)}</Row>
        <Row label="Methode">{p.afa.method === "degressiv" ? "Degressiv (§ 7 Abs. 5a EStG)" : p.afa.method === "linear" ? "Linear (§ 7 Abs. 4 EStG)" : "Individuell (Gutachten)"}</Row>
        <Row label="Satz">{pct(p.afa.ratePct, 2)}</Row>
        <Row label={`AfA ${year}`} strong>{eur(current?.amount ?? 0)}</Row>
        <Row label={`Restwert Ende ${year}`}>{eur(current?.residual ?? 0)}</Row>
        <div className="mt-4">
          <BarChart ariaLabel="AfA-Betrag je Jahr" labels={plan.map((r) => String(r.year))} series={[{ key: "a", label: "AfA", color: S.gold, values: plan.map((r) => r.amount) }]} height={190} />
        </div>
      </Card>
      <Card
        className="lg:col-span-7"
        eyebrow="Einkünfte aus Vermietung und Verpachtung"
        title={`Anlage V · ${y}`}
        action={<div className="flex gap-1">{years.map((yy) => <button key={yy} onClick={() => setY(yy)} className={cx("h-8 rounded-[8px] px-2.5 text-[13px] font-medium", yy === y ? "bg-accent-soft text-text" : "text-muted hover:text-text")}>{yy}</button>)}</div>}
      >
        <div className="eyebrow mb-1 mt-1">Einnahmen</div>
        <Row label="Mieteinnahmen (kalt)">{eur(t.rent)}</Row>
        <Row label="Umlagen (Vorauszahlungen)">{eur(t.prepayments)}</Row>
        <Row label="Summe Einnahmen" strong>{eur(t.income)}</Row>
        <div className="eyebrow mb-1 mt-5">Werbungskosten</div>
        <Row label="Absetzung für Abnutzung">{eur(t.afa)}</Row>
        <Row label="Schuldzinsen">{eur(t.interest)}</Row>
        <Row label="Erhaltungsaufwand">{eur(t.maintenance)}</Row>
        <Row label="Verwaltung">{eur(t.management)}</Row>
        <Row label="Betriebskosten, Grundsteuer, Versicherung">{eur(t.operating)}</Row>
        <Row label="Sonstige">{eur(t.other)}</Row>
        <Row label="Summe Werbungskosten" strong>{eur(t.deductions)}</Row>
        <div className="mt-4 flex items-baseline justify-between rounded-[12px] bg-surface-2 px-4 py-3">
          <span className="font-semibold">{t.result >= 0 ? "Überschuss" : "Verlust"}</span>
          <span className={cx("tnum text-[20px] font-semibold", t.result < 0 ? "text-good" : "")}>{eur(t.result)}</span>
        </div>
        <p className="mt-3 text-[12px] leading-snug text-muted">
          Steuerwirkung bei {pct(pf.settings.taxRatePct, 0)} Grenzsteuersatz: {t.taxEffect < 0 ? `${eur(-t.taxEffect)} Entlastung` : `${eur(t.taxEffect)} Belastung`}. Grundlage sind Sollmieten und erfasste Kosten; die Instandhaltungsrücklage ist erst bei Verausgabung abziehbar. Bitte mit Ihrem Steuerberater abstimmen.
        </p>
        <div className="mt-4 flex justify-end"><ReportButton kind="steuer" opts={{ year: y }} label={`Steuerunterlagen ${y}`} size="sm" /></div>
      </Card>
    </div>
  );
}
