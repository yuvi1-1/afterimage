/**
 * Reads the title, artist, album, lyrics and embedded cover art from audio files:
 * ID3v2 (MP3), MP4/M4A atoms, and FLAC metadata blocks. Pure parsing, nothing leaves the device.
 */
export type TrackTags = { title?: string; artist?: string; album?: string; lyrics?: string; picture?: Blob };

const dec = (bytes: Uint8Array, enc: "latin1" | "utf-8" | "utf-16" | "utf-16be") => {
  try { return new TextDecoder(enc).decode(bytes).replace(/\0+$/, "").trim(); } catch { return ""; }
};

// ------------------------------------------------------------------ ID3v2
function id3(b: Uint8Array): TrackTags | null {
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return null;
  const ver = b[3], flags = b[5];
  const size = (b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9];
  let tag = b.subarray(10, Math.min(b.length, 10 + size));
  if (flags & 0x80 && ver < 4) { // whole-tag unsynchronisation (v2.3)
    const out: number[] = [];
    for (let i = 0; i < tag.length; i++) { out.push(tag[i]); if (tag[i] === 0xff && tag[i + 1] === 0) i++; }
    tag = Uint8Array.from(out);
  }
  let pos = 0;
  if (flags & 0x40) { // extended header
    const ext = ver === 4 ? (tag[0] << 21) | (tag[1] << 14) | (tag[2] << 7) | tag[3] : ((tag[0] << 24) | (tag[1] << 16) | (tag[2] << 8) | tag[3]) + 4;
    pos = ext;
  }
  const out: TrackTags = {};
  const textEnc = (e: number) => (e === 0 ? "latin1" : e === 1 ? "utf-16" : e === 2 ? "utf-16be" : "utf-8") as "latin1" | "utf-16" | "utf-16be" | "utf-8";
  // terminator search respecting 1- or 2-byte encodings
  const term = (d: Uint8Array, from: number, e: number) => {
    if (e === 1 || e === 2) { for (let i = from; i + 1 < d.length; i += 2) if (d[i] === 0 && d[i + 1] === 0) return i; return d.length; }
    const i = d.indexOf(0, from); return i < 0 ? d.length : i;
  };
  while (pos + 10 <= tag.length) {
    const id = String.fromCharCode(tag[pos], tag[pos + 1], tag[pos + 2], tag[pos + 3]);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const fs = ver === 4 ? (tag[pos + 4] << 21) | (tag[pos + 5] << 14) | (tag[pos + 6] << 7) | tag[pos + 7] : (tag[pos + 4] << 24) | (tag[pos + 5] << 16) | (tag[pos + 6] << 8) | tag[pos + 7];
    const d = tag.subarray(pos + 10, pos + 10 + fs);
    pos += 10 + fs;
    if (fs <= 0 || !d.length) continue;
    const e = d[0];
    if (id === "TIT2") out.title = dec(d.subarray(1), textEnc(e));
    else if (id === "TPE1") out.artist = dec(d.subarray(1), textEnc(e)).split("\0")[0];
    else if (id === "TALB") out.album = dec(d.subarray(1), textEnc(e));
    else if (id === "USLT") { // enc, lang(3), descriptor, text
      const dEnd = term(d, 4, e), start = dEnd + (e === 1 || e === 2 ? 2 : 1);
      out.lyrics = dec(d.subarray(start), textEnc(e));
    } else if (id === "APIC" && !out.picture) { // enc, mime\0, type, desc\0, data
      const mEnd = d.indexOf(0, 1);
      const mime = dec(d.subarray(1, mEnd), "latin1") || "image/jpeg";
      const type = d[mEnd + 1];
      const dEnd = term(d, mEnd + 2, e);
      const data = d.subarray(dEnd + (e === 1 || e === 2 ? 2 : 1));
      if (data.length > 100 && (type === 3 || type === 0 || !out.picture)) out.picture = new Blob([data.slice()], { type: mime.includes("/") ? mime : `image/${mime.toLowerCase()}` });
    }
  }
  return out;
}

// ------------------------------------------------------------------ MP4 / M4A
function mp4(b: Uint8Array): TrackTags | null {
  if (b.length < 12 || String.fromCharCode(b[4], b[5], b[6], b[7]) !== "ftyp") return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: TrackTags = {};
  const walk = (start: number, end: number, depth: number) => {
    let p = start;
    while (p + 8 <= end && depth < 8) {
      let size = dv.getUint32(p);
      const type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
      let hdr = 8;
      if (size === 1) { size = Number(dv.getBigUint64(p + 8)); hdr = 16; }
      if (size === 0) size = end - p;
      if (size < hdr || p + size > end) break;
      const body = p + hdr;
      if (type === "moov" || type === "udta" || type === "ilst") walk(body, p + size, depth + 1);
      else if (type === "meta") walk(body + 4, p + size, depth + 1); // full box
      else if (["©nam", "©ART", "©alb", "©lyr", "covr", "aART"].includes(type)) {
        // child 'data' atom: size(4) 'data'(4) type(4) locale(4) payload
        if (body + 16 <= p + size && String.fromCharCode(b[body + 4], b[body + 5], b[body + 6], b[body + 7]) === "data") {
          const dsize = dv.getUint32(body), dtype = dv.getUint32(body + 8) & 0xffffff;
          const payload = b.subarray(body + 16, body + dsize);
          if (type === "covr") { if (!out.picture) out.picture = new Blob([payload.slice()], { type: dtype === 14 ? "image/png" : "image/jpeg" }); }
          else {
            const s = dec(payload, "utf-8");
            if (type === "©nam") out.title = s; else if (type === "©ART") out.artist = s; else if (type === "aART") out.artist ||= s; else if (type === "©alb") out.album = s; else out.lyrics = s;
          }
        }
      }
      p += size;
    }
  };
  walk(0, b.length, 0);
  return out;
}

// ------------------------------------------------------------------ FLAC
function flac(b: Uint8Array): TrackTags | null {
  if (b.length < 8 || String.fromCharCode(b[0], b[1], b[2], b[3]) !== "fLaC") return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: TrackTags = {};
  let p = 4;
  for (let guard = 0; guard < 128 && p + 4 <= b.length; guard++) {
    const last = b[p] & 0x80, type = b[p] & 0x7f, len = (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3];
    const s = p + 4;
    if (type === 4) { // vorbis comments, little-endian
      let q = s; const vlen = dv.getUint32(q, true); q += 4 + vlen;
      const n = dv.getUint32(q, true); q += 4;
      for (let i = 0; i < n && q + 4 <= s + len; i++) {
        const l = dv.getUint32(q, true); q += 4;
        const kv = dec(b.subarray(q, q + l), "utf-8"); q += l;
        const eq = kv.indexOf("="); if (eq < 0) continue;
        const k = kv.slice(0, eq).toUpperCase(), v = kv.slice(eq + 1);
        if (k === "TITLE") out.title = v; else if (k === "ARTIST") out.artist ||= v; else if (k === "ALBUM") out.album = v; else if (k === "LYRICS" || k === "UNSYNCEDLYRICS") out.lyrics = v;
      }
    } else if (type === 6 && !out.picture) { // picture
      let q = s; const ptype = dv.getUint32(q); q += 4;
      const ml = dv.getUint32(q); q += 4; const mime = dec(b.subarray(q, q + ml), "latin1"); q += ml;
      const dl = dv.getUint32(q); q += 4 + dl + 16;
      const datal = dv.getUint32(q); q += 4;
      if (ptype === 3 || !out.picture) out.picture = new Blob([b.slice(q, q + datal)], { type: mime || "image/jpeg" });
    }
    p = s + len;
    if (last) break;
  }
  return out;
}

export async function readTags(file: Blob): Promise<TrackTags> {
  try {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const isMp4 = String.fromCharCode(head[4], head[5], head[6], head[7]) === "ftyp";
    // ID3/FLAC tags sit at the start; MP4 metadata can be anywhere, so read the whole (song-sized) file
    const bytes = new Uint8Array(await (isMp4 ? file : file.slice(0, 16 * 1024 * 1024)).arrayBuffer());
    const t = id3(bytes) ?? mp4(bytes) ?? flac(bytes) ?? {};
    for (const k of ["title", "artist", "album", "lyrics"] as const) if (!t[k]) delete t[k];
    return t;
  } catch {
    return {};
  }
}

// ------------------------------------------------------------------ LRC (synced lyrics)
export type LyricLine = { t: number; text: string };

export function parseLrc(src: string): LyricLine[] {
  let offset = 0;
  const lines: LyricLine[] = [];
  for (const raw of src.split(/\r?\n/)) {
    const off = raw.match(/^\[offset:\s*([+-]?\d+)\]/i);
    if (off) { offset = +off[1] / 1000; continue; }
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, "").replace(/<\d+:\d+(?:\.\d+)?>/g, "").trim();
    for (const m of stamps) lines.push({ t: +m[1] * 60 + parseFloat(m[2].replace(":", ".")), text });
  }
  lines.sort((a, b) => a.t - b.t);
  return lines.map((l) => ({ t: Math.max(0, l.t - offset), text: l.text }));
}

/** Index of the line being sung at time t (or -1 before the first). */
export function lyricAt(lines: LyricLine[], t: number): number {
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (lines[m].t <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}
