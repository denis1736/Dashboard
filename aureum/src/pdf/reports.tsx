import { Text, View } from "@react-pdf/renderer";
import type { Portfolio, Property } from "@/lib/types";
import { EXPENSE_CATEGORY_LABEL, LOAN_TYPE_LABEL, PROPERTY_TYPE_LABEL, UNIT_STATUS_LABEL } from "@/lib/types";
import { portfolioMetrics, propertyMetrics, unitState, wealthHistory, type Metrics } from "@/lib/calc/metrics";
import { buildSchedule, loanStatus, yearlySchedule } from "@/lib/calc/loans";
import { afaBasis, afaSchedule, closingCostsTotal } from "@/lib/calc/afa";
import { deadlines, insights, DEADLINE_KIND_LABEL } from "@/lib/calc/deadlines";
import { BASE_ASSUMPTIONS, project } from "@/lib/calc/projection";
import { taxYear, type TaxYear } from "@/lib/calc/tax";
import { yearOf } from "@/lib/calc/dates";
import { parseMarkdown, type Inline } from "@/lib/markdown";
import { dateDE, eur, eur2, eurCompact, num, pct } from "@/lib/format";
import { BarChart, Box, C, Callout, Cascade, Cols, Cover, Doc, H1, H2, KeyValue, KpiGrid, LineChart, P, Section, Sheet, Table, type DocMeta, type PStep } from "./kit";

const steps = (m: Metrics): PStep[] => [
  { label: "Kaltmiete (Ist)", value: m.rentActual, kind: "start" },
  { label: "Bewirtschaftung", value: m.opex, kind: "minus" },
  { label: "Reinertrag", value: m.noi, kind: "sum" },
  { label: "Zinsen", value: m.interest, kind: "minus" },
  { label: "Cashflow vor Tilgung", value: m.cfBeforePrincipal, kind: "sum" },
  { label: "Tilgung", value: m.principal, kind: "minus" },
  { label: "Cashflow vor Steuern", value: m.cfPreTax, kind: "sum" },
  // Eine Steuerersparnis ist ein Zufluss und passt nicht in die Abzugslogik; sie steckt im Endwert.
  ...(m.tax > 0 && m.cfPreTax > 0 ? [{ label: "Steuer", value: m.tax, kind: "minus" as const }] : []),
  { label: m.tax < 0 ? "Cashflow nach Steuern (inkl. Ersparnis)" : "Cashflow nach Steuern", value: m.cfAfterTax, kind: "sum" },
];

const meta = (pf: Portfolio, today: string, title: string, subtitle: string): DocMeta => ({ title, subtitle, owner: pf.settings.ownerName, date: dateDE(today) });
const tone = (n: number) => (n < 0 ? ("bad" as const) : undefined);
const NOTE = "Kennzahlen als Jahres-Laufrate zum Stichtag: laufende Mietverträge, Zins und Tilgung der kommenden zwölf Monate. Marktwerte sind Schätzungen per Preisindex oder Angaben des Eigentümers.";

/* ───────────── Portfolio ───────────── */

export function PortfolioReport({ pf, today }: { pf: Portfolio; today: string }) {
  const m = portfolioMetrics(pf, today);
  const hist = wealthHistory(pf, today);
  const rows = pf.properties.map((p) => ({ p, m: propertyMetrics(p, pf, today) }));
  const notes = insights(pf, today).slice(0, 8);
  const due = deadlines(pf, today, 365).slice(0, 16);
  const mt = meta(pf, today, "Portfolio-Report", "Immobilienbestand");
  return (
    <Doc meta={mt}>
      <Cover meta={mt} facts={[{ label: "Nettovermögen", value: eurCompact(m.equity) }, { label: "Marktwert", value: eurCompact(m.value) }, { label: "Objekte / Einheiten", value: `${pf.properties.length} / ${m.units}` }, { label: "Kaltmiete p. a.", value: eurCompact(m.rentActual) }]} />
      <Sheet meta={mt}>
        <H1 eyebrow="Zusammenfassung">Der Bestand im Überblick</H1>
        <KpiGrid items={[
          { label: "Marktwert", value: eur(m.value), hint: `Wertzuwachs seit Kauf ${eur(m.valueGain)}` },
          { label: "Restschuld", value: eur(m.debt), hint: `Ø Sollzins ${pct(m.avgInterestPct, 2)}` },
          { label: "Eigenkapital", value: eur(m.equity), hint: `eingesetzt ${eur(m.equityInvested)}` },
          { label: "Beleihungsauslauf", value: pct(m.ltvPct), hint: m.dscr !== null ? `DSCR ${num(m.dscr, 2)}` : undefined },
          { label: "Kaltmiete p. a.", value: eur(m.rentActual), hint: `Soll ${eur(m.rentTarget)}` },
          { label: "Cashflow vor Steuern", value: eur(m.cfPreTax), hint: `${eur(m.cfPreTax / 12)} pro Monat`, tone: tone(m.cfPreTax) },
          { label: "Nettomietrendite", value: pct(m.netYieldPct, 2), hint: `brutto ${pct(m.grossYieldPct, 2)}` },
          { label: "Leerstand", value: pct(m.vacancyPct), hint: `${m.unitsVacant} von ${m.units} Einheiten`, tone: m.vacancyPct > 5 ? "bad" : undefined },
        ]} />
        <Section title="Vermögensentwicklung seit dem ersten Kauf">
          <LineChart labels={hist.map((h) => String(h.year))} series={[{ label: "Eigenkapital", color: C.s1, values: hist.map((h) => h.equity) }, { label: "Marktwert", color: C.s2, values: hist.map((h) => h.value) }, { label: "Restschuld", color: C.s3, values: hist.map((h) => h.debt) }]} />
        </Section>
        <Section title="Von der Miete zum Cashflow (pro Jahr)">
          <Cascade steps={steps(m)} fmt={eur} />
        </Section>
        <View style={{ marginTop: 10 }}><P muted>{NOTE} Steuer mit {pct(pf.settings.taxRatePct, 0)} Grenzsteuersatz.</P></View>
      </Sheet>
      <Sheet meta={mt}>
        <H1 eyebrow="Bestand">Objekte</H1>
        <Table
          cols={[{ label: "Objekt", w: 30 }, { label: "Marktwert", w: 13, right: true }, { label: "Restschuld", w: 13, right: true }, { label: "Beleihung", w: 9, right: true }, { label: "Miete p. a.", w: 12, right: true }, { label: "Netto", w: 8, right: true }, { label: "Cashflow / Monat", w: 13, right: true }]}
          rows={rows.map(({ p, m: x }) => [
            { text: p.name, bold: true, sub: `${p.city} · ${PROPERTY_TYPE_LABEL[p.type]} · ${x.units} Einh.${x.unitsVacant ? ` · ${x.unitsVacant} leer` : ""}` },
            eur(x.value), eur(x.debt), pct(x.ltvPct, 0), eur(x.rentActual), pct(x.netYieldPct, 2),
            { text: eur(x.cfPreTax / 12), color: x.cfPreTax < 0 ? C.bad : undefined },
          ])}
          foot={["Gesamt", eur(m.value), eur(m.debt), pct(m.ltvPct, 0), eur(m.rentActual), pct(m.netYieldPct, 2), eur(m.cfPreTax / 12)]}
        />
        {notes.length > 0 && <>
          <H2>Hinweise</H2>
          {notes.map((n) => <Callout key={n.id} title={n.title} tone={n.level === "kritisch" ? "bad" : n.level === "chance" ? "good" : "gold"}>{n.detail}</Callout>)}
        </>}
        {due.length > 0 && <>
          <H2>Fristen der nächsten zwölf Monate</H2>
          <Table cols={[{ label: "Datum", w: 12 }, { label: "Art", w: 16 }, { label: "Frist", w: 42 }, { label: "Objekt", w: 30 }]}
            rows={due.map((d) => [dateDE(d.date), DEADLINE_KIND_LABEL[d.kind], { text: d.title, bold: true }, pf.properties.find((p) => p.id === d.propertyId)?.name ?? "Bestand"])} />
        </>}
      </Sheet>
    </Doc>
  );
}

/* ───────────── Objekt ───────────── */

export function PropertyReport({ pf, today, p }: { pf: Portfolio; today: string; p: Property }) {
  const m = propertyMetrics(p, pf, today);
  const hist = wealthHistory(pf, today, [p.id]);
  const units = pf.units.filter((u) => u.propertyId === p.id).map((u) => unitState(u, pf.leases, today));
  const loans = pf.loans.filter((l) => l.propertyId === p.id).map((l) => ({ l, st: loanStatus(l, today) }));
  const notes = insights(pf, today).filter((i) => i.propertyId === p.id).slice(0, 6);
  const year = yearOf(today);
  const afa = afaSchedule(p, pf.expenses, year).at(-1);
  const mt = meta(pf, today, p.name, "Objekt-Report");
  return (
    <Doc meta={mt}>
      <Cover meta={{ ...mt, subtitle: `Objekt-Report · ${p.zip} ${p.city}` }} facts={[{ label: "Marktwert", value: eurCompact(m.value) }, { label: "Eigenkapital", value: eurCompact(m.equity) }, { label: "Kaltmiete p. a.", value: eurCompact(m.rentActual) }, { label: "Nettomietrendite", value: pct(m.netYieldPct, 2) }]} />
      <Sheet meta={mt}>
        <H1 eyebrow={`${PROPERTY_TYPE_LABEL[p.type]} · Baujahr ${p.yearBuilt} · ${p.street}, ${p.zip} ${p.city}`}>Wirtschaftliche Lage</H1>
        <KpiGrid items={[
          { label: "Marktwert", value: eur(m.value), hint: p.valuation.mode === "manuell" ? "eigener Wert" : "Schätzung per Preisindex" },
          { label: "Restschuld", value: eur(m.debt), hint: `Beleihung ${pct(m.ltvPct)}` },
          { label: "Eigenkapital", value: eur(m.equity) },
          { label: "Cashflow vor Steuern", value: eur(m.cfPreTax), hint: `${eur(m.cfPreTax / 12)} pro Monat`, tone: tone(m.cfPreTax) },
        ]} />
        <Cols>
          <Box>
            <H2>Kauf und Investition</H2>
            <KeyValue rows={[["Kaufvertrag", dateDE(p.notaryDate)], ["Übergang Nutzen und Lasten", dateDE(p.purchaseDate)], ["Kaufpreis", eur(p.purchasePrice)], ["Kaufnebenkosten", eur(closingCostsTotal(p))], ["Anfangsinvestition", eur(p.initialCapex)], ["Gesamtinvestition", eur(m.investment), true], ["Fremdkapital", eur(m.loanPrincipal)], ["Eingesetztes Eigenkapital", eur(m.equityInvested), true]]} />
          </Box>
          <Box>
            <H2>Kennzahlen</H2>
            <KeyValue rows={[["Bruttomietrendite", pct(m.grossYieldPct, 2)], ["Nettomietrendite", pct(m.netYieldPct, 2)], ["Kaufpreisfaktor", num(m.factor, 1)], ["Cash-on-Cash", m.cashOnCashPct === null ? "–" : pct(m.cashOnCashPct, 2)], ["Schuldendienstdeckung", m.dscr === null ? "–" : num(m.dscr, 2)], ["Leerstandsquote", pct(m.vacancyPct)], ["Kaltmiete je m²", eur2(m.rentPerSqm)], ["Bewirtschaftung je m²", eur2(m.opexPerSqm)]]} />
          </Box>
        </Cols>
        <Section title="Von der Miete zum Cashflow (pro Jahr)">
          <Cascade steps={steps(m)} fmt={eur} />
        </Section>
        <View style={{ marginTop: 10 }}><P muted>{NOTE} Steuer mit {pct(pf.settings.taxRatePct, 0)} Grenzsteuersatz.</P></View>
      </Sheet>
      <Sheet meta={mt}>
        <H1 eyebrow="Entwicklung, Vermietung, Finanzierung">Wert, Einheiten, Darlehen</H1>
        <Section title="Wert, Restschuld und Eigenkapital seit Kauf">
          <LineChart h={124} labels={hist.map((h) => String(h.year))} series={[{ label: "Eigenkapital", color: C.s1, values: hist.map((h) => h.equity) }, { label: "Marktwert", color: C.s2, values: hist.map((h) => h.value) }, { label: "Restschuld", color: C.s3, values: hist.map((h) => h.debt) }]} />
        </Section>
        <H2>Einheiten und Mieter</H2>
        <Table
          cols={[{ label: "Einheit", w: 20 }, { label: "Mieter", w: 20 }, { label: "Status", w: 13 }, { label: "Fläche", w: 9, right: true }, { label: "Kaltmiete", w: 11, right: true }, { label: "je m²", w: 9, right: true }, { label: "Marktmiete", w: 11, right: true }]}
          rows={units.map((u) => [
            { text: u.unit.name, bold: true },
            u.lease ? { text: u.lease.tenantName, sub: `seit ${dateDE(u.lease.start)}` } : "–",
            { text: UNIT_STATUS_LABEL[u.status], color: u.status === "vermietet" ? C.good : C.bad },
            `${num(u.unit.area, u.unit.area % 1 ? 1 : 0)} m²`, u.rent ? eur(u.rent) : "–", u.rent && u.unit.area ? eur2(u.rent / u.unit.area) : "–", eur(u.unit.marketRent),
          ])}
          foot={["Summe", "", "", `${num(m.area)} m²`, eur(m.rentActual / 12), m.rentPerSqm ? eur2(m.rentPerSqm) : "–", eur(m.rentMarket / 12)]}
        />
        {loans.length > 0 && <Section title="Darlehen">
          <Table
            cols={[{ label: "Darlehen", w: 28 }, { label: "Restschuld", w: 14, right: true }, { label: "Zins", w: 8, right: true }, { label: "Rate / Monat", w: 13, right: true }, { label: "Zinsbindung bis", w: 14, right: true }, { label: "Restschuld dann", w: 15, right: true }]}
            rows={loans.map(({ l, st }) => [{ text: l.lender, bold: true, sub: `${l.label || LOAN_TYPE_LABEL[l.type]} · ${eur(l.principal)} ab ${dateDE(l.startDate)}` }, eur(st.balance), pct(st.ratePct, 2), eur2(st.payment), dateDE(l.fixedUntil), eur(st.balanceAtFixedEnd)])}
            foot={["Summe", eur(m.debt), pct(m.avgInterestPct, 2), eur2(m.monthlyPayment), "", ""]}
          />
        </Section>}
        <Section title="Abschreibung">
        <KeyValue rows={[["AfA-Bemessungsgrundlage", eur(afaBasis(p))], ["Bodenwertanteil", pct(p.landSharePct)], ["Methode und Satz", `${p.afa.method === "degressiv" ? "degressiv" : p.afa.method === "linear" ? "linear" : "individuell"}, ${pct(p.afa.ratePct, 2)}`], [`AfA ${year}`, eur(afa?.amount ?? 0), true], [`Restwert Ende ${year}`, eur(afa?.residual ?? 0)]]} />
        </Section>
        {notes.length > 0 && <>
          <H2>Hinweise</H2>
          {notes.map((n) => <Callout key={n.id} title={n.title} tone={n.level === "kritisch" ? "bad" : n.level === "chance" ? "good" : "gold"}>{n.detail}</Callout>)}
        </>}
      </Sheet>
    </Doc>
  );
}

/* ───────────── Darlehen ───────────── */

export function LoanReport({ pf, today }: { pf: Portfolio; today: string }) {
  const m = portfolioMetrics(pf, today);
  const year = yearOf(today);
  const loans = pf.loans.map((l) => ({ l, st: loanStatus(l, today), p: pf.properties.find((p) => p.id === l.propertyId), rows: yearlySchedule(buildSchedule(l)) })).sort((a, b) => a.l.fixedUntil.localeCompare(b.l.fixedUntil));
  const principal = loans.reduce((s, x) => s + x.l.principal, 0);

  const ladder = new Map<number, number>();
  const service = new Map<number, { i: number; p: number }>();
  for (const x of loans) {
    if (x.st.balance > 0.005 && x.st.monthsToFixedEnd >= 0) ladder.set(yearOf(x.l.fixedUntil), (ladder.get(yearOf(x.l.fixedUntil)) ?? 0) + x.st.balanceAtFixedEnd);
    for (const r of x.rows) if (r.year >= year && r.year < year + 20) {
      const v = service.get(r.year) ?? { i: 0, p: 0 };
      v.i += r.interest; v.p += r.principal;
      service.set(r.year, v);
    }
  }
  const ly: number[] = [];
  for (let y = year; y <= Math.max(year, ...ladder.keys()); y++) ly.push(y);
  const sy = [...service.keys()].sort((a, b) => a - b);
  const mt = meta(pf, today, "Darlehensübersicht", "Finanzierung");
  return (
    <Doc meta={mt}>
      <Cover meta={mt} facts={[{ label: "Restschuld", value: eurCompact(m.debt) }, { label: "Monatsrate", value: eur(m.monthlyPayment) }, { label: "Ø Sollzins", value: pct(m.avgInterestPct, 2) }, { label: "Darlehen", value: String(loans.length) }]} />
      <Sheet meta={mt}>
        <H1 eyebrow="Zusammenfassung">Stand der Finanzierung</H1>
        <KpiGrid items={[
          { label: "Restschuld", value: eur(m.debt), hint: `von ${eur(principal)}` },
          { label: "Getilgt", value: pct(principal ? ((principal - m.debt) / principal) * 100 : 0), hint: eur(principal - m.debt) },
          { label: "Kapitaldienst p. a.", value: eur(m.debtService), hint: `Zins ${eur(m.interest)} · Tilgung ${eur(m.principal)}` },
          { label: "Beleihungsauslauf", value: pct(m.ltvPct), hint: m.dscr !== null ? `DSCR ${num(m.dscr, 2)}` : undefined },
        ]} />
        <H2>Darlehen nach Ende der Zinsbindung</H2>
        <Table
          cols={[{ label: "Darlehen", w: 30 }, { label: "Restschuld", w: 13, right: true }, { label: "Zins", w: 8, right: true }, { label: "Rate / Monat", w: 12, right: true }, { label: "Zinsbindung bis", w: 13, right: true }, { label: "Restschuld dann", w: 13, right: true }, { label: "Anschluss", w: 9, right: true }]}
          rows={loans.map(({ l, st, p }) => [
            { text: `${l.lender}${l.label ? ` · ${l.label}` : ""}`, bold: true, sub: `${p?.name ?? ""} · ${LOAN_TYPE_LABEL[l.type]}` },
            eur(st.balance), pct(st.ratePct, 2), eur2(st.payment),
            { text: dateDE(l.fixedUntil), color: st.monthsToFixedEnd >= 0 && st.monthsToFixedEnd <= 12 ? C.bad : undefined },
            eur(st.balanceAtFixedEnd), l.followUpPct !== undefined ? pct(l.followUpPct, 2) : "–",
          ])}
          foot={["Summe", eur(m.debt), pct(m.avgInterestPct, 2), eur2(m.monthlyPayment), "", "", ""]}
        />
        <Section title="Zinsbindungsleiter: auslaufende Restschuld je Jahr">
          <BarChart h={130} labels={ly.map(String)} series={[{ label: "Auslaufende Restschuld", color: C.s1, values: ly.map((y) => ladder.get(y) ?? 0) }]} />
        </Section>
        <Section title="Zins und Tilgung je Jahr">
          <BarChart h={140} labels={sy.map(String)} series={[{ label: "Tilgung", color: C.s1, values: sy.map((y) => service.get(y)!.p) }, { label: "Zinsen", color: C.s3, values: sy.map((y) => service.get(y)!.i) }]} />
        </Section>
        <P muted>Spalte „Anschluss“: angenommener Sollzins nach Ende der Zinsbindung. Nach einer Zinsänderung bleibt die Rate bestehen, mindestens aber Zins plus 1 % Tilgung.</P>
      </Sheet>
      <Sheet meta={mt}>
        <H1 eyebrow="Tilgungspläne">Verlauf je Darlehen</H1>
        {loans.map(({ l, st, p, rows }) => (
          <View key={l.id}>
            <H2>{`${l.lender}${l.label ? ` · ${l.label}` : ""}: ${p?.name ?? ""}`}</H2>
            <P muted>{LOAN_TYPE_LABEL[l.type]} über {eur(l.principal)}, ausgezahlt {dateDE(l.startDate)}, Sollzins {pct(l.interestPct, 2)}, Zinsbindung bis {dateDE(l.fixedUntil)}. Bisher gezahlte Zinsen {eur(st.interestPaid)}.</P>
            <Table zebra
              cols={[{ label: "Jahr", w: 10 }, { label: "Zinsen", w: 20, right: true }, { label: "Tilgung", w: 20, right: true }, { label: "Kapitaldienst", w: 20, right: true }, { label: "Restschuld Jahresende", w: 30, right: true }]}
              rows={rows.filter((r) => r.year >= year - 1).slice(0, 16).map((r) => [{ text: String(r.year), bold: r.year === yearOf(l.fixedUntil), sub: r.year === yearOf(l.fixedUntil) ? "Bindungsende" : undefined }, eur(r.interest), eur(r.principal), eur(r.interest + r.principal), eur(r.balance)])}
            />
          </View>
        ))}
      </Sheet>
    </Doc>
  );
}

/* ───────────── Cashflow und Kennzahlen ───────────── */

export function CashflowReport({ pf, today }: { pf: Portfolio; today: string }) {
  const m = portfolioMetrics(pf, today);
  const cols = pf.properties.map((p) => ({ p, m: propertyMetrics(p, pf, today) }));
  const proj = project(pf, today, BASE_ASSUMPTIONS);
  const mt = meta(pf, today, "Cashflow und Kennzahlen", "Ertragsrechnung");
  const KP: [string, (x: Metrics) => string][] = [
    ["Kaltmiete p. a. (Ist)", (x) => eur(x.rentActual)], ["Kaltmiete p. a. (Soll)", (x) => eur(x.rentTarget)], ["Leerstandsquote", (x) => pct(x.vacancyPct)],
    ["Bewirtschaftung p. a.", (x) => eur(x.opex)], ["Reinertrag p. a.", (x) => eur(x.noi)], ["Zinsen p. a.", (x) => eur(x.interest)], ["Tilgung p. a.", (x) => eur(x.principal)],
    ["Cashflow vor Steuern", (x) => eur(x.cfPreTax)], ["Steuer (+) / Ersparnis (−)", (x) => eur(x.tax)], ["Cashflow nach Steuern", (x) => eur(x.cfAfterTax)],
    ["Bruttomietrendite", (x) => pct(x.grossYieldPct, 2)], ["Nettomietrendite", (x) => pct(x.netYieldPct, 2)], ["Kaufpreisfaktor", (x) => num(x.factor, 1)],
    ["Cash-on-Cash", (x) => (x.cashOnCashPct === null ? "–" : pct(x.cashOnCashPct, 2))], ["DSCR", (x) => (x.dscr === null ? "–" : num(x.dscr, 2))],
    ["Marktwert", (x) => eur(x.value)], ["Restschuld", (x) => eur(x.debt)], ["Eigenkapital", (x) => eur(x.equity)], ["Beleihungsauslauf", (x) => pct(x.ltvPct)],
  ];
  const chunks: (typeof cols)[] = [];
  for (let i = 0; i < cols.length; i += 5) chunks.push(cols.slice(i, i + 5));
  return (
    <Doc meta={mt}>
      <Cover meta={mt} facts={[{ label: "Kaltmiete p. a.", value: eurCompact(m.rentActual) }, { label: "Reinertrag p. a.", value: eurCompact(m.noi) }, { label: "Nach Steuern p. a.", value: eur(m.cfAfterTax) }, { label: "Nettomietrendite", value: pct(m.netYieldPct, 2) }]} />
      <Sheet meta={mt}>
        <H1 eyebrow="Gesamter Bestand">Von der Miete zum Cashflow</H1>
        <KpiGrid items={[
          { label: "Reinertrag p. a.", value: eur(m.noi) },
          { label: "Cashflow vor Tilgung", value: eur(m.cfBeforePrincipal), tone: tone(m.cfBeforePrincipal) },
          { label: "Cashflow vor Steuern", value: eur(m.cfPreTax), tone: tone(m.cfPreTax) },
          { label: "Cashflow n. Steuern", value: eur(m.cfAfterTax), tone: tone(m.cfAfterTax) },
        ]} />
        <View style={{ marginTop: 10 }}><Cascade steps={steps(m)} fmt={eur} /></View>
        <H2>Einordnung</H2>
        <KeyValue rows={[
          ["Vermögenszuwachs p. a. (Cashflow nach Steuern + Tilgung)", eur(m.wealthGain), true],
          ["Leerstandskosten p. a. (entgangene Miete + Betriebskosten)", eur(m.vacancyCost)],
          ["Mietpotenzial bis Marktmiete p. a.", eur(Math.max(0, m.rentMarket - m.rentActual))],
          ["Absetzung für Abnutzung p. a.", eur(m.afa)],
          ["Steuerliches Ergebnis p. a.", eur(m.taxableResult)],
        ]} />
        <Section title={`Projektion über ${BASE_ASSUMPTIONS.years} Jahre: Cashflow nach Steuern`}>
          <BarChart h={130} labels={proj.map((r) => String(r.year))} series={[{ label: "Cashflow nach Steuern", color: C.s1, values: proj.map((r) => r.cfAfterTax) }]} />
        </Section>
        <P muted>Annahmen der Projektion: Mietsteigerung {pct(BASE_ASSUMPTIONS.rentGrowthPct)} p. a., Kostensteigerung {pct(BASE_ASSUMPTIONS.costGrowthPct)} p. a., Mietausfall {pct(BASE_ASSUMPTIONS.vacancyPct)}, Anschlusszins laut Darlehen. Modellrechnung, keine Prognose. {NOTE}</P>
      </Sheet>
      {chunks.map((chunk, ci) => (
        <Sheet key={ci} meta={mt} landscape>
          <H1 eyebrow={chunks.length > 1 ? `Teil ${ci + 1} von ${chunks.length}` : "Objektvergleich"}>Kennzahlen je Objekt</H1>
          <Table zebra dense
            cols={[{ label: "Kennzahl", w: 26 }, ...chunk.map((c) => ({ label: c.p.name.length > 30 ? `${c.p.name.slice(0, 29)}…` : c.p.name, w: 15, right: true })), { label: "Gesamt", w: 15, right: true }]}
            rows={KP.map(([label, f]) => [label, ...chunk.map((c) => f(c.m)), { text: f(m), bold: true }])}
          />
        </Sheet>
      ))}
      <Sheet meta={mt}>
        <H1 eyebrow="Projektion">Jahreswerte</H1>
        <Table zebra
          cols={[{ label: "Jahr", w: 8 }, { label: "Miete", w: 13, right: true }, { label: "Kosten", w: 12, right: true }, { label: "Zinsen", w: 12, right: true }, { label: "Tilgung", w: 12, right: true }, { label: "Steuer", w: 11, right: true }, { label: "Cashflow n. St.", w: 14, right: true }, { label: "Restschuld", w: 14, right: true }]}
          rows={proj.map((r) => [String(r.year), eur(r.rent), eur(r.opex), eur(r.interest), eur(r.principal), eur(r.tax), { text: eur(r.cfAfterTax), bold: true, color: r.cfAfterTax < 0 ? C.bad : undefined }, eur(r.debt)])}
        />
      </Sheet>
    </Doc>
  );
}

/* ───────────── Steuer ───────────── */

export function TaxReport({ pf, today, year }: { pf: Portfolio; today: string; year: number }) {
  const rows = pf.properties.filter((p) => yearOf(p.purchaseDate) <= year).map((p) => ({ p, t: taxYear(p, pf, year) }));
  const sum = (k: keyof TaxYear) => rows.reduce((s, r) => s + (r.t[k] as number), 0);
  const expenses = pf.expenses.filter((e) => e.date.startsWith(String(year))).sort((a, b) => a.date.localeCompare(b.date));
  const mt = meta(pf, today, `Steuerunterlagen ${year}`, "Anlage V");
  return (
    <Doc meta={mt}>
      <Cover meta={mt} facts={[{ label: "Einnahmen", value: eurCompact(sum("income")) }, { label: "Werbungskosten", value: eurCompact(sum("deductions")) }, { label: sum("result") >= 0 ? "Überschuss" : "Verlust", value: eur(sum("result")) }, { label: "Objekte", value: String(rows.length) }]} />
      <Sheet meta={mt} landscape>
        <H1 eyebrow={`Veranlagungsjahr ${year}`}>Einkünfte aus Vermietung und Verpachtung</H1>
        <Table
          cols={[{ label: "Objekt", w: 24 }, { label: "Mieten", w: 10, right: true }, { label: "Umlagen", w: 9, right: true }, { label: "AfA", w: 9, right: true }, { label: "Schuldzinsen", w: 10, right: true }, { label: "Erhaltung", w: 9, right: true }, { label: "Verwaltung", w: 9, right: true }, { label: "Betriebsk.", w: 9, right: true }, { label: "Sonstige", w: 8, right: true }, { label: "Ergebnis", w: 11, right: true }]}
          rows={rows.map(({ p, t }) => [{ text: p.name, bold: true, sub: `${p.street}, ${p.zip} ${p.city}` }, eur(t.rent), eur(t.prepayments), eur(t.afa), eur(t.interest), eur(t.maintenance), eur(t.management), eur(t.operating), eur(t.other), { text: eur(t.result), bold: true }])}
          foot={["Summe", eur(sum("rent")), eur(sum("prepayments")), eur(sum("afa")), eur(sum("interest")), eur(sum("maintenance")), eur(sum("management")), eur(sum("operating")), eur(sum("other")), eur(sum("result"))]}
        />
        <Section title="Absetzung für Abnutzung">
          <Table
            cols={[{ label: "Objekt", w: 30 }, { label: "Anschaffung", w: 12, right: true }, { label: "Bodenwertanteil", w: 13, right: true }, { label: "Bemessungsgrundlage", w: 17, right: true }, { label: "Methode", w: 12 }, { label: "Satz", w: 8, right: true }, { label: `AfA ${year}`, w: 12, right: true }]}
            rows={rows.map(({ p, t }) => [{ text: p.name, bold: true }, dateDE(p.purchaseDate), pct(p.landSharePct), eur(t.afaBasis), p.afa.method, pct(p.afa.ratePct, 2), eur(t.afa)])}
          />
        </Section>
        <P muted>Grundlage: Sollmieten laut Verträgen, laufende Kosten (im Kaufjahr zeitanteilig), erfasste Einzelausgaben und Zinsen laut Tilgungsplan. Die Instandhaltungsrücklage ist erst bei Verausgabung abziehbar und nicht enthalten. Aufstellung zur Vorbereitung der Steuererklärung; sie ersetzt keine steuerliche Beratung.</P>
      </Sheet>
      {expenses.length > 0 && (
        <Sheet meta={mt}>
          <H1 eyebrow={`Veranlagungsjahr ${year}`}>Einzelausgaben</H1>
          <Table
            cols={[{ label: "Datum", w: 11 }, { label: "Objekt", w: 25 }, { label: "Beschreibung", w: 30 }, { label: "Kategorie", w: 17 }, { label: "Behandlung", w: 12 }, { label: "Betrag", w: 12, right: true }]}
            rows={expenses.map((e) => [dateDE(e.date), pf.properties.find((p) => p.id === e.propertyId)?.name ?? "", { text: e.note || "–", bold: true }, EXPENSE_CATEGORY_LABEL[e.category], e.deductible ? "sofort" : "aktiviert", eur2(e.amount)])}
            foot={["Summe", "", "", "", "", eur2(expenses.reduce((s, e) => s + e.amount, 0))]}
          />
        </Sheet>
      )}
    </Doc>
  );
}

/* ───────────── Memo aus dem Berater ───────────── */

const Inl = ({ parts }: { parts: Inline[] }) => <>{parts.map((p, i) => <Text key={i} style={p.bold ? { fontWeight: 600, color: C.ink } : undefined}>{p.text}</Text>)}</>;

export function MemoReport({ pf, today, title, body }: { pf: Portfolio; today: string; title: string; body: string }) {
  const mt = meta(pf, today, "Auswertung", "Berater");
  const blocks = parseMarkdown(body);
  return (
    <Doc meta={mt}>
      <Sheet meta={mt}>
        <H1 eyebrow="Fragestellung">{title}</H1>
        {blocks.map((b, i) => {
          switch (b.type) {
            case "h": return <H2 key={i}><Inl parts={b.inline} /></H2>;
            case "p": return <Text key={i} style={{ marginBottom: 7, fontSize: 9.4, lineHeight: 1.55 }}><Inl parts={b.inline} /></Text>;
            case "ul":
            case "ol":
              return (
                <View key={i} style={{ marginBottom: 7 }}>
                  {b.items.map((it, n) => (
                    <View key={n} style={{ flexDirection: "row", marginBottom: 3 }}>
                      <Text style={{ width: 14, fontSize: 9.4, color: C.gold, fontWeight: 600 }}>{b.type === "ol" ? `${n + 1}.` : "•"}</Text>
                      <Text style={{ flex: 1, fontSize: 9.4, lineHeight: 1.5 }}><Inl parts={it} /></Text>
                    </View>
                  ))}
                </View>
              );
            case "table":
              return <Table key={i} cols={b.head.map((h, n) => ({ label: h.map((x) => x.text).join(""), w: n === 0 ? 2 : 1, right: n > 0 }))} rows={b.rows.map((r) => b.head.map((_, n) => (r[n] ?? []).map((x) => x.text).join("")))} />;
            case "hr": return <View key={i} style={{ height: 0.6, backgroundColor: C.line, marginVertical: 8 }} />;
          }
        })}
        <View style={{ marginTop: 14 }}><P muted>Dieser Text wurde von einem Sprachmodell auf Grundlage der Bestandsdaten erzeugt. Zahlen, rechtliche und steuerliche Aussagen vor Entscheidungen prüfen.</P></View>
      </Sheet>
    </Doc>
  );
}
