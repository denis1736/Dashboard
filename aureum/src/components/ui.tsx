"use client";

import { Dialog as RD, Switch as RSwitch } from "radix-ui";
import { X } from "lucide-react";
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(" ");

/* ───────────── Schaltflächen ───────────── */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  icon?: ReactNode;
};

export function Button({ variant = "secondary", size = "md", icon, className, children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-medium transition-[background,border-color,transform,opacity] duration-150 active:scale-[0.98] disabled:opacity-45",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4",
        variant === "primary" && "bg-accent text-accent-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] hover:bg-accent-strong",
        variant === "secondary" && "border border-line-strong bg-surface hover:border-muted hover:bg-surface-2",
        variant === "ghost" && "text-text-2 hover:bg-surface-3 hover:text-text",
        variant === "danger" && "border border-line-strong text-bad hover:bg-bad-soft",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-text-2 transition-colors hover:bg-surface-3 hover:text-text disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ───────────── Flächen ───────────── */

export function Card({
  title, eyebrow, action, children, className, pad = true,
}: { title?: ReactNode; eyebrow?: string; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx("card min-w-0", className)}>
      {(title || action || eyebrow) && (
        <header className="flex min-h-[56px] items-center justify-between gap-3 px-5 pt-4 pb-1">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
            {title && <h2 className="truncate text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
        </header>
      )}
      <div className={pad ? "px-5 pb-5 pt-2" : ""}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="rise mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <h1 className="display text-[28px] sm:text-[34px]">{title}</h1>
        {sub && <p className="mt-1.5 max-w-[68ch] text-text-2">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** Kennzahlenkachel: Beschriftung, Wert, optionale Einordnung. */
export function Stat({
  label, value, hint, tone, className,
}: { label: string; value: ReactNode; hint?: ReactNode; tone?: "good" | "bad" | "accent"; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <div className="truncate text-[12px] text-muted">{label}</div>
      <div
        className={cx(
          "mt-1 truncate text-[22px] font-semibold tracking-[-0.02em]",
          tone === "good" && "text-good",
          tone === "bad" && "text-bad",
          tone === "accent" && "text-accent",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 truncate text-[12px] text-text-2">{hint}</div>}
    </div>
  );
}

export type Tone = "neutral" | "good" | "bad" | "warn" | "info" | "accent";

export function Badge({ tone = "neutral", children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  const tones: Record<Tone, string> = {
    neutral: "bg-surface-3 text-text-2",
    good: "bg-good-soft text-good",
    bad: "bg-bad-soft text-bad",
    warn: "bg-warn-soft text-warn",
    info: "bg-info-soft text-info",
    accent: "bg-accent-soft text-accent",
  };
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12px] font-medium", tones[tone])}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  value, onChange, options, label,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-[11px] border border-line bg-surface-2 p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            "h-8 whitespace-nowrap rounded-[8px] px-3 text-[13px] font-medium transition-colors",
            o.value === value ? "bg-surface text-text shadow-[0_1px_2px_rgba(0,0,0,0.12),0_0_0_1px_var(--line)]" : "text-text-2 hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon, title, text, children }: { icon?: ReactNode; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">{icon}</div>}
      <div className="text-[15px] font-semibold">{title}</div>
      {text && <p className="mt-1 max-w-[44ch] text-text-2">{text}</p>}
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

/** Fortschritts- oder Auslastungsbalken; die Spur ist eine hellere Stufe derselben Farbe. */
export function Meter({ value, max = 100, tone = "accent", label }: { value: number; max?: number; tone?: "accent" | "good" | "warn" | "bad"; label: string }) {
  const p = Math.max(0, Math.min(100, (value / max) * 100));
  const color = { accent: "var(--accent)", good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)" }[tone];
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      className="h-1.5 w-full overflow-hidden rounded-full"
      style={{ background: `color-mix(in oklab, ${color} 18%, transparent)` }}
    >
      <div className="h-full origin-left rounded-full" style={{ width: `${p}%`, background: color, animation: "growx .8s var(--ease-out-expo) both" }} />
    </div>
  );
}

/* ───────────── Dialog ───────────── */

/** Zentriert auf dem Desktop, als Bogen von unten auf dem Telefon. */
export function Modal({
  open, onClose, title, description, children, footer, wide,
}: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <RD.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[3px]" style={{ animation: "fade .2s ease both" }} />
        <RD.Content
          aria-describedby={undefined}
          className={cx(
            "fixed z-50 flex max-h-[92dvh] flex-col bg-surface shadow-[var(--shadow-pop)] outline-none",
            "inset-x-0 bottom-0 rounded-t-[22px] max-sm:animate-[sheet_.35s_var(--ease-out-expo)_both]",
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100vw-48px)] sm:rounded-[20px] sm:animate-[pop_.25s_var(--ease-out-expo)_both] sm:[transform:translate(-50%,-50%)]",
            wide ? "sm:max-w-[820px]" : "sm:max-w-[560px]",
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 pb-4 pt-5">
            <div className="min-w-0">
              <RD.Title className="display text-[22px]">{title}</RD.Title>
              {description && <p className="mt-1 text-[13px] text-text-2">{description}</p>}
            </div>
            <RD.Close asChild>
              <IconButton label="Schließen" className="-mr-2 -mt-1"><X size={18} /></IconButton>
            </RD.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4 pb-[max(16px,env(safe-area-inset-bottom))]">{footer}</div>}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

/* ───────────── Formularfelder ───────────── */

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block min-w-0", className)}>
      <span className="mb-1.5 block text-[12px] font-medium text-text-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] leading-snug text-muted">{hint}</span>}
    </label>
  );
}

export function TextInput({ value, onChange, ...rest }: { value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <input {...rest} className="field" value={value} onChange={(e) => onChange(e.target.value)} />;
}

/** Deutsche Zahleneingabe: "1.234,56", "1234,5" und "3.5" (als 3,5) werden verstanden. */
export function parseDE(raw: string): number {
  let s = raw.replace(/[\s€%]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (!/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\.(?=.*\.)/g, "");
  else s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function NumberInput({
  value, onChange, suffix, digits = 0, placeholder,
}: { value: number | undefined; onChange: (v: number) => void; suffix?: string; digits?: number; placeholder?: string }) {
  const fmt = (n: number | undefined) =>
    n === undefined || Number.isNaN(n) ? "" : n.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: Math.max(digits, 2) });
  const [text, setText] = useState(fmt(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);
  return (
    <div className="relative">
      <input
        className={cx("field tnum", suffix && "pr-10")}
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onFocus={(e) => { setFocused(true); e.currentTarget.select(); }}
        onBlur={() => setFocused(false)}
        onChange={(e) => { setText(e.target.value); onChange(parseDE(e.target.value)); }}
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted">{suffix}</span>}
    </div>
  );
}

export function Select<T extends string>({ value, onChange, options, ...rest }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  return (
    <select
      {...rest}
      className="field appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9"
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23857c6a' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-1">
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-[13px] leading-snug text-text-2">{hint}</span>}
      </span>
      <RSwitch.Root
        checked={checked}
        onCheckedChange={onChange}
        className="relative mt-0.5 h-6 w-[42px] shrink-0 rounded-full bg-surface-3 shadow-[inset_0_0_0_1px_var(--line-strong)] transition-colors data-[state=checked]:bg-accent"
      >
        <RSwitch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.35)] transition-transform duration-200 data-[state=checked]:translate-x-[20px]" />
      </RSwitch.Root>
    </label>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[] }) {
  return (
    <div role="tablist" className="-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-line px-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={t.value === value}
          onClick={() => onChange(t.value)}
          className={cx(
            "relative h-11 whitespace-nowrap px-3 text-[14px] font-medium transition-colors",
            t.value === value ? "text-text" : "text-muted hover:text-text-2",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 text-[12px] text-muted">{t.count}</span>}
          {t.value === value && <span className="absolute inset-x-3 -bottom-px h-[2px] rounded-full bg-accent" />}
        </button>
      ))}
    </div>
  );
}

/** Zeile aus Beschriftung und Wert, für Stammdaten und Aufstellungen. */
export function Row({ label, children, strong }: { label: ReactNode; children: ReactNode; strong?: boolean }) {
  return (
    <div className={cx("flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-0", strong && "font-semibold")}>
      <span className={strong ? "" : "text-text-2"}>{label}</span>
      <span className="tnum text-right">{children}</span>
    </div>
  );
}
