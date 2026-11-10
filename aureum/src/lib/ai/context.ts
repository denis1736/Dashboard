import type { Portfolio } from "../types";
import { PROPERTY_TYPE_LABEL } from "../types";
import { portfolioMetrics, propertyMetrics, unitState, type Metrics } from "../calc/metrics";
import { loanStatus } from "../calc/loans";
import { deadlines, insights } from "../calc/deadlines";

const r0 = (n: number) => Math.round(n);
const r2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

const kpis = (m: Metrics) => ({
  marktwert: r0(m.value), restschuld: r0(m.debt), eigenkapital: r0(m.equity), beleihungsauslaufPct: r2(m.ltvPct),
  kaltmieteIstPa: r0(m.rentActual), kaltmieteSollPa: r0(m.rentTarget), marktmietePa: r0(m.rentMarket),
  leerstandPct: r2(m.vacancyPct), leerstandskostenPa: r0(m.vacancyCost), bewirtschaftungPa: r0(m.opex),
  reinertragPa: r0(m.noi), zinsenPa: r0(m.interest), tilgungPa: r0(m.principal), afaPa: r0(m.afa),
  cashflowVorTilgungPa: r0(m.cfBeforePrincipal), cashflowVorSteuernPa: r0(m.cfPreTax), cashflowNachSteuernPa: r0(m.cfAfterTax),
  bruttorenditePct: r2(m.grossYieldPct), nettorenditePct: r2(m.netYieldPct), kaufpreisfaktor: r2(m.factor),
  cashOnCashPct: r2(m.cashOnCashPct), dscr: r2(m.dscr), eingesetztesEigenkapital: r0(m.equityInvested),
  durchschnittszinsPct: r2(m.avgInterestPct),
});

export interface ContextOptions { includeTenantNames: boolean }

/**
 * Verdichtet den Bestand für den Berater. Enthalten sind Objekt-, Vertrags- und
 * Finanzierungsdaten; Mieternamen nur mit ausdrücklicher Freigabe, Kontaktdaten
 * und Zahlungsverläufe nie. Große Bestände werden schrittweise gröber, damit
 * das Tageskontingent an Tokens nicht mit einer Anfrage verbraucht ist.
 */
export function buildContext(pf: Portfolio, today: string, opts: ContextOptions): string {
  const build = (level: 0 | 1 | 2) => {
    const objekte = pf.properties.map((p) => {
      const m = propertyMetrics(p, pf, today);
      const units = pf.units.filter((u) => u.propertyId === p.id).map((u) => unitState(u, pf.leases, today));
      return {
        name: p.name, adresse: `${p.street}, ${p.zip} ${p.city}`, art: PROPERTY_TYPE_LABEL[p.type], baujahr: p.yearBuilt,
        kaufvertrag: p.notaryDate, kaufpreis: p.purchasePrice, wohnflaecheQm: m.area, einheiten: m.units, davonNichtVermietet: m.unitsVacant,
        afa: `${p.afa.method} ${p.afa.ratePct} %`, kennzahlen: kpis(m),
        darlehen: pf.loans.filter((l) => l.propertyId === p.id).map((l) => {
          const st = loanStatus(l, today);
          return { bank: l.lender, art: l.type, restschuld: r0(st.balance), zinsPct: st.ratePct, monatsrate: r0(st.payment), zinsbindungBis: l.fixedUntil, restschuldBeiBindungsende: r0(st.balanceAtFixedEnd), angenommenerAnschlusszinsPct: l.followUpPct ?? null };
        }),
        ...(level === 0 ? {
          einheitenDetail: units.map((u) => ({
            name: u.unit.name, qm: u.unit.area, status: u.status, kaltmiete: u.rent || null, marktmiete: u.unit.marketRent,
            ...(u.lease ? { mietbeginn: u.lease.start, mietende: u.lease.end ?? null, mietart: u.lease.rentType, letzteErhoehung: u.lease.lastIncrease ?? null, ...(opts.includeTenantNames ? { mieter: u.lease.tenantName } : {}) } : { leerSeitTagen: u.vacantDays || null }),
          })),
        } : {}),
      };
    });
    return JSON.stringify({
      stichtag: today,
      hinweis: "Kennzahlen sind Jahres-Laufraten zum Stichtag. Marktwerte sind Schätzungen per Preisindex oder eigene Angaben.",
      grenzsteuersatzPct: pf.settings.taxRatePct,
      bestand: { objekte: pf.properties.length, ...kpis(portfolioMetrics(pf, today)) },
      objekte,
      ...(level < 2 ? {
        fristenNaechste12Monate: deadlines(pf, today, 365).slice(0, 25).map((d) => ({ datum: d.date, art: d.kind, titel: d.title, objekt: pf.properties.find((p) => p.id === d.propertyId)?.name ?? null })),
        auffaelligkeiten: insights(pf, today).slice(0, 20).map((i) => ({ stufe: i.level, titel: i.title, detail: i.detail })),
      } : {}),
    });
  };
  let json = build(0);
  if (json.length > 26_000) json = build(1);
  if (json.length > 26_000) json = build(2);
  return json;
}

/** Grobe Schätzung: deutsches JSON liegt bei etwa 3,3 Zeichen je Token. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 3.3);
