import type { Look } from "../engine/params";

/** Looks travel as a compact, URL-safe string in the link's #look= fragment (never sent to a server). */
const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_URL as string | undefined) || "https://yuvi1-1.github.io/afterimage/";

const b64u = (u8: Uint8Array) => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Response(new Blob([data.slice()]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeLook(l: Look): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(l));
  if (typeof CompressionStream !== "undefined") {
    try { return "z" + b64u(await pipe(json, new CompressionStream("deflate-raw"))); } catch { /* fall through */ }
  }
  return "j" + b64u(json);
}

export async function decodeLook(s: string): Promise<Partial<Look> | null> {
  try {
    const raw = unb64u(s.slice(1));
    const bytes = s[0] === "z" ? await pipe(raw, new DecompressionStream("deflate-raw")) : raw;
    const l = JSON.parse(new TextDecoder().decode(bytes));
    return l && typeof l === "object" && typeof l.scene === "string" ? l : null;
  } catch {
    return null;
  }
}

export async function shareLink(l: Look): Promise<string> {
  const base = /^https?:$/.test(location.protocol) ? location.origin + location.pathname : PUBLIC_URL;
  return `${base}#look=${await encodeLook(l)}`;
}

export function lookFromHash(): string | null {
  const m = location.hash.match(/^#look=([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}
