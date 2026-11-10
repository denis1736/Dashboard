"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Calculator, CheckCircle2, Copy, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useStore } from "@/lib/store";
import { billingDeadline, billingTotal, billingWarnings, statements, UNIT_OF_KEY } from "@/lib/calc/billing";
import { daysBetween, yearOf } from "@/lib/calc/dates";
import { dateDE, eur, eur2, inDays, uid } from "@/lib/format";
import { ALLOCATION_LABEL, BETRKV, type AllocationKey, type Billing, type CostItem } from "@/lib/types";
import { usePf } from "@/components/blocks";
import { Badge, Button, Card, cx, Empty, IconButton, NumberInput, PageHeader, Segmented, Select, Stat, Toggle } from "@/components/ui";
import { ReportButton } from "@/components/report-button";
import { DeleteButton } from "@/components/forms";

const KEYS = (Object.keys(ALLOCATION_LABEL) as AllocationKey[]).map((value) => ({ value, label: ALLOCATION_LABEL[value] }));
const PRESET: [string, AllocationKey][] = [["grundsteuer", "flaeche"], ["wasser", "personen"], ["entwaesserung", "personen"], ["heizung", "direkt"], ["muell", "einheiten"], ["versicherung", "flaeche"], ["beleuchtung", "flaeche"], ["hauswart", "flaeche"]];
const blank = (category = "grundsteuer", key: AllocationKey = "flaeche"): CostItem => ({ id: uid(), category, label: "", amount: 0, key, shares: {}, labor35a: 0 });

export default function Nebenkosten() {
  const { pf, today } = usePf();
  const { upsert, remove } = useStore();
  const now = yearOf(today);
  const [propertyId, setPropertyId] = useState(pf.properties[0]?.id ?? "");
  const [year, setYear] = useState(String(now - 1));
  const pid = pf.properties.some((p) => p.id === propertyId) ? propertyId : pf.properties[0]?.id ?? "";
  const y = Number(year);

  const billing = pf.billings.find((b) => b.propertyId === pid && b.year === y);
  const previous = pf.billings.find((b) => b.propertyId === pid && b.year === y - 1);
  const units = pf.units.filter((u) => u.propertyId === pid);
  const list = useMemo(() => (billing ? statements(billing, pf) : []), [billing, pf]);
  const warnings = useMemo(() => (billing ? billingWarnings(billing, pf, today) : []), [billing, pf, today]);

  if (pf.properties.length === 0) return (<><PageHeader title="Nebenkosten" /><div className="card"><Empty icon={<Calculator size={22} />} title="Noch keine Objekte" text="Die Betriebskostenabrechnung baut auf Einheiten und Mietverträgen auf." /></div></>);

  const save = (b: Billing) => upsert("billings", b);
  const setItem = (id: string, patch: Partial<CostItem>) => billing && save({ ...billing, items: billing.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  const create = (items: CostItem[]) => save({ id: uid(), propertyId: pid, year: y, items, prepaid: {}, adjustPrepayment: false });

  const total = billing ? billingTotal(billing) : 0;
  const charged = list.reduce((s, x) => s + x.costs, 0);
  const balance = list.reduce((s, x) => s + x.balance, 0);
  const deadline = billingDeadline(y);
  const left = daysBetween(today, deadline);

  return (
    <>
      <PageHeader title="Nebenkosten" sub="Betriebskostenabrechnung je Objekt und Jahr: Kosten erfassen, Umlageschlüssel wählen, Einzelabrechnungen als Schreiben erzeugen.">
        <div className="w-[250px]"><Select value={pid} onChange={setPropertyId} aria-label="Objekt" options={pf.properties.map((p) => ({ value: p.id, label: p.name }))} /></div>
        <Segmented label="Abrechnungsjahr" value={year} onChange={setYear} options={[now - 2, now - 1, now].map((v) => ({ value: String(v), label: String(v) }))} />
      </PageHeader>

      {!billing ? (
        <div className="card rise rise-1">
          <Empty icon={<Calculator size={22} />} title={`Für ${y} gibt es noch keine Abrechnung`} text="Beginnen Sie mit den üblichen Kostenarten oder übernehmen Sie Positionen und Schlüssel aus dem Vorjahr. Beträge tragen Sie anschließend ein.">
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => create(PRESET.map(([c, k]) => blank(c, k)))}>Mit üblichen Kostenarten beginnen</Button>
            {previous && <Button icon={<Copy size={15} />} onClick={() => create(previous.items.map((i) => ({ ...i, id: uid(), amount: 0, labor35a: 0, shares: i.key === "personen" ? i.shares : {} })))}>Positionen aus {y - 1} übernehmen</Button>}
          </Empty>
        </div>
      ) : (
        <>
          <div className="card rise rise-1 mb-4 grid grid-cols-2 gap-x-6 gap-y-6 p-5 md:grid-cols-4">
            <Stat label="Gesamtkosten" value={eur(total)} hint={`${billing.items.length} Positionen`} />
            <Stat label="Auf Mieter umgelegt" value={eur(charged)} hint={total - charged > 0.5 ? `${eur(total - charged)} trägt der Eigentümer (Leerstand)` : "vollständig umgelegt"} />
            <Stat label={balance >= 0 ? "Nachzahlungen (Saldo)" : "Guthaben (Saldo)"} value={eur(Math.abs(balance))} tone={balance >= 0 ? "accent" : undefined} hint={`${list.length} Einzelabrechnungen`} />
            <Stat
              label="Abrechnungsfrist"
              value={billing.issuedAt ? "gewahrt" : dateDE(deadline)}
              tone={billing.issuedAt ? "good" : left < 0 ? "bad" : left <= 60 ? "accent" : undefined}
              hint={billing.issuedAt ? `zugestellt am ${dateDE(billing.issuedAt)}` : left < 0 ? "abgelaufen" : inDays(left)}
            />
          </div>

          {warnings.length > 0 && (
            <div className="rise rise-2 mb-4 rounded-[14px] border border-line bg-warn-soft px-5 py-4">
              <div className="mb-2 flex items-center gap-2 font-semibold"><TriangleAlert size={16} className="text-warn" />Bitte vor dem Versand prüfen</div>
              <ul className="space-y-1.5 text-[13px] leading-snug text-text-2">{warnings.map((w) => <li key={w} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-warn" />{w}</li>)}</ul>
            </div>
          )}

          <Card className="rise rise-2 mb-4" pad={false} title="Kostenpositionen" action={<Button size="sm" icon={<Plus size={14} />} onClick={() => save({ ...billing, items: [...billing.items, blank()] })}>Position</Button>}>
            <div className="overflow-x-auto border-t border-line">
              <table className="tbl min-w-[860px]">
                <thead><tr><th className="w-[26%]">Kostenart (§ 2 BetrKV)</th><th>Ergänzung</th><th className="r w-[140px]">Gesamtkosten</th><th className="w-[190px]">Umlageschlüssel</th><th className="r w-[140px]" title="Arbeitskosten für haushaltsnahe Dienstleistungen, die Mieter steuerlich geltend machen können">davon § 35a</th><th className="w-[44px]" /></tr></thead>
                <tbody>
                  {billing.items.map((item) => {
                    const needs = item.key === "personen" || item.key === "verbrauch" || item.key === "direkt";
                    return [
                      <tr key={item.id} className="hover:!bg-transparent">
                        <td><Select value={item.category} onChange={(category) => setItem(item.id, { category })} aria-label="Kostenart" options={BETRKV.map((b) => ({ value: b.key, label: `${b.nr} · ${b.label}` }))} /></td>
                        <td><input className="field" value={item.label} placeholder="optional" aria-label="Ergänzung" onChange={(e) => setItem(item.id, { label: e.target.value })} /></td>
                        <td><NumberInput value={item.amount} onChange={(amount) => setItem(item.id, { amount })} suffix="€" digits={2} /></td>
                        <td><Select<AllocationKey> value={item.key} onChange={(key) => setItem(item.id, { key })} aria-label="Umlageschlüssel" options={KEYS} /></td>
                        <td><NumberInput value={item.labor35a || undefined} onChange={(labor35a) => setItem(item.id, { labor35a })} suffix="€" digits={2} placeholder="0" /></td>
                        <td><IconButton label="Position löschen" onClick={() => save({ ...billing, items: billing.items.filter((i) => i.id !== item.id) })}><Trash2 size={15} /></IconButton></td>
                      </tr>,
                      needs && (
                        <tr key={`${item.id}-s`} className="hover:!bg-transparent">
                          <td colSpan={6} className="!pt-0">
                            <div className="rounded-[12px] bg-surface-2 p-3">
                              <div className="mb-2 text-[12px] text-text-2">
                                {item.key === "personen" && "Personen je Einheit"}
                                {item.key === "verbrauch" && "Verbrauchseinheiten je Einheit (z. B. m³ laut Zähler)"}
                                {item.key === "direkt" && "Betrag je Einheit in Euro, z. B. aus der Abrechnung des Messdienstes"}
                              </div>
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                                {units.map((u) => (
                                  <label key={u.id} className="block min-w-0">
                                    <span className="mb-1 block truncate text-[11px] text-muted">{u.name}</span>
                                    <NumberInput value={item.shares[u.id]} placeholder="0" digits={2} suffix={UNIT_OF_KEY[item.key]} onChange={(v) => setItem(item.id, { shares: { ...item.shares, [u.id]: v } })} />
                                  </label>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ),
                    ];
                  })}
                </tbody>
                <tfoot><tr><td colSpan={2}>Summe</td><td className="r">{eur2(total)}</td><td /><td className="r">{eur2(billing.items.reduce((s, i) => s + i.labor35a, 0))}</td><td /></tr></tfoot>
              </table>
            </div>
          </Card>

          <Card className="rise rise-3" pad={false} title="Einzelabrechnungen" action={list.length > 0 ? <ReportButton kind="nebenkosten" opts={{ billingId: billing.id }} label="Alle als PDF" size="sm" variant="primary" /> : undefined}>
            {list.length === 0 ? <p className="border-t border-line px-5 py-8 text-center text-text-2">In {y} lief in diesem Objekt kein Mietvertrag.</p> : (
              <div className="overflow-x-auto border-t border-line">
                <table className="tbl min-w-[820px]">
                  <thead><tr><th>Mieter</th><th>Zeitraum</th><th className="r">Kostenanteil</th><th className="r w-[160px]">Vorauszahlungen</th><th className="r">Ergebnis</th><th className="r">Neue Vorauszahlung</th><th /></tr></thead>
                  <tbody>
                    {list.map((st) => (
                      <tr key={st.lease.id}>
                        <td><span className="font-medium">{st.lease.tenantName}</span><div className="text-[12px] text-muted">{st.unit.name}</div></td>
                        <td className="whitespace-nowrap text-text-2">{st.days === st.daysInYear ? "ganzes Jahr" : `${dateDE(st.from)} – ${dateDE(st.to)}`}{st.days !== st.daysInYear && <div className="text-[12px] text-muted">{st.days} von {st.daysInYear} Tagen</div>}</td>
                        <td className="r">{eur2(st.costs)}</td>
                        <td>
                          <NumberInput value={billing.prepaid[st.lease.id]} placeholder={st.prepaidDue.toLocaleString("de-DE", { minimumFractionDigits: 2 })} suffix="€" digits={2}
                            onChange={(v) => { const prepaid = { ...billing.prepaid }; if (v > 0) prepaid[st.lease.id] = v; else delete prepaid[st.lease.id]; save({ ...billing, prepaid }); }} />
                        </td>
                        <td className="r">
                          <span className={cx("font-semibold", st.balance > 0.005 ? "text-bad" : st.balance < -0.005 ? "text-good" : "")}>{eur2(Math.abs(st.balance))}</span>
                          <div className="text-[12px] text-muted">{st.balance > 0.005 ? "Nachzahlung" : st.balance < -0.005 ? "Guthaben" : "ausgeglichen"}</div>
                        </td>
                        <td className="r">{eur(st.suggestedPrepayment)}<div className="text-[12px] text-muted">bisher {eur(st.lease.prepayment)}</div></td>
                        <td className="r"><ReportButton kind="nebenkosten" opts={{ billingId: billing.id, leaseId: st.lease.id }} label="PDF" size="sm" variant="ghost" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="grid gap-4 border-t border-line px-5 py-4 lg:grid-cols-2">
              <Toggle label="Vorauszahlung im Schreiben anpassen" hint="Erklärt die Anpassung auf den kostendeckenden Betrag (§ 560 Abs. 4 BGB). Die neue Vorauszahlung tragen Sie danach im Mietvertrag ein." checked={billing.adjustPrepayment} onChange={(adjustPrepayment) => save({ ...billing, adjustPrepayment })} />
              <Toggle label="Abrechnung ist zugestellt" hint="Markiert die Frist als gewahrt und entfernt sie aus der Fristenliste." checked={!!billing.issuedAt} onChange={(v) => save({ ...billing, issuedAt: v ? today : undefined })} />
            </div>
            <p className="border-t border-line px-5 py-3 text-[12px] leading-snug text-muted">
              Vorauszahlungen: Ohne Eintrag gilt das vertragliche Soll des Zeitraums. Tragen Sie die tatsächlich geleisteten Zahlungen ein, wenn sie davon abweichen. {!pf.settings.sender.name && <>Für die Schreiben fehlt noch Ihr <Link href="/einstellungen" className="text-accent underline">Absender</Link>. </>}
              Die Abrechnung ersetzt keine Rechtsprüfung; maßgeblich ist, welche Kostenarten und Schlüssel Ihr Mietvertrag vorsieht.
            </p>
          </Card>

          <div className="mt-4 flex items-center justify-between">
            {billing.issuedAt ? <Badge tone="good"><CheckCircle2 size={13} />Zugestellt am {dateDE(billing.issuedAt)}</Badge> : <span />}
            <div><DeleteButton size="sm" what={`Abrechnung ${y}`} onDelete={() => remove("billings", billing.id)} /></div>
          </div>
        </>
      )}
    </>
  );
}
