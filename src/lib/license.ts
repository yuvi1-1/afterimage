import nacl from "tweetnacl";

/** Ed25519 public key for license verification. Generate your own with `npm run keygen`. */
export const PUBLIC_KEY = "uLTaW8QVL7fPN2ia-tUREPgOAloh1fv4UHEkMb8BuXA";
/** Where the "Get Pro" button sends people (a Stripe Payment Link, Lemon Squeezy or Gumroad checkout). */
export const BUY_URL = (import.meta.env.VITE_BUY_URL as string | undefined) || "https://buy.stripe.com/";
export const PRICE = (import.meta.env.VITE_PRICE as string | undefined) || "$24";

export type License = { email: string; tier: string; issued: string };

const fromB64u = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

export function verifyLicense(key: string): License | null {
  try {
    const m = key.trim().match(/^AFTR-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
    if (!m) return null;
    const payload = fromB64u(m[1]), sig = fromB64u(m[2]);
    if (!nacl.sign.detached.verify(payload, sig, fromB64u(PUBLIC_KEY))) return null;
    const j = JSON.parse(new TextDecoder().decode(payload));
    return { email: j.e, tier: j.t, issued: j.i };
  } catch {
    return null;
  }
}

const KEY = "afterimage.license";
export function storedLicense(): License | null {
  try { const k = localStorage.getItem(KEY); return k ? verifyLicense(k) : null; } catch { return null; }
}
export function storeLicense(key: string) { try { localStorage.setItem(KEY, key.trim()); } catch { /* ignore */ } }
export function clearLicense() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
