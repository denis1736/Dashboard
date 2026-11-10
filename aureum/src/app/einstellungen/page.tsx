"use client";

import { useRef, useState } from "react";
import { Download, KeyRound, ShieldCheck, Trash2, Upload } from "lucide-react";
import { useStore } from "@/lib/store";
import { HPI_AS_OF, HPI_DEFAULT } from "@/lib/calc/valuation";
import { downloadText } from "@/lib/csv";
import { usePf } from "@/components/blocks";
import { AccentPicker } from "@/components/shell";
import { Badge, Button, Card, Field, Modal, NumberInput, PageHeader, Segmented, TextInput, Toggle } from "@/components/ui";

export default function Einstellungen() {
  const { pf, today } = usePf();
  const { setSettings, setPassphrase, exportBackup, importBackup, loadDemo, reset } = useStore();
  const encrypted = useStore((s) => s.encrypted);
  const s = pf.settings;
  const file = useRef<HTMLInputElement>(null);

  const [vault, setVault] = useState(false);
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);
  const [backupPass, setBackupPass] = useState("");
  const [importing, setImporting] = useState<{ text: string; pass: string; error?: string; needsPass: boolean } | null>(null);
  const [msg, setMsg] = useState("");
  const [wipe, setWipe] = useState(false);
  const [index, setIndex] = useState(false);

  const saveVault = async () => {
    setBusy(true);
    await setPassphrase(p1);
    setBusy(false);
    setVault(false);
    setP1(""); setP2("");
    setMsg("Der Bestand ist jetzt verschlüsselt. Bewahren Sie die Passphrase sicher auf.");
  };

  const doExport = async () => {
    const text = await exportBackup(backupPass || undefined);
    downloadText(`aureum-backup-${today}${backupPass ? "-verschluesselt" : ""}.json`, text, "application/json");
    setBackupPass("");
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    let needsPass = false;
    try { needsPass = !!JSON.parse(text).enc; } catch {}
    setImporting({ text, pass: "", needsPass });
    if (file.current) file.current.value = "";
  };

  const doImport = async () => {
    if (!importing) return;
    try {
      await importBackup(importing.text, importing.pass || undefined);
      setImporting(null);
      setMsg("Backup eingespielt.");
    } catch (e) {
      setImporting({ ...importing, error: (e as Error).message });
    }
  };

  return (
    <>
      <PageHeader title="Einstellungen" />
      {msg && <div role="status" className="rise mb-4 rounded-[12px] border border-line bg-good-soft px-4 py-3 text-[14px]">{msg}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rise rise-1" title="Bestand">
          <div className="space-y-4">
            <Field label="Bezeichnung" hint="Erscheint auf Berichten."><TextInput value={s.ownerName} onChange={(ownerName) => setSettings({ ownerName })} /></Field>
            <Field label="Persönlicher Grenzsteuersatz" hint="Inklusive Solidaritätszuschlag und gegebenenfalls Kirchensteuer. Grundlage aller Nach-Steuer-Werte.">
              <NumberInput value={s.taxRatePct} onChange={(taxRatePct) => setSettings({ taxRatePct: Math.max(0, Math.min(60, taxRatePct)) })} suffix="%" digits={2} />
            </Field>
          </div>
        </Card>

        <Card className="rise rise-1 lg:col-span-2" title="Absender für Schreiben">
          <p className="mb-4 text-text-2">Erscheint im Briefkopf von Nebenkostenabrechnungen, Mieterhöhungen und Mahnungen. Die Bankverbindung wird für Nachzahlungen genannt.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Name oder Firma"><TextInput value={s.sender.name} onChange={(name) => setSettings({ sender: { ...s.sender, name } })} /></Field>
            <Field label="Straße und Hausnummer"><TextInput value={s.sender.street} onChange={(street) => setSettings({ sender: { ...s.sender, street } })} /></Field>
            <Field label="PLZ und Ort"><TextInput value={s.sender.zipCity} onChange={(zipCity) => setSettings({ sender: { ...s.sender, zipCity } })} /></Field>
            <Field label="E-Mail"><TextInput type="email" value={s.sender.email} onChange={(email) => setSettings({ sender: { ...s.sender, email } })} /></Field>
            <Field label="Telefon"><TextInput type="tel" value={s.sender.phone} onChange={(phone) => setSettings({ sender: { ...s.sender, phone } })} /></Field>
            <Field label="IBAN"><TextInput value={s.sender.iban} onChange={(iban) => setSettings({ sender: { ...s.sender, iban } })} /></Field>
            <Field label="Bank"><TextInput value={s.sender.bank} onChange={(bank) => setSettings({ sender: { ...s.sender, bank } })} /></Field>
          </div>
        </Card>

        <Card className="rise rise-1" title="Darstellung">
          <div className="space-y-5">
            <div><div className="mb-2 text-[12px] font-medium text-text-2">Farbschema</div><Segmented label="Farbschema" value={s.theme} onChange={(theme) => setSettings({ theme })} options={[{ value: "system", label: "Automatisch" }, { value: "hell", label: "Hell" }, { value: "dunkel", label: "Dunkel" }]} /></div>
            <div><div className="mb-2 text-[12px] font-medium text-text-2">Akzentfarbe</div><AccentPicker /></div>
            <div><div className="mb-2 text-[12px] font-medium text-text-2">Dichte</div><Segmented label="Dichte" value={s.density} onChange={(density) => setSettings({ density })} options={[{ value: "komfortabel", label: "Komfortabel" }, { value: "kompakt", label: "Kompakt" }]} /></div>
            <p className="text-[13px] text-text-2">Die Bausteine der Übersicht ordnen Sie dort über „Anpassen“.</p>
          </div>
        </Card>

        <Card className="rise rise-2" title="Sicherheit" action={encrypted ? <Badge tone="good" dot>Verschlüsselt</Badge> : <Badge tone="warn" dot>Unverschlüsselt</Badge>}>
          <p className="text-text-2">Ihr Bestand liegt ausschließlich in diesem Browser. Mit einer Passphrase wird er mit AES-256-GCM verschlüsselt; der Schlüssel entsteht per PBKDF2 aus der Passphrase und wird nie gespeichert.</p>
          <p className="mt-2 text-[13px] text-warn">Ohne Passphrase kein Zugriff: Es gibt keine Wiederherstellung. Legen Sie zusätzlich ein Backup an.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant={encrypted ? "secondary" : "primary"} icon={<KeyRound size={15} />} onClick={() => setVault(true)}>{encrypted ? "Passphrase ändern" : "Passphrase festlegen"}</Button>
            {encrypted && <Button variant="danger" onClick={async () => { await setPassphrase(null); setMsg("Die Verschlüsselung wurde entfernt."); }}>Verschlüsselung entfernen</Button>}
          </div>
        </Card>

        <Card className="rise rise-2" title="Berater (KI)">
          <div className="space-y-3">
            <Toggle label="Bestandsdaten an den Berater senden" hint="Einwilligung zur Übertragung an Groq (USA). Ohne sie beantwortet der Berater nur allgemeine Fragen." checked={s.ai.consent} onChange={(consent) => setSettings({ ai: { ...s.ai, consent } })} />
            <Toggle label="Mieternamen mitsenden" hint="Kontaktdaten und Zahlungsverläufe werden nie übertragen." checked={s.ai.includeTenantNames} onChange={(includeTenantNames) => setSettings({ ai: { ...s.ai, includeTenantNames } })} />
          </div>
        </Card>

        <Card className="rise rise-3" title="Backup">
          <p className="text-text-2">Sichern Sie den gesamten Bestand als Datei, etwa für den Umzug auf ein anderes Gerät.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input type="password" className="field" placeholder="Backup-Passphrase (empfohlen)" value={backupPass} onChange={(e) => setBackupPass(e.target.value)} autoComplete="new-password" aria-label="Passphrase für das Backup" />
            <Button icon={<Download size={15} />} onClick={doExport}>{backupPass ? "Verschlüsselt sichern" : "Unverschlüsselt sichern"}</Button>
          </div>
          <div className="mt-3">
            <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
            <Button icon={<Upload size={15} />} onClick={() => file.current?.click()}>Backup einspielen</Button>
          </div>
        </Card>

        <Card className="rise rise-3" title="Bewertung" action={<Button size="sm" onClick={() => setIndex(true)}>Index bearbeiten</Button>}>
          <p className="text-text-2">Marktwerte werden mit dem Häuserpreisindex für Deutschland (2015 = 100) fortgeschrieben, sofern Sie beim Objekt keinen eigenen Wert hinterlegen.</p>
          <p className="mt-2 text-[13px] text-warn">Die hinterlegten Indexwerte sind Näherungen bis {HPI_AS_OF} und nicht automatisch mit der amtlichen Reihe (Destatis 61262-0001) abgeglichen. Bitte prüfen und bei Bedarf überschreiben. Regionale Märkte weichen deutlich vom Bundesschnitt ab.</p>
        </Card>

        <Card className="rise rise-4 lg:col-span-2" title="Daten">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => { loadDemo(); setMsg("Das Beispielportfolio wurde geladen und hat den bisherigen Bestand ersetzt."); }}>Beispielportfolio laden</Button>
            <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => setWipe(true)}>Alle Daten löschen</Button>
            <span className="text-[13px] text-muted">{pf.properties.length} Objekte · {pf.units.length} Einheiten · {pf.loans.length} Darlehen</span>
          </div>
        </Card>
      </div>

      <Modal open={vault} onClose={() => setVault(false)} title={encrypted ? "Passphrase ändern" : "Passphrase festlegen"} description="Mindestens zwölf Zeichen. Ein Satz aus mehreren Wörtern ist sicherer und leichter zu merken als ein kurzes Kennwort."
        footer={<><Button onClick={() => setVault(false)}>Abbrechen</Button><Button variant="primary" icon={<ShieldCheck size={15} />} disabled={busy || p1.length < 12 || p1 !== p2} onClick={saveVault}>{busy ? "Verschlüssele …" : "Verschlüsseln"}</Button></>}>
        <div className="space-y-4">
          <Field label="Neue Passphrase"><input type="password" className="field" value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" autoFocus /></Field>
          <Field label="Wiederholen" hint={p2 && p1 !== p2 ? "Die Eingaben stimmen nicht überein." : p1 && p1.length < 12 ? `Noch ${12 - p1.length} Zeichen.` : undefined}><input type="password" className="field" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" /></Field>
        </div>
      </Modal>

      <Modal open={!!importing} onClose={() => setImporting(null)} title="Backup einspielen" description="Der aktuelle Bestand auf diesem Gerät wird vollständig ersetzt."
        footer={<><Button onClick={() => setImporting(null)}>Abbrechen</Button><Button variant="primary" disabled={importing?.needsPass && !importing.pass} onClick={doImport}>Bestand ersetzen</Button></>}>
        {importing?.needsPass && <Field label="Passphrase des Backups"><input type="password" className="field" value={importing.pass} onChange={(e) => setImporting({ ...importing, pass: e.target.value, error: undefined })} autoFocus /></Field>}
        {!importing?.needsPass && <p className="text-text-2">Die Datei ist unverschlüsselt und kann direkt eingespielt werden.</p>}
        {importing?.error && <p role="alert" className="mt-3 text-[13px] text-bad">{importing.error}</p>}
      </Modal>

      <Modal open={wipe} onClose={() => setWipe(false)} title="Alle Daten löschen?" description="Objekte, Verträge, Darlehen, Zahlungen und Einstellungen werden von diesem Gerät entfernt. Das lässt sich nicht rückgängig machen."
        footer={<><Button onClick={() => setWipe(false)}>Abbrechen</Button><Button variant="danger" onClick={async () => { await reset(); setWipe(false); }}>Endgültig löschen</Button></>}>
        <p className="text-text-2">Tipp: Legen Sie vorher ein Backup an, falls Sie den Bestand später wieder benötigen.</p>
      </Modal>

      <Modal open={index} onClose={() => setIndex(false)} title="Häuserpreisindex" description="Jahresdurchschnitte, 2015 = 100. Leere Felder verwenden den hinterlegten Näherungswert."
        footer={<><Button className="mr-auto" onClick={() => setSettings({ indexOverrides: {} })}>Alle zurücksetzen</Button><Button variant="primary" onClick={() => setIndex(false)}>Fertig</Button></>}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {[...new Set([...Object.keys(HPI_DEFAULT), ...Object.keys(s.indexOverrides), String(Number(HPI_AS_OF) + 1)])].sort().reverse().map((y) => (
            <Field key={y} label={`${y}${s.indexOverrides[y] !== undefined ? " · eigener Wert" : ""}`}>
              <NumberInput value={s.indexOverrides[y]} placeholder={HPI_DEFAULT[y]?.toLocaleString("de-DE") ?? "–"} digits={1}
                onChange={(v) => { const next = { ...s.indexOverrides }; if (v > 0) next[y] = v; else delete next[y]; setSettings({ indexOverrides: next }); }} />
            </Field>
          ))}
        </div>
      </Modal>
    </>
  );
}
