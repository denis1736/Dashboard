/**
 * Domänenmodell. Alle Geldbeträge in Euro (number), alle Daten als ISO-String
 * "YYYY-MM-DD", Monate als "YYYY-MM". Zinssätze und Quoten als Prozentwerte
 * (3.5 = 3,5 %), damit Formulare und Rechenkern dieselbe Einheit sprechen.
 */

export type ID = string;
export type ISODate = string;

export type PropertyType = "ETW" | "MFH" | "EFH" | "WGH" | "GEW" | "STP";

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  ETW: "Eigentumswohnung",
  MFH: "Mehrfamilienhaus",
  EFH: "Einfamilienhaus",
  WGH: "Wohn- und Geschäftshaus",
  GEW: "Gewerbe",
  STP: "Stellplatz / Garage",
};

export type UnitStatus = "vermietet" | "leer" | "vermarktung" | "sanierung" | "eigennutzung";

export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  vermietet: "Vermietet",
  leer: "Leerstand",
  vermarktung: "In Vermarktung",
  sanierung: "Sanierung",
  eigennutzung: "Eigennutzung",
};

export type AfaMethod = "linear" | "degressiv" | "individuell";

export interface Property {
  id: ID;
  name: string;
  street: string;
  zip: string;
  city: string;
  type: PropertyType;
  yearBuilt: number;
  /** Übergang von Nutzen und Lasten: Beginn von AfA und Mieteinnahmen. */
  purchaseDate: ISODate;
  /** Notarieller Kaufvertrag: maßgeblich für die Spekulationsfrist (§ 23 EStG). */
  notaryDate: ISODate;
  purchasePrice: number;
  closingCosts: { grunderwerbsteuer: number; notar: number; makler: number; sonstige: number };
  /** Anschaffungsnahe Herstellungskosten und Renovierung zum Kauf. */
  initialCapex: number;
  /** Anteil Grund und Boden am Kaufpreis in Prozent (nicht abschreibbar). */
  landSharePct: number;
  afa: { method: AfaMethod; ratePct: number };
  valuation: { mode: "index" | "manuell"; manualValue?: number; manualDate?: ISODate };
  /** Laufende Bewirtschaftungskosten pro Jahr. */
  costs: {
    verwaltung: number;
    instandhaltung: number;
    sonstige: number;
    /** Auf Mieter umlagefähige Betriebskosten (BetrKV); bei Leerstand trägt sie der Eigentümer. */
    umlagefaehig: number;
  };
  notes?: string;
}

export interface Unit {
  id: ID;
  propertyId: ID;
  name: string;
  area: number;
  rooms: number;
  status: UnitStatus;
  /** Erzielbare Nettokaltmiete pro Monat (Marktmiete), Basis für Soll und Leerstandskosten. */
  marketRent: number;
  /** Beginn des aktuellen Leerstands, falls nicht vermietet. */
  vacantSince?: ISODate;
}

export type RentType = "standard" | "staffel" | "index";

export interface Lease {
  id: ID;
  unitId: ID;
  tenantName: string;
  tenantEmail?: string;
  tenantPhone?: string;
  start: ISODate;
  end?: ISODate;
  /** Nettokaltmiete pro Monat bei Vertragsbeginn bzw. nach der letzten Anpassung. */
  coldRent: number;
  /** Monatliche Betriebskostenvorauszahlung. */
  prepayment: number;
  deposit: number;
  rentType: RentType;
  /** Staffelmiete: künftige und vergangene Stufen. */
  steps: { date: ISODate; coldRent: number }[];
  /** Datum der letzten Mieterhöhung (§ 558 BGB bzw. Indexanpassung). */
  lastIncrease?: ISODate;
}

export type LoanType = "annuitaet" | "endfaellig" | "variabel";

export const LOAN_TYPE_LABEL: Record<LoanType, string> = {
  annuitaet: "Annuitätendarlehen",
  endfaellig: "Endfällig / tilgungsfrei",
  variabel: "Variabel verzinst",
};

export interface Loan {
  id: ID;
  propertyId: ID;
  lender: string;
  label: string;
  type: LoanType;
  principal: number;
  /** Auszahlung; die erste Rate fällt im Folgemonat an. */
  startDate: ISODate;
  interestPct: number;
  /** Anfängliche Tilgung in Prozent p. a. (bei Annuität). */
  repaymentPct: number;
  /** Feste Monatsrate; überschreibt die Berechnung aus Zins und Tilgung. */
  monthlyPayment?: number;
  /** Ende der Sollzinsbindung. */
  fixedUntil: ISODate;
  /** Angenommener Zins nach Ende der Zinsbindung (Prozent). Leer = unverändert. */
  followUpPct?: number;
  specialRepayments: { date: ISODate; amount: number }[];
  /** Zinsänderungen bei variablen Darlehen. */
  rateChanges: { date: ISODate; interestPct: number }[];
}

export type ExpenseCategory =
  | "reparatur"
  | "modernisierung"
  | "verwaltung"
  | "versicherung"
  | "grundsteuer"
  | "betriebskosten"
  | "finanzierung"
  | "sonstiges";

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  reparatur: "Reparatur / Erhaltung",
  modernisierung: "Modernisierung (Capex)",
  verwaltung: "Verwaltung",
  versicherung: "Versicherung",
  grundsteuer: "Grundsteuer",
  betriebskosten: "Betriebskosten",
  finanzierung: "Finanzierungskosten",
  sonstiges: "Sonstiges",
};

/** Einmalige Ausgabe außerhalb der laufenden Bewirtschaftungskosten. */
export interface Expense {
  id: ID;
  propertyId: ID;
  date: ISODate;
  category: ExpenseCategory;
  amount: number;
  /** Sofort abziehbare Werbungskosten (Erhaltungsaufwand) statt Aktivierung. */
  deductible: boolean;
  note: string;
}

/** Zahlungseingang zu einem Mietvertrag für einen Monat. */
export interface Payment {
  id: ID;
  leaseId: ID;
  month: string;
  amount: number;
  paidAt: ISODate;
}

export type ReminderKind =
  | "zinsbindung"
  | "spekulation"
  | "staffel"
  | "mieterhoehung"
  | "vertragsende"
  | "wartung"
  | "versicherung"
  | "abrechnung"
  | "sonstiges";

export interface Reminder {
  id: ID;
  propertyId?: ID;
  title: string;
  date: ISODate;
  kind: ReminderKind;
  /** Wiederholung in Monaten; 0 = einmalig. */
  repeatMonths: number;
  done: boolean;
  note?: string;
}

/** Umlageschlüssel einer Betriebskostenposition. */
export type AllocationKey = "flaeche" | "einheiten" | "personen" | "verbrauch" | "direkt";

export const ALLOCATION_LABEL: Record<AllocationKey, string> = {
  flaeche: "Wohnfläche",
  einheiten: "Wohneinheiten",
  personen: "Personen",
  verbrauch: "Verbrauch",
  direkt: "Direkte Zuordnung",
};

/** Betriebskostenarten nach § 2 BetrKV. */
export const BETRKV: { key: string; nr: string; label: string }[] = [
  { key: "grundsteuer", nr: "1", label: "Grundsteuer" },
  { key: "wasser", nr: "2", label: "Wasserversorgung" },
  { key: "entwaesserung", nr: "3", label: "Entwässerung" },
  { key: "heizung", nr: "4", label: "Heizung" },
  { key: "warmwasser", nr: "5", label: "Warmwasser" },
  { key: "aufzug", nr: "7", label: "Aufzug" },
  { key: "muell", nr: "8", label: "Straßenreinigung und Müllbeseitigung" },
  { key: "reinigung", nr: "9", label: "Gebäudereinigung und Ungezieferbekämpfung" },
  { key: "garten", nr: "10", label: "Gartenpflege" },
  { key: "beleuchtung", nr: "11", label: "Beleuchtung (Allgemeinstrom)" },
  { key: "schornstein", nr: "12", label: "Schornsteinreinigung" },
  { key: "versicherung", nr: "13", label: "Sach- und Haftpflichtversicherung" },
  { key: "hauswart", nr: "14", label: "Hauswart" },
  { key: "antenne", nr: "15", label: "Gemeinschaftsantenne / Breitband (nur Betrieb)" },
  { key: "waesche", nr: "16", label: "Einrichtungen für die Wäschepflege" },
  { key: "sonstige", nr: "17", label: "Sonstige Betriebskosten (nur soweit vereinbart)" },
];

export interface CostItem {
  id: ID;
  category: string;
  /** Freie Ergänzung, z. B. der Dienstleister. */
  label: string;
  /** Gesamtkosten des Objekts im Abrechnungsjahr. */
  amount: number;
  key: AllocationKey;
  /** Werte je Einheit für Personen, Verbrauch oder direkte Zuordnung (Einheit -> Wert). */
  shares: Record<ID, number>;
  /** Darin enthaltene Arbeitskosten für haushaltsnahe Dienstleistungen (§ 35a EStG). */
  labor35a: number;
}

/** Betriebskostenabrechnung eines Objekts für ein Kalenderjahr. */
export interface Billing {
  id: ID;
  propertyId: ID;
  year: number;
  items: CostItem[];
  /** Tatsächlich geleistete Vorauszahlungen je Mietvertrag; fehlt der Eintrag, gilt das vertragliche Soll. */
  prepaid: Record<ID, number>;
  /** Vorauszahlung im Schreiben an den Abrechnungsbetrag anpassen (§ 560 Abs. 4 BGB). */
  adjustPrepayment: boolean;
  /** Tag der Zustellung; damit gilt die Abrechnungsfrist als gewahrt. */
  issuedAt?: ISODate;
}

/** Absender für Schreiben und Abrechnungen. */
export interface Sender {
  name: string;
  street: string;
  zipCity: string;
  email: string;
  phone: string;
  iban: string;
  bank: string;
}

export type AccentKey = "gold" | "champagner" | "bronze" | "smaragd" | "saphir";
export type WidgetKey = "kennzahlen" | "vermoegen" | "cashflow" | "fristen" | "hinweise" | "objekte" | "zinsbindung";

export interface Settings {
  ownerName: string;
  theme: "system" | "hell" | "dunkel";
  accent: AccentKey;
  density: "komfortabel" | "kompakt";
  /** Persönlicher Grenzsteuersatz inkl. Soli und ggf. Kirchensteuer, in Prozent. */
  taxRatePct: number;
  widgets: WidgetKey[];
  ai: { consent: boolean; includeTenantNames: boolean };
  /** Überschriebene Indexwerte (Jahr -> Index, 2015 = 100). */
  indexOverrides: Record<string, number>;
  sender: Sender;
  onboarded: boolean;
}

export interface Portfolio {
  version: 1;
  properties: Property[];
  units: Unit[];
  leases: Lease[];
  loans: Loan[];
  expenses: Expense[];
  payments: Payment[];
  reminders: Reminder[];
  billings: Billing[];
  settings: Settings;
}

export const DEFAULT_WIDGETS: WidgetKey[] = [
  "kennzahlen",
  "vermoegen",
  "cashflow",
  "hinweise",
  "fristen",
  "zinsbindung",
  "objekte",
];

export const DEFAULT_SETTINGS: Settings = {
  ownerName: "",
  theme: "system",
  accent: "gold",
  density: "komfortabel",
  taxRatePct: 42,
  widgets: DEFAULT_WIDGETS,
  ai: { consent: false, includeTenantNames: false },
  indexOverrides: {},
  sender: { name: "", street: "", zipCity: "", email: "", phone: "", iban: "", bank: "" },
  onboarded: false,
};

export const EMPTY_PORTFOLIO: Portfolio = {
  version: 1,
  properties: [],
  units: [],
  leases: [],
  loans: [],
  expenses: [],
  payments: [],
  reminders: [],
  billings: [],
  settings: DEFAULT_SETTINGS,
};
