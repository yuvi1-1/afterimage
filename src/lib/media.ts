
export type ImageResult = {
  name: string;
  full: HTMLCanvasElement;
  crop: HTMLCanvasElement; // the detected cover, or the full image
  found: boolean;
  confidence: number;
  box: { x: number; y: number; w: number; h: number };
  transparent: boolean; // has real alpha: good as an emblem
};

export const isImage = (f: File) => f.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(f.name);
export const isVideo = (f: File) => f.type.startsWith("video/") || /\.(mp4|mov|webm|m4v|mkv)$/i.test(f.name);
export const isAudio = (f: File) => f.type.startsWith("audio/") || /\.(mp3|wav|flac|aac|m4a|ogg|opus|aiff?)$/i.test(f.name);

export function loadImage(src: string | Blob): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = typeof src === "string" ? src : URL.createObjectURL(src);
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("That image couldn't be read."));
    img.src = url;
  });
}

const toCanvas = (src: CanvasImageSource, w: number, h: number, sx = 0, sy = 0, sw = w, sh = h, max = 2048) => {
  const s = Math.min(1, max / Math.max(sw, sh));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw * s));
  c.height = Math.max(1, Math.round(sh * s));
  c.getContext("2d")!.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
};

function alphaShare(c: HTMLCanvasElement) {
  const t = toCanvas(c, c.width, c.height, 0, 0, c.width, c.height, 96);
  const d = t.getContext("2d")!.getImageData(0, 0, t.width, t.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 200) n++;
  return n / (d.length / 4);
}

type Box = { x: number; y: number; w: number; h: number };

/** Cover detection runs in a worker so the visuals never stutter. */
function detectInWorker(c: HTMLCanvasElement): Promise<{ found: boolean; confidence: number; box: Box }> {
  return new Promise((res) => {
    const fail = { found: false, confidence: 0, box: { x: 0, y: 0, w: 1, h: 1 } };
    let w: Worker;
    try { w = new Worker(new URL("./detect.worker.ts", import.meta.url), { type: "module" }); } catch { return res(fail); }
    const t = setTimeout(() => { w.terminate(); res(fail); }, 20000);
    w.onmessage = (e) => { clearTimeout(t); w.terminate(); res(e.data); };
    w.onerror = () => { clearTimeout(t); w.terminate(); res(fail); };
    createImageBitmap(c).then((bm) => w.postMessage(bm, [bm])).catch(() => { clearTimeout(t); w.terminate(); res(fail); });
  });
}

/** Analyse a dropped picture: find an album cover in a screenshot, and notice transparent logos. */
export async function analyseImage(src: CanvasImageSource & { width: number; height: number }, name: string, detect = true): Promise<ImageResult> {
  const W = (src as HTMLImageElement).naturalWidth || src.width, H = (src as HTMLImageElement).naturalHeight || src.height;
  const full = toCanvas(src, W, H, 0, 0, W, H, 4096);
  const transparent = alphaShare(full) > 0.06;
  let found = false, confidence = 0, box: Box = { x: 0, y: 0, w: 1, h: 1 };
  if (detect && !transparent && Math.abs(W / H - 1) > 0.04) {
    const r = await detectInWorker(full);
    if (r.found) { found = true; confidence = r.confidence; box = r.box; }
  }
  const crop = found ? toCanvas(full, full.width, full.height, box.x * full.width, box.y * full.height, box.w * full.width, box.h * full.height) : toCanvas(full, full.width, full.height);
  return { name, full, crop, found, confidence, box, transparent };
}

export function cropTo(r: ImageResult, box: { x: number; y: number; w: number; h: number }): HTMLCanvasElement {
  const f = r.full;
  return toCanvas(f, f.width, f.height, box.x * f.width, box.y * f.height, box.w * f.width, box.h * f.height);
}

/** Peaks for the track scrubber. */
export async function waveformPeaks(file: Blob, n = 600): Promise<Float32Array | null> {
  try {
    const buf = await file.arrayBuffer();
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const audio = await ctx.decodeAudioData(buf);
    const ch = audio.getChannelData(0), step = Math.max(1, Math.floor(ch.length / n));
    const out = new Float32Array(n);
    let mx = 0;
    for (let i = 0; i < n; i++) {
      let p = 0;
      for (let j = i * step; j < Math.min(ch.length, (i + 1) * step); j += 8) p = Math.max(p, Math.abs(ch[j]));
      out[i] = p; mx = Math.max(mx, p);
    }
    if (mx > 0) for (let i = 0; i < n; i++) out[i] /= mx;
    return out;
  } catch {
    return null;
  }
}
