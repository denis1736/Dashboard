"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Dialog as RD } from "radix-ui";
import {
  Building2, CalendarClock, ChartNoAxesCombined, FileText, FlaskConical, Landmark, LayoutDashboard, Lock, Moon,
  Ellipsis, Receipt, Search, Settings as SettingsIcon, ShieldCheck, Sparkles, Sun, Wallet, ArrowRight, type LucideIcon,
} from "lucide-react";
import { applyUi, useStore } from "@/lib/store";
import type { AccentKey } from "@/lib/types";
import { Button, cx, Field, TextInput } from "./ui";
import { PropertyForm } from "./forms";

interface NavItem { href: string; label: string; icon: LucideIcon; group: string }

export const NAV: NavItem[] = [
  { href: "/", label: "Übersicht", icon: LayoutDashboard, group: "Bestand" },
  { href: "/objekte", label: "Objekte", icon: Building2, group: "Bestand" },
  { href: "/mieten", label: "Mieteingänge", icon: Wallet, group: "Bestand" },
  { href: "/fristen", label: "Fristen", icon: CalendarClock, group: "Bestand" },
  { href: "/finanzierung", label: "Finanzierung", icon: Landmark, group: "Finanzen" },
  { href: "/kennzahlen", label: "Kennzahlen", icon: ChartNoAxesCombined, group: "Finanzen" },
  { href: "/szenarien", label: "Szenarien", icon: FlaskConical, group: "Finanzen" },
  { href: "/steuern", label: "Steuern", icon: Receipt, group: "Finanzen" },
  { href: "/berater", label: "Berater", icon: Sparkles, group: "Werkzeuge" },
  { href: "/berichte", label: "Berichte", icon: FileText, group: "Werkzeuge" },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

/** Giebel und Querbalken: zugleich Dach und der Buchstabe A. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" style={{ fill: "var(--accent-soft)" }} />
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="none" style={{ stroke: "var(--accent-line)" }} />
      <path d="M8.5 23 16 8l7.5 15M11.6 17.5h8.8" fill="none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--accent)" }} />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Mark />
      <span className="display text-[25px] leading-none">Aureum</span>
    </span>
  );
}

function ThemeToggle() {
  const theme = useStore((s) => s.pf.settings.theme);
  const setSettings = useStore((s) => s.setSettings);
  const [dark, setDark] = useState(true);
  useEffect(() => setDark(document.documentElement.dataset.theme === "dark"), [theme]);
  return (
    <button
      onClick={() => setSettings({ theme: dark ? "hell" : "dunkel" })}
      aria-label={dark ? "Helles Farbschema" : "Dunkles Farbschema"}
      title={dark ? "Helles Farbschema" : "Dunkles Farbschema"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-text-2 transition-colors hover:bg-surface-3 hover:text-text"
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

function Sidebar({ onSearch }: { onSearch: () => void }) {
  const path = usePathname();
  const encrypted = useStore((s) => s.encrypted);
  const groups = [...new Set(NAV.map((n) => n.group))];
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-surface/60 px-3 pb-3 pt-5 backdrop-blur-xl lg:flex">
      <Link href="/" className="mb-5 px-2.5"><Wordmark /></Link>
      <button onClick={onSearch} className="mb-4 flex h-9 items-center gap-2.5 rounded-[10px] border border-line bg-surface-2 px-3 text-[13px] text-muted transition-colors hover:border-line-strong hover:text-text-2">
        <Search size={15} />
        <span className="flex-1 text-left">Suchen</span>
        <kbd className="rounded-[5px] border border-line px-1.5 text-[11px] font-medium">⌘K</kbd>
      </button>
      <nav className="flex-1 space-y-5 overflow-y-auto">
        {groups.map((g) => (
          <div key={g}>
            <div className="eyebrow mb-1.5 px-3">{g}</div>
            {NAV.filter((n) => n.group === g).map((n) => {
              const active = isActive(path, n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "group relative flex h-9 items-center gap-3 rounded-[10px] px-3 text-[14px] transition-colors",
                    active ? "bg-accent-soft font-medium text-text" : "text-text-2 hover:bg-surface-3 hover:text-text",
                  )}
                >
                  {active && <span className="absolute -left-3 top-2 h-5 w-[3px] rounded-r-full bg-accent" />}
                  <n.icon size={17} strokeWidth={1.75} className={active ? "text-accent" : "text-muted group-hover:text-text-2"} />
                  {n.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="mt-3 border-t border-line pt-3">
        <div className="flex items-center gap-1">
          <Link
            href="/einstellungen"
            className={cx(
              "flex h-9 flex-1 items-center gap-3 rounded-[10px] px-3 text-[14px] transition-colors",
              isActive(path, "/einstellungen") ? "bg-accent-soft font-medium" : "text-text-2 hover:bg-surface-3 hover:text-text",
            )}
          >
            <SettingsIcon size={17} strokeWidth={1.75} className="text-muted" />
            Einstellungen
          </Link>
          <ThemeToggle />
        </div>
        <div className="mt-2 flex items-center gap-2 px-3 text-[12px] text-muted" title="Ihre Daten verlassen dieses Gerät nicht, außer Sie nutzen den Berater.">
          {encrypted ? <ShieldCheck size={14} className="text-good" /> : <Lock size={13} />}
          {encrypted ? "Lokal · AES-256 verschlüsselt" : "Lokal auf diesem Gerät"}
        </div>
      </div>
    </aside>
  );
}

function MobileBars({ onSearch }: { onSearch: () => void }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  const primary = [NAV[0], NAV[1], NAV[4], NAV[3]];
  useEffect(() => setMore(false), [path]);
  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/80 px-4 backdrop-blur-xl lg:hidden">
        <Link href="/"><Wordmark /></Link>
        <div className="flex items-center">
          <button onClick={onSearch} aria-label="Suchen" className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-text-2"><Search size={18} /></button>
          <ThemeToggle />
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        {primary.map((n) => {
          const active = isActive(path, n.href);
          return (
            <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cx("flex h-[58px] flex-col items-center justify-center gap-1 text-[10.5px] font-medium", active ? "text-accent" : "text-muted")}>
              <n.icon size={20} strokeWidth={active ? 2 : 1.6} />
              {n.label}
            </Link>
          );
        })}
        <button onClick={() => setMore(true)} className="flex h-[58px] flex-col items-center justify-center gap-1 text-[10.5px] font-medium text-muted">
          <Ellipsis size={20} strokeWidth={1.6} />
          Mehr
        </button>
      </nav>
      <RD.Root open={more} onOpenChange={setMore}>
        <RD.Portal>
          <RD.Overlay className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[3px]" style={{ animation: "fade .2s both" }} />
          <RD.Content aria-describedby={undefined} className="fixed inset-x-0 bottom-0 z-50 rounded-t-[22px] bg-surface p-4 pb-[max(20px,env(safe-area-inset-bottom))] shadow-[var(--shadow-pop)] outline-none" style={{ animation: "sheet .35s var(--ease-out-expo) both" }}>
            <RD.Title className="sr-only">Weitere Bereiche</RD.Title>
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line-strong" />
            <div className="grid grid-cols-3 gap-2">
              {[...NAV.filter((n) => !primary.includes(n)), { href: "/einstellungen", label: "Einstellungen", icon: SettingsIcon, group: "" }].map((n) => (
                <Link key={n.href} href={n.href} className={cx("flex flex-col items-center gap-2 rounded-[14px] border border-line px-2 py-4 text-[12px] font-medium", isActive(path, n.href) ? "bg-accent-soft text-text" : "text-text-2")}>
                  <n.icon size={20} strokeWidth={1.6} className="text-accent" />
                  {n.label}
                </Link>
              ))}
            </div>
          </RD.Content>
        </RD.Portal>
      </RD.Root>
    </>
  );
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const properties = useStore((s) => s.pf.properties);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const items = useMemo(() => {
    const all = [
      ...NAV.map((n) => ({ href: n.href, label: n.label, sub: n.group, icon: n.icon })),
      { href: "/einstellungen", label: "Einstellungen", sub: "Darstellung, Sicherheit, Backup", icon: SettingsIcon },
      ...properties.map((p) => ({ href: `/objekte/${p.id}`, label: p.name, sub: `${p.street}, ${p.city}`, icon: Building2 })),
    ];
    const needle = q.trim().toLowerCase();
    return needle ? all.filter((i) => `${i.label} ${i.sub}`.toLowerCase().includes(needle)) : all;
  }, [q, properties]);
  useEffect(() => setSel(0), [q, open]);
  useEffect(() => { if (!open) setQ(""); }, [open]);
  const go = (href: string) => { onClose(); router.push(href); };
  return (
    <RD.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[3px]" style={{ animation: "fade .15s both" }} />
        <RD.Content aria-describedby={undefined} className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-32px)] max-w-[560px] -translate-x-1/2 overflow-hidden rounded-[16px] bg-surface shadow-[var(--shadow-pop)] outline-none" style={{ animation: "fade .15s both" }}>
          <RD.Title className="sr-only">Suchen und springen</RD.Title>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search size={17} className="text-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
                if (e.key === "Enter" && items[sel]) go(items[sel].href);
              }}
              placeholder="Bereich oder Objekt suchen …"
              className="h-[52px] flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
            />
          </div>
          <div className="max-h-[52vh] overflow-y-auto p-2">
            {items.length === 0 && <div className="px-3 py-8 text-center text-text-2">Nichts gefunden.</div>}
            {items.map((i, n) => (
              <button
                key={i.href}
                onClick={() => go(i.href)}
                onPointerMove={() => setSel(n)}
                className={cx("flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left", n === sel && "bg-accent-soft")}
              >
                <i.icon size={17} strokeWidth={1.75} className={n === sel ? "text-accent" : "text-muted"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{i.label}</span>
                  <span className="block truncate text-[12px] text-muted">{i.sub}</span>
                </span>
                {n === sel && <ArrowRight size={15} className="text-accent" />}
              </button>
            ))}
          </div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="animate-pulse"><Wordmark /></div>
    </div>
  );
}

function LockScreen() {
  const unlock = useStore((s) => s.unlock);
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(false);
    const ok = await unlock(pass);
    setBusy(false);
    if (!ok) setError(true);
  };
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <form onSubmit={submit} className="card rise w-full max-w-[400px] p-8">
        <Wordmark />
        <div className="rule-gold my-6" />
        <h1 className="display text-[30px]">Tresor entsperren</h1>
        <p className="mb-5 mt-1.5 text-text-2">Ihr Bestand ist auf diesem Gerät verschlüsselt. Die Passphrase wird nicht gespeichert und kann nicht zurückgesetzt werden.</p>
        <Field label="Passphrase">
          <input type="password" autoFocus autoComplete="current-password" className="field" value={pass} onChange={(e) => setPass(e.target.value)} />
        </Field>
        {error && <p role="alert" className="mt-2 text-[13px] text-bad">Die Passphrase stimmt nicht. Bitte erneut eingeben.</p>}
        <Button variant="primary" className="mt-5 w-full" disabled={busy || !pass}>{busy ? "Entschlüssele …" : "Entsperren"}</Button>
      </form>
    </div>
  );
}

const ACCENTS: { key: AccentKey; label: string; color: string }[] = [
  { key: "gold", label: "Gold", color: "#d6b36c" },
  { key: "champagner", label: "Champagner", color: "#e3d2ac" },
  { key: "bronze", label: "Bronze", color: "#d99a6c" },
  { key: "smaragd", label: "Smaragd", color: "#6fcaa2" },
  { key: "saphir", label: "Saphir", color: "#8fb0ee" },
];

export function AccentPicker() {
  const accent = useStore((s) => s.pf.settings.accent);
  const setSettings = useStore((s) => s.setSettings);
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Akzentfarbe">
      {ACCENTS.map((a) => (
        <button
          key={a.key}
          role="radio"
          aria-checked={accent === a.key}
          onClick={() => setSettings({ accent: a.key })}
          className={cx("inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition-colors", accent === a.key ? "border-accent bg-accent-soft" : "border-line-strong text-text-2 hover:border-muted")}
        >
          <span className="h-3.5 w-3.5 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)]" style={{ background: a.color }} />
          {a.label}
        </button>
      ))}
    </div>
  );
}

function Onboarding() {
  const { setSettings, loadDemo } = useStore();
  const settings = useStore((s) => s.pf.settings);
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [form, setForm] = useState(false);
  const points = [
    ["Vermögen statt Tabellen", "Wert, Restschuld und Eigenkapital jedes Objekts – fortgeschrieben, ohne dass Sie rechnen."],
    ["Cashflow, der stimmt", "Vor und nach Steuern, vor und nach Tilgung, je Objekt und für den gesamten Bestand."],
    ["Fristen im Griff", "Zinsbindung, Spekulationsfrist, Staffeln und Mieterhöhungen melden sich rechtzeitig."],
  ];
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden border-r border-line bg-surface p-14 lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full opacity-60 blur-3xl" style={{ background: "radial-gradient(circle, var(--accent-soft), transparent 65%)" }} />
        <Wordmark />
        <div className="relative">
          <h1 className="display max-w-[14ch] text-[64px]">Ihr Bestand. Auf den Punkt.</h1>
          <div className="rule-gold my-8 w-40" />
          <ul className="space-y-5">
            {points.map(([t, d], i) => (
              <li key={t} className={`rise rise-${i + 1} flex gap-4`}>
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent-line text-[12px] font-semibold text-accent">{i + 1}</span>
                <span><span className="block font-semibold">{t}</span><span className="text-text-2">{d}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative flex items-center gap-2 text-[12px] text-muted"><Lock size={13} /> Ihre Daten bleiben auf diesem Gerät. Kein Konto, kein Tracking.</p>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 lg:hidden"><Wordmark /></div>
          <div className="mb-8 flex gap-1.5">
            {[0, 1].map((i) => <span key={i} className={cx("h-[3px] flex-1 rounded-full transition-colors duration-500", i <= step ? "bg-accent" : "bg-line-strong")} />)}
          </div>
          {step === 0 ? (
            <div key="a" className="rise">
              <h2 className="display text-[36px]">Willkommen.</h2>
              <p className="mb-7 mt-2 text-text-2">Zwei kurze Angaben, dann sehen Sie Ihr Portfolio.</p>
              <Field label="Wie dürfen wir Ihren Bestand nennen?" hint="Erscheint auf Berichten, zum Beispiel Ihr Name oder der Ihrer Gesellschaft.">
                <TextInput value={name} onChange={setName} placeholder="z. B. Familie Berger" autoFocus />
              </Field>
              <div className="mb-2 mt-6 text-[12px] font-medium text-text-2">Akzentfarbe</div>
              <AccentPicker />
              <div className="mb-2 mt-6 text-[12px] font-medium text-text-2">Farbschema</div>
              <div className="flex gap-2">
                {(["system", "hell", "dunkel"] as const).map((t) => (
                  <button key={t} onClick={() => setSettings({ theme: t })} className={cx("h-9 flex-1 rounded-[10px] border text-[13px] font-medium capitalize transition-colors", settings.theme === t ? "border-accent bg-accent-soft" : "border-line-strong text-text-2 hover:border-muted")}>
                    {t === "system" ? "Automatisch" : t}
                  </button>
                ))}
              </div>
              <Button variant="primary" className="mt-8 w-full" onClick={() => { setSettings({ ownerName: name.trim() }); setStep(1); }}>
                Weiter <ArrowRight size={16} />
              </Button>
            </div>
          ) : (
            <div key="b" className="rise">
              <h2 className="display text-[36px]">Womit beginnen?</h2>
              <p className="mb-6 mt-2 text-text-2">Sie können jederzeit wechseln: Das Beispiel lässt sich in den Einstellungen wieder entfernen.</p>
              <button onClick={() => setForm(true)} className="card group mb-3 flex w-full items-center gap-4 p-5 text-left transition-colors hover:border-accent-line">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><Building2 size={20} /></span>
                <span className="flex-1"><span className="block font-semibold">Erstes eigenes Objekt anlegen</span><span className="text-[13px] text-text-2">Kaufdaten, Finanzierung, Mieten: in wenigen Minuten erfasst.</span></span>
                <ArrowRight size={17} className="text-muted transition-transform group-hover:translate-x-1 group-hover:text-accent" />
              </button>
              <button onClick={() => { loadDemo(); setSettings({ ownerName: name.trim() || "Beispielportfolio", onboarded: true }); }} className="card group flex w-full items-center gap-4 p-5 text-left transition-colors hover:border-accent-line">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><Sparkles size={20} /></span>
                <span className="flex-1"><span className="block font-semibold">Beispielportfolio erkunden</span><span className="text-[13px] text-text-2">Fünf Objekte, 17 Einheiten, mit allen typischen Konstellationen.</span></span>
                <ArrowRight size={17} className="text-muted transition-transform group-hover:translate-x-1 group-hover:text-accent" />
              </button>
              <button onClick={() => setStep(0)} className="mt-6 text-[13px] text-muted hover:text-text-2">Zurück</button>
            </div>
          )}
        </div>
      </div>
      <PropertyForm open={form} onClose={() => setForm(false)} onSaved={(id) => { setSettings({ onboarded: true }); router.push(`/objekte/${id}`); }} />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const status = useStore((s) => s.status);
  const init = useStore((s) => s.init);
  const settings = useStore((s) => s.pf.settings);
  const hasData = useStore((s) => s.pf.properties.length > 0);
  const [palette, setPalette] = useState(false);
  const path = usePathname();
  const main = useRef<HTMLElement>(null);

  useEffect(() => { void init(); }, [init]);

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyUi(useStore.getState().pf.settings);
    mq.addEventListener("change", on);
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((v) => !v); }
    };
    window.addEventListener("keydown", key);
    return () => { mq.removeEventListener("change", on); window.removeEventListener("keydown", key); };
  }, []);

  useEffect(() => { window.scrollTo(0, 0); }, [path]);

  if (status === "laden") return <Splash />;
  if (status === "gesperrt") return <LockScreen />;
  if (!settings.onboarded && !hasData) return <Onboarding />;

  return (
    <>
      <a href="#inhalt" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">Zum Inhalt springen</a>
      <Sidebar onSearch={() => setPalette(true)} />
      <MobileBars onSearch={() => setPalette(true)} />
      <main id="inhalt" ref={main} className="lg:pl-[248px]">
        <div key={path} className="mx-auto max-w-[1320px] px-4 pb-28 pt-6 sm:px-8 lg:pb-16 lg:pt-10">{children}</div>
      </main>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </>
  );
}
