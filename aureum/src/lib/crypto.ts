/**
 * Verschlüsselung des lokalen Datenbestands und der Backups.
 * AES-256-GCM, Schlüssel per PBKDF2-HMAC-SHA-256 (600.000 Iterationen) aus der
 * Passphrase abgeleitet. Die Passphrase wird nirgends gespeichert; ohne sie sind
 * die Daten nicht wiederherstellbar.
 */

const ITERATIONS = 600_000;

export interface Envelope {
  v: 1;
  app: "aureum";
  enc: boolean;
  /** Klartext-JSON (enc = false). */
  data?: unknown;
  salt?: string;
  iv?: string;
  ct?: string;
}

const b64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

const unb64 = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export const newSalt = (): string => b64(crypto.getRandomValues(new Uint8Array(16)));

export async function deriveKey(passphrase: string, salt: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: unb64(salt), iterations: ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function seal(data: unknown, key: CryptoKey | null, salt: string | null): Promise<Envelope> {
  if (!key || !salt) return { v: 1, app: "aureum", enc: false, data };
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(data)));
  return { v: 1, app: "aureum", enc: true, salt, iv: b64(iv), ct: b64(ct) };
}

/** Wirft bei falscher Passphrase (GCM-Authentifizierung schlägt fehl). */
export async function open<T>(env: Envelope, key: CryptoKey | null): Promise<T> {
  if (!env.enc) return env.data as T;
  if (!key || !env.iv || !env.ct) throw new Error("Schlüssel fehlt");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(env.iv) }, key, unb64(env.ct));
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

export const isEnvelope = (x: unknown): x is Envelope =>
  typeof x === "object" && x !== null && (x as Envelope).app === "aureum" && (x as Envelope).v === 1;
