import type { ISODate, Portfolio, ReminderKind } from "../types";
import { addMonths, addYears, daysBetween, yearOf } from "./dates";
import { loanStatus } from "./loans";
import { currentColdRent, isLeaseActive, propertyMetrics, unitState } from "./metrics";

export interface Deadline {
  id: string;
  date: ISODate;
  days: number;
  kind: ReminderKind;
  title: string;
  detail: string;
  propertyId?: string;
  /** Eigener Eintrag des Nutzers (bearbeitbar) statt aus den Daten abgeleitet. */
  reminderId?: string;
}

export const DEADLINE_KIND_LABEL: Record<ReminderKind, string> = {
  zinsbindung: "Zinsbindung",
  spekulation: "Spekulationsfrist",
  staffel: "Staffelmiete",
  mieterhoehung: "Mieterhöhung",
  vertragsende: "Vertragsende",
  wartung: "Wartung",
  versicherung: "Versicherung",
  abrechnung: "Nebenkostenabrechnung",
  sonstiges: "Termin",
};

const eur = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;
const dateShort = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/**
 * Alle Fristen im Fenster [asOf, asOf + horizonDays], abgeleitet aus Darlehen,
 * Kaufdaten und Mietverträgen, ergänzt um eigene Termine.
 */
export function deadlines(pf: Portfolio, asOf: ISODate, horizonDays: number): Deadline[] {
  const out: Deadline[] = [];
  const name = (id?: string) => pf.properties.find((p) => p.id === id)?.name ?? "";
  const push = (d: Omit<Deadline, "days">) => {
    const days = daysBetween(asOf, d.date);
    if (days >= 0 && days <= horizonDays) out.push({ ...d, days });
  };

  for (const l of pf.loans) {
    const st = loanStatus(l, asOf);
    if (st.balance <= 0.005) continue;
    push({
      id: `zb-${l.id}`,
      date: l.fixedUntil,
      kind: "zinsbindung",
      title: `Zinsbindung endet · ${l.lender}`,
      detail: `${name(l.propertyId)} · Restschuld dann ca. ${eur(st.balanceAtFixedEnd)} · Anschlussfinanzierung rechtzeitig verhandeln`,
      propertyId: l.propertyId,
    });
    // § 489 Abs. 1 Nr. 2 BGB: Kündigung zehn Jahre nach vollständigem Empfang, Frist sechs Monate.
    // Nur relevant, wenn die Kündigung vor dem regulären Bindungsende wirksam würde.
    const special = addYears(l.startDate, 10);
    if (addMonths(special, 6) < l.fixedUntil) {
      push({
        id: `sk-${l.id}`,
        date: special,
        kind: "zinsbindung",
        title: `Sonderkündigungsrecht · ${l.lender}`,
        detail: `${name(l.propertyId)} · Zehn Jahre nach Auszahlung kündbar mit sechs Monaten Frist (§ 489 BGB)`,
        propertyId: l.propertyId,
      });
    }
  }

  for (const p of pf.properties) {
    push({
      id: `sp-${p.id}`,
      date: addYears(p.notaryDate, 10),
      kind: "spekulation",
      title: `Spekulationsfrist endet · ${p.name}`,
      detail: "Ab diesem Tag ist ein Verkauf einkommensteuerfrei (§ 23 EStG, maßgeblich ist der Kaufvertrag)",
      propertyId: p.id,
    });
  }

  for (const lease of pf.leases) {
    if (lease.end && lease.end < asOf) continue;
    const unit = pf.units.find((u) => u.id === lease.unitId);
    if (!unit) continue;
    const where = `${name(unit.propertyId)} · ${unit.name} · ${lease.tenantName}`;

    if (lease.end) {
      push({
        id: `ve-${lease.id}`,
        date: lease.end,
        kind: "vertragsende",
        title: `Mietvertrag endet · ${unit.name}`,
        detail: `${where} · Übergabe und Anschlussvermietung planen`,
        propertyId: unit.propertyId,
      });
    }
    if (!isLeaseActive(lease, asOf)) continue;

    if (lease.rentType === "staffel") {
      for (const s of lease.steps) {
        push({
          id: `st-${lease.id}-${s.date}`,
          date: s.date,
          kind: "staffel",
          title: `Staffel greift · ${unit.name}`,
          detail: `${where} · neue Kaltmiete ${eur(s.coldRent)}`,
          propertyId: unit.propertyId,
        });
      }
    } else {
      const rent = currentColdRent(lease, asOf);
      const base = lease.lastIncrease ?? lease.start;
      // § 558 BGB: Verlangen frühestens ein Jahr nach der letzten Erhöhung, wirksam nach 15 Monaten.
      // § 557b BGB (Index): Miete muss mindestens ein Jahr unverändert sein.
      const earliest = addMonths(base, 12);
      // Bereits mögliche Anpassungen sind keine Frist, sondern eine Chance (siehe insights).
      if (earliest >= asOf) {
        if (lease.rentType === "index") {
          push({
            id: `ix-${lease.id}`,
            date: earliest,
            kind: "mieterhoehung",
            title: `Indexanpassung möglich · ${unit.name}`,
            detail: `${where} · Verbraucherpreisindex seit ${dateShort(base)} vergleichen (§ 557b BGB)`,
            propertyId: unit.propertyId,
          });
        } else if (unit.marketRent > rent * 1.02) {
          push({
            id: `me-${lease.id}`,
            date: earliest,
            kind: "mieterhoehung",
            title: `Mieterhöhung möglich · ${unit.name}`,
            detail: `${where} · ${eur(rent)} gegenüber Marktmiete ${eur(unit.marketRent)}; Kappungsgrenze und Mietspiegel beachten (§ 558 BGB)`,
            propertyId: unit.propertyId,
          });
        }
      }
    }
  }

  // § 556 Abs. 3 BGB: Die Abrechnung muss dem Mieter binnen zwölf Monaten nach Ende des Jahres zugehen.
  const billYear = yearOf(asOf) - 1;
  for (const p of pf.properties) {
    const unitIds = pf.units.filter((u) => u.propertyId === p.id).map((u) => u.id);
    const hadTenants = pf.leases.some((l) => unitIds.includes(l.unitId) && l.prepayment > 0 && l.start <= `${billYear}-12-31` && (!l.end || l.end >= `${billYear}-01-01`));
    const issued = pf.billings.some((b) => b.propertyId === p.id && b.year === billYear && b.issuedAt);
    if (hadTenants && !issued) {
      push({
        id: `nk-${p.id}-${billYear}`,
        date: `${billYear + 1}-12-31`,
        kind: "abrechnung",
        title: `Nebenkostenabrechnung ${billYear} zustellen · ${p.name}`,
        detail: "Geht die Abrechnung später zu, sind Nachforderungen ausgeschlossen (§ 556 Abs. 3 BGB)",
        propertyId: p.id,
      });
    }
  }

  for (const r of pf.reminders) {
    if (r.done) continue;
    let date = r.date;
    // Wiederkehrende Termine: nächste Fälligkeit ab dem Stichtag.
    if (r.repeatMonths > 0) while (date < asOf) date = addMonths(date, r.repeatMonths);
    const overdue = date < asOf;
    const d: Omit<Deadline, "days"> = {
      id: `rm-${r.id}`,
      date,
      kind: r.kind,
      title: r.title,
      detail: [name(r.propertyId), r.note, r.repeatMonths ? `alle ${r.repeatMonths} Monate` : ""].filter(Boolean).join(" · "),
      propertyId: r.propertyId,
      reminderId: r.id,
    };
    if (overdue) out.push({ ...d, days: daysBetween(asOf, date) });
    else push(d);
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export type InsightLevel = "kritisch" | "warnung" | "chance" | "info";

export interface Insight {
  id: string;
  level: InsightLevel;
  title: string;
  detail: string;
  propertyId?: string;
  /** Wirtschaftliche Größenordnung p. a. zum Sortieren. */
  impact: number;
}

/** Auffälligkeiten und Chancen, die ein Bestandshalter auf einen Blick sehen will. */
export function insights(pf: Portfolio, asOf: ISODate): Insight[] {
  const out: Insight[] = [];
  for (const p of pf.properties) {
    const m = propertyMetrics(p, pf, asOf);
    const units = pf.units.filter((u) => u.propertyId === p.id).map((u) => unitState(u, pf.leases, asOf));

    if (m.cfPreTax < 0) {
      out.push({
        id: `cf-${p.id}`, level: m.ltvPct > 75 ? "kritisch" : "warnung", propertyId: p.id, impact: -m.cfPreTax,
        title: `${p.name}: Kapitaldienst übersteigt den Reinertrag`,
        detail: `Nach Zins und Tilgung fehlen ${eur(-m.cfPreTax / 12)} pro Monat${m.dscr !== null ? ` (DSCR ${m.dscr.toFixed(2).replace(".", ",")})` : ""}. Davon sind ${eur(m.principal / 12)} Tilgung, also Vermögensaufbau.`,
      });
    } else if (m.dscr !== null && m.dscr < 1.1) {
      out.push({
        id: `ds-${p.id}`, level: "warnung", propertyId: p.id, impact: m.debtService * 0.1,
        title: `${p.name}: Kapitaldienst nur knapp gedeckt`,
        detail: `DSCR ${m.dscr.toFixed(2).replace(".", ",")}. Banken erwarten bei Anschlussfinanzierungen üblicherweise mindestens 1,1 bis 1,2.`,
      });
    }
    if (m.ltvPct > 85) {
      out.push({
        id: `lt-${p.id}`, level: "warnung", propertyId: p.id, impact: m.debt * 0.002,
        title: `${p.name}: hoher Beleihungsauslauf`,
        detail: `${m.ltvPct.toFixed(0)} % des geschätzten Werts sind fremdfinanziert. Über 80 % verlangen Banken meist Zinsaufschläge.`,
      });
    }
    for (const u of units) {
      if (u.status === "vermietet" && u.lease && u.unit.marketRent > u.rent * 1.1 && u.lease.rentType === "standard") {
        const gap = (u.unit.marketRent - u.rent) * 12;
        out.push({
          id: `mp-${u.unit.id}`, level: "chance", propertyId: p.id, impact: gap,
          title: `${p.name} · ${u.unit.name}: Miete unter Markt`,
          detail: `${eur(u.rent)} statt ${eur(u.unit.marketRent)} Marktmiete: ${eur(gap)} Potenzial pro Jahr, rechtlich begrenzt durch Kappungsgrenze und Mietspiegel.`,
        });
      }
      if (u.status === "vermietet" && u.lease?.rentType === "index" && addMonths(u.lease.lastIncrease ?? u.lease.start, 12) < asOf) {
        out.push({
          id: `ix-${u.unit.id}`, level: "chance", propertyId: p.id, impact: u.rent * 12 * 0.02,
          title: `${p.name} · ${u.unit.name}: Indexanpassung möglich`,
          detail: `Die Miete ist seit ${dateShort(u.lease.lastIncrease ?? u.lease.start)} unverändert. Verbraucherpreisindex vergleichen und Anpassung in Textform erklären (§ 557b BGB).`,
        });
      }
      if (u.status !== "vermietet" && u.status !== "eigennutzung") {
        out.push({
          id: `le-${u.unit.id}`, level: u.vacantDays > 90 ? "kritisch" : "warnung", propertyId: p.id,
          impact: u.unit.marketRent * 12,
          title: `${p.name} · ${u.unit.name}: ${u.status === "sanierung" ? "Sanierung" : "Leerstand"}${u.vacantDays ? ` seit ${u.vacantDays} Tagen` : ""}`,
          detail: `Entgangene Miete ${eur(u.unit.marketRent)} pro Monat zuzüglich nicht umlegbarer Betriebskosten.`,
        });
      }
    }
  }

  for (const l of pf.loans) {
    const st = loanStatus(l, asOf);
    if (st.balance > 0.005 && st.monthsToFixedEnd >= 0 && st.monthsToFixedEnd <= 36) {
      out.push({
        id: `zb-${l.id}`, level: st.monthsToFixedEnd <= 12 ? "kritisch" : "info", propertyId: l.propertyId,
        impact: st.balanceAtFixedEnd * 0.01,
        title: `${l.lender}: Zinsbindung endet in ${st.monthsToFixedEnd} Monaten`,
        detail: `Restschuld dann ca. ${eur(st.balanceAtFixedEnd)}. Jeder Prozentpunkt Zinsänderung bedeutet rund ${eur(st.balanceAtFixedEnd * 0.01)} pro Jahr. Forward-Darlehen sind bis zu 60 Monate im Voraus möglich.`,
      });
    }
  }

  const order: Record<InsightLevel, number> = { kritisch: 0, warnung: 1, chance: 2, info: 3 };
  return out.sort((a, b) => order[a.level] - order[b.level] || b.impact - a.impact);
}
