"use client";

import { create } from "zustand";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import { deriveKey, isEnvelope, newSalt, open, seal, type Envelope } from "./crypto";
import { demoPortfolio } from "./demo";
import { todayISO } from "./calc/dates";
import {
  DEFAULT_SETTINGS, EMPTY_PORTFOLIO,
  type Billing, type Expense, type Lease, type Loan, type Payment, type Portfolio, type Property, type Reminder, type Settings, type Unit,
} from "./types";

/**
 * Datenhaltung local-first: Der gesamte Bestand liegt als ein Dokument in
 * IndexedDB, optional AES-256-GCM-verschlüsselt. Oberfläche und Rechenkern
 * kennen nur dieses Interface; ein Sync-Backend (siehe supabase/schema.sql)
 * ersetzt später `load` und `persist`, ohne dass sich Aufrufer ändern.
 */

const KEY = "aureum:portfolio";
/** Darstellungseinstellungen zusätzlich unverschlüsselt, damit vor dem Entsperren kein Aufblitzen entsteht. */
const UI_KEY = "aureum:ui";

type Status = "laden" | "gesperrt" | "bereit";
type Collections = {
  properties: Property; units: Unit; leases: Lease; loans: Loan;
  expenses: Expense; payments: Payment; reminders: Reminder; billings: Billing;
};

interface State {
  status: Status;
  pf: Portfolio;
  encrypted: boolean;
  savedAt: number | null;
  init: () => Promise<void>;
  unlock: (passphrase: string) => Promise<boolean>;
  setPassphrase: (passphrase: string | null) => Promise<void>;
  upsert: <K extends keyof Collections>(collection: K, item: Collections[K]) => void;
  remove: <K extends keyof Collections>(collection: K, id: string) => void;
  setSettings: (patch: Partial<Settings>) => void;
  replace: (pf: Portfolio) => void;
  loadDemo: () => void;
  reset: () => Promise<void>;
  exportBackup: (passphrase?: string) => Promise<string>;
  importBackup: (text: string, passphrase?: string) => Promise<void>;
}

let key: CryptoKey | null = null;
let salt: string | null = null;
let pending: Envelope | null = null;

const normalize = (pf: Portfolio): Portfolio => ({
  ...EMPTY_PORTFOLIO,
  ...pf,
  settings: {
    ...DEFAULT_SETTINGS,
    ...pf.settings,
    ai: { ...DEFAULT_SETTINGS.ai, ...pf.settings?.ai },
    sender: { ...DEFAULT_SETTINGS.sender, ...pf.settings?.sender },
  },
});

const mirrorUi = (s: Settings) => {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify({ theme: s.theme, accent: s.accent, density: s.density }));
  } catch {}
  applyUi(s);
};

export function applyUi(s: Pick<Settings, "theme" | "accent" | "density">) {
  if (typeof document === "undefined") return;
  const dark = s.theme === "dunkel" || (s.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  const el = document.documentElement;
  el.dataset.theme = dark ? "dark" : "light";
  el.dataset.accent = s.accent;
  el.dataset.density = s.density;
}

export const useStore = create<State>((set, get) => {
  // Sofort schreiben, damit eine Änderung auch dann erhalten bleibt, wenn die Seite direkt danach
  // geschlossen oder neu geladen wird. Folgen während des Schreibens weitere Änderungen (Tippen),
  // wird danach genau einmal mit dem neuesten Stand nachgeschrieben.
  let writing = false;
  let dirty = false;
  const persist = async () => {
    if (writing) {
      dirty = true;
      return;
    }
    writing = true;
    try {
      do {
        dirty = false;
        await idbSet(KEY, await seal(get().pf, key, salt));
      } while (dirty);
      set({ savedAt: Date.now() });
    } finally {
      writing = false;
    }
  };

  const commit = (pf: Portfolio) => {
    set({ pf });
    mirrorUi(pf.settings);
    void persist();
  };

  return {
    status: "laden",
    pf: EMPTY_PORTFOLIO,
    encrypted: false,
    savedAt: null,

    init: async () => {
      if (get().status !== "laden") return;
      let stored: unknown;
      try {
        stored = await idbGet(KEY);
      } catch {
        stored = undefined;
      }
      if (!isEnvelope(stored)) {
        set({ status: "bereit", pf: EMPTY_PORTFOLIO });
        return;
      }
      if (stored.enc) {
        pending = stored;
        set({ status: "gesperrt", encrypted: true });
        return;
      }
      const pf = normalize(await open<Portfolio>(stored, null));
      set({ status: "bereit", pf });
      mirrorUi(pf.settings);
    },

    unlock: async (passphrase) => {
      if (!pending?.salt) return false;
      try {
        const k = await deriveKey(passphrase, pending.salt);
        const pf = normalize(await open<Portfolio>(pending, k));
        key = k;
        salt = pending.salt;
        pending = null;
        set({ status: "bereit", pf, encrypted: true });
        mirrorUi(pf.settings);
        return true;
      } catch {
        return false;
      }
    },

    setPassphrase: async (passphrase) => {
      if (passphrase) {
        salt = newSalt();
        key = await deriveKey(passphrase, salt);
      } else {
        key = null;
        salt = null;
      }
      set({ encrypted: !!passphrase });
      await idbSet(KEY, await seal(get().pf, key, salt));
      set({ savedAt: Date.now() });
    },

    upsert: (collection, item) => {
      const pf = get().pf;
      const list = pf[collection] as { id: string }[];
      const exists = list.some((x) => x.id === item.id);
      commit({ ...pf, [collection]: exists ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item] });
    },

    // Löschen räumt abhängige Datensätze mit ab, damit keine verwaisten Verträge oder Darlehen bleiben.
    remove: (collection, id) => {
      const pf = get().pf;
      let next: Portfolio = { ...pf, [collection]: (pf[collection] as { id: string }[]).filter((x) => x.id !== id) };
      if (collection === "properties") {
        next = {
          ...next,
          units: next.units.filter((u) => u.propertyId !== id),
          loans: next.loans.filter((l) => l.propertyId !== id),
          expenses: next.expenses.filter((e) => e.propertyId !== id),
          reminders: next.reminders.filter((r) => r.propertyId !== id),
          billings: next.billings.filter((b) => b.propertyId !== id),
        };
      }
      const unitIds = new Set(next.units.map((u) => u.id));
      next = { ...next, leases: next.leases.filter((l) => unitIds.has(l.unitId)) };
      const leaseIds = new Set(next.leases.map((l) => l.id));
      next = { ...next, payments: next.payments.filter((p) => leaseIds.has(p.leaseId)) };
      commit(next);
    },

    setSettings: (patch) => {
      const pf = get().pf;
      commit({ ...pf, settings: { ...pf.settings, ...patch } });
    },

    replace: (pf) => commit(normalize(pf)),

    loadDemo: () => {
      const s = get().pf.settings;
      const demo = demoPortfolio(todayISO());
      commit({ ...demo, settings: { ...demo.settings, theme: s.theme, accent: s.accent, density: s.density, ai: s.ai, sender: s.sender.name ? s.sender : demo.settings.sender } });
    },

    reset: async () => {
      key = null;
      salt = null;
      await idbDel(KEY);
      try {
        localStorage.removeItem(UI_KEY);
      } catch {}
      set({ pf: EMPTY_PORTFOLIO, encrypted: false, status: "bereit" });
      applyUi(DEFAULT_SETTINGS);
    },

    exportBackup: async (passphrase) => {
      if (!passphrase) return JSON.stringify(await seal(get().pf, null, null), null, 2);
      const s = newSalt();
      return JSON.stringify(await seal(get().pf, await deriveKey(passphrase, s), s));
    },

    importBackup: async (text, passphrase) => {
      const env: unknown = JSON.parse(text);
      if (!isEnvelope(env)) throw new Error("Die Datei ist kein Aureum-Backup.");
      let k: CryptoKey | null = null;
      if (env.enc) {
        if (!passphrase || !env.salt) throw new Error("Dieses Backup ist verschlüsselt. Bitte Passphrase angeben.");
        k = await deriveKey(passphrase, env.salt);
      }
      let pf: Portfolio;
      try {
        pf = await open<Portfolio>(env, k);
      } catch {
        throw new Error("Passphrase falsch oder Datei beschädigt.");
      }
      if (!Array.isArray(pf?.properties)) throw new Error("Das Backup enthält keinen gültigen Datenbestand.");
      commit(normalize(pf));
    },
  };
});

/** Stichtag für alle Berechnungen. */
export const useToday = (): string => todayISO();
