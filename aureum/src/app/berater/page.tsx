"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { ArrowUp, Database, ShieldCheck, Sparkles, Square, Trash2, TriangleAlert } from "lucide-react";
import { useStore } from "@/lib/store";
import { buildContext, estimateTokens } from "@/lib/ai/context";
import { usePf } from "@/components/blocks";
import { Markdown } from "@/components/markdown";
import { Button, cx, IconButton, PageHeader, Toggle } from "@/components/ui";
import { ReportButton } from "@/components/report-button";

interface Msg { role: "user" | "assistant"; content: string }
type Notice = { kind: "limit"; until: number; scope: "minute" | "tag" } | { kind: "setup" } | { kind: "error"; text: string } | null;

// Der Verlauf bleibt nur für die Sitzung im Arbeitsspeicher und wird nie gespeichert.
const useChat = create<{ messages: Msg[]; set: (m: Msg[]) => void }>((set) => ({ messages: [], set: (messages) => set({ messages }) }));

const MIN_GAP_MS = 2500;

export default function Berater() {
  const { pf, today } = usePf();
  const setSettings = useStore((s) => s.setSettings);
  const { messages, set } = useChat();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [withData, setWithData] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [quota, setQuota] = useState<{ requests?: string; model?: string }>({});
  const [now, setNow] = useState(Date.now());
  const abort = useRef<AbortController | null>(null);
  const lastSent = useRef(0);
  const end = useRef<HTMLDivElement>(null);

  const consent = pf.settings.ai.consent;
  const context = useMemo(() => (consent && withData && pf.properties.length ? buildContext(pf, today, { includeTenantNames: pf.settings.ai.includeTenantNames }) : ""), [pf, today, consent, withData]);
  const wait = notice?.kind === "limit" ? Math.max(0, Math.ceil((notice.until - now) / 1000)) : 0;

  useEffect(() => {
    if (notice?.kind !== "limit") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [notice]);
  useEffect(() => { if (notice?.kind === "limit" && wait === 0) setNotice(null); }, [wait, notice]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [messages, busy]);

  const first = pf.properties[0]?.name;
  const prompts = [
    "Wie hoch ist mein Gesamt-Cashflow, und wo verliere ich Geld?",
    "Welche Objekte haben die schlechteste Rendite, und woran liegt es?",
    "Welche Zinsbindungen laufen aus, und was kostet mich das?",
    "Wo kann ich die Miete erhöhen, und was ist rechtlich zu beachten?",
    ...(first ? [`Analysiere den Standort von „${first}“ und zeige Potenziale.`, `Entwirf ein Mieterhöhungsschreiben für die Einheit mit dem größten Abstand zur Marktmiete.`] : ["Worauf achte ich beim Kauf einer vermieteten Eigentumswohnung?"]),
  ];

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy || wait > 0) return;
    const gap = Date.now() - lastSent.current;
    if (gap < MIN_GAP_MS) await new Promise((r) => setTimeout(r, MIN_GAP_MS - gap));
    lastSent.current = Date.now();

    const history: Msg[] = [...messages, { role: "user", content: q }];
    set([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setNotice(null);
    abort.current = new AbortController();
    const fail = (n: Notice) => { set(history); setNotice(n); };

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-12), context }),
        signal: abort.current.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 503) fail({ kind: "setup" });
        else if (res.status === 429) {
          // Die Frage zurück ins Eingabefeld legen, damit sie nach der Pause nicht neu getippt werden muss.
          set(messages);
          setInput(q);
          setNotice({ kind: "limit", until: Date.now() + (err.retryAfter ?? 60) * 1000, scope: err.scope ?? "minute" });
        }
        else if (res.status === 413) fail({ kind: "error", text: "Die Unterhaltung ist zu lang geworden. Bitte beginnen Sie eine neue." });
        else fail({ kind: "error", text: err.error === "schluessel" ? "Der hinterlegte Groq-Schlüssel wurde abgelehnt." : "Der Berater ist gerade nicht erreichbar. Bitte in einem Moment erneut versuchen." });
        return;
      }
      setQuota({ requests: res.headers.get("x-aureum-remaining-requests") || undefined, model: res.headers.get("x-aureum-model") || undefined });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        set([...history, { role: "assistant", content: acc }]);
      }
      if (!acc.trim()) fail({ kind: "error", text: "Es kam keine Antwort zurück. Bitte erneut versuchen." });
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        const cur = useChat.getState().messages;
        if (!cur[cur.length - 1]?.content) set(history);
      } else fail({ kind: "error", text: "Verbindung unterbrochen. Bitte erneut versuchen." });
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  if (!consent) {
    return (
      <>
        <PageHeader title="Berater" sub="Stellen Sie Fragen zu Ihrem Bestand in normaler Sprache." />
        <div className="card rise rise-1 mx-auto max-w-[680px] p-7 sm:p-9">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent"><ShieldCheck size={22} /></div>
          <h2 className="display text-[24px]">Bevor es losgeht: Ihre Daten, Ihre Entscheidung</h2>
          <p className="mt-3 text-text-2">Der Berater nutzt ein Sprachmodell des Anbieters Groq (Server in den USA). Damit er mit Ihren Zahlen rechnen kann, wird bei jeder Frage ein Auszug Ihres Bestands mitgesendet.</p>
          <ul className="my-5 space-y-2.5 text-[14px]">
            {[
              ["Wird gesendet", "Objektnamen und Adressen, Kaufdaten, Flächen, Mieten, Darlehen, Kennzahlen, Fristen."],
              ["Wird nie gesendet", "Kontaktdaten von Mietern, Zahlungsverläufe, Notizen, Ihre Passphrase."],
              ["Bleibt lokal", "Der Gesprächsverlauf wird nicht gespeichert und ist nach dem Schließen der Seite weg."],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /><span><strong className="font-semibold">{t}:</strong> <span className="text-text-2">{d}</span></span></li>
            ))}
          </ul>
          <div className="rounded-[12px] border border-line bg-surface-2 px-4 py-3">
            <Toggle label="Mieternamen mitsenden" hint="Nur nötig, wenn der Berater Schreiben mit Namen entwerfen soll." checked={pf.settings.ai.includeTenantNames} onChange={(v) => setSettings({ ai: { ...pf.settings.ai, includeTenantNames: v } })} />
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setSettings({ ai: { ...pf.settings.ai, consent: true } })}>Einverstanden, Berater starten</Button>
            <Button onClick={() => { setSettings({ ai: { ...pf.settings.ai, consent: true } }); setWithData(false); }}>Ohne meine Bestandsdaten nutzen</Button>
          </div>
          <p className="mt-4 text-[12px] text-muted">Die Einwilligung lässt sich jederzeit in den <Link href="/einstellungen" className="underline">Einstellungen</Link> widerrufen.</p>
        </div>
      </>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-180px)] max-w-[860px] flex-col lg:min-h-[calc(100dvh-110px)]">
      <div className="rise mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="display text-[28px] sm:text-[34px]">Berater</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setWithData((v) => !v)} aria-pressed={withData}
            title={withData ? `Bestandsdaten werden mitgesendet (ca. ${estimateTokens(context).toLocaleString("de-DE")} Tokens je Frage)` : "Bestandsdaten werden nicht mitgesendet"}
            className={cx("inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition-colors", withData ? "border-accent-line bg-accent-soft" : "border-line text-muted")}>
            <Database size={14} className={withData ? "text-accent" : ""} />
            {withData ? "Mit Bestandsdaten" : "Ohne Bestandsdaten"}
          </button>
          {messages.length > 0 && <IconButton label="Unterhaltung löschen" onClick={() => { abort.current?.abort(); set([]); setNotice(null); }}><Trash2 size={16} /></IconButton>}
        </div>
      </div>

      <div className="flex-1">
        {messages.length === 0 ? (
          <div className="rise rise-1 pt-6">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent"><Sparkles size={22} /></div>
            <h2 className="display text-[24px]">Was möchten Sie wissen?</h2>
            <p className="mb-6 mt-1 max-w-[58ch] text-text-2">Der Berater rechnet mit Ihren echten Zahlen, erklärt Zusammenhänge und entwirft Schreiben. Bei Standortfragen arbeitet er ohne Live-Marktdaten und kennzeichnet Schätzungen.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {prompts.map((p) => (
                <button key={p} onClick={() => void send(p)} className="card px-4 py-3 text-left text-[14px] transition-colors hover:border-accent-line">{p}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5 pb-4">
            {messages.map((m, i) => m.role === "user" ? (
              <div key={i} className="flex justify-end"><div className="max-w-[85%] whitespace-pre-wrap rounded-[16px] rounded-br-[5px] bg-accent-soft px-4 py-2.5">{m.content}</div></div>
            ) : (
              <div key={i} className="card px-5 py-4">
                {m.content ? <Markdown text={m.content} /> : <div className="flex items-center gap-2 text-muted"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" />Denkt nach …</div>}
                {m.content && !(busy && i === messages.length - 1) && (
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
                    <span className="text-[12px] text-muted">KI-generiert. Zahlen und Rechtsfragen vor Entscheidungen prüfen.</span>
                    <ReportButton kind="memo" size="sm" variant="ghost" label="Als PDF" opts={{ title: messages[i - 1]?.content.slice(0, 120) ?? "Auswertung", body: m.content }} />
                  </div>
                )}
              </div>
            ))}
            <div ref={end} />
          </div>
        )}
      </div>

      <div className="sticky bottom-[72px] z-10 mt-4 lg:bottom-4">
        {notice && (
          <div role="status" className={cx("mb-2 flex items-start gap-3 rounded-[12px] border px-4 py-3 text-[13px]", notice.kind === "limit" ? "border-line bg-warn-soft" : "border-line bg-bad-soft")}>
            <TriangleAlert size={16} className={cx("mt-0.5 shrink-0", notice.kind === "limit" ? "text-warn" : "text-bad")} />
            <span>
              {notice.kind === "limit" && (notice.scope === "tag"
                ? <>Das Tageskontingent des kostenlosen Groq-Zugangs ist aufgebraucht. Der Berater steht in etwa {Math.ceil(wait / 60)} Minuten wieder bereit; alle anderen Funktionen laufen unverändert weiter.</>
                : <>Kurze Pause: Das Anfragelimit pro Minute ist erreicht. Weiter in <strong className="tnum">{wait} s</strong>. Ihre Frage bleibt im Eingabefeld erhalten.</>)}
              {notice.kind === "setup" && <>Der Berater ist noch nicht eingerichtet: Auf dem Server fehlt die Umgebungsvariable <code>GROQ_API_KEY</code>. Ein kostenloser Schlüssel lässt sich unter console.groq.com erstellen. Alle Berechnungen und Berichte funktionieren ohne ihn.</>}
              {notice.kind === "error" && notice.text}
            </span>
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="card flex items-end gap-2 p-2 shadow-[var(--shadow-pop)]">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
            rows={1}
            placeholder="Frage zu Ihrem Bestand …"
            aria-label="Frage an den Berater"
            className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-3 py-2 outline-none placeholder:text-muted"
          />
          {busy
            ? <Button type="button" onClick={() => abort.current?.abort()} icon={<Square size={13} fill="currentColor" />}>Stopp</Button>
            : <Button variant="primary" disabled={!input.trim() || wait > 0} aria-label="Senden" className="w-10 !px-0"><ArrowUp size={18} /></Button>}
        </form>
        <div className="mt-1.5 flex justify-between px-1 text-[11px] text-muted">
          <span>{quota.model ? `Modell ${quota.model}` : "Groq · kostenloser Zugang mit Tageslimit"}</span>
          <span>{quota.requests ? `${quota.requests} Anfragen heute übrig` : ""}</span>
        </div>
      </div>
    </div>
  );
}
