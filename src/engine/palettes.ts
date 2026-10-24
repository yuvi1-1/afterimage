/** 24 palettes, five slots each: background, shadow, mid, accent, glow. */
export type Palette = { id: string; name: string; group: string; c: [string, string, string, string, string] };

export const PALETTES: Palette[] = [
  // Classic
  { id: "midnight", name: "Midnight", group: "Classic", c: ["#05060d", "#141a3a", "#3550a8", "#9db4ff", "#f2f5ff"] },
  { id: "furnace", name: "Furnace", group: "Classic", c: ["#060202", "#3b0b07", "#b3260f", "#ff8a24", "#fff0c4"] },
  { id: "frost", name: "Frost", group: "Classic", c: ["#020609", "#0d2a40", "#2f86b8", "#a8e6ff", "#ffffff"] },
  { id: "gold", name: "Gold", group: "Classic", c: ["#040404", "#1b1428", "#6b481c", "#e6a93b", "#fff3d1"] },
  { id: "lichen", name: "Lichen", group: "Classic", c: ["#030604", "#11291a", "#3c7a3f", "#a6d36b", "#f3ffd9"] },
  { id: "lamp", name: "Lamp", group: "Classic", c: ["#070402", "#2d1606", "#a0520c", "#ffb347", "#fff4dc"] },
  { id: "silver", name: "Silver", group: "Classic", c: ["#060607", "#26282e", "#80858f", "#d9dde4", "#ffffff"] },
  // Bold
  { id: "ultramarine", name: "Ultramarine", group: "Bold", c: ["#02030c", "#0b1460", "#1f3fe0", "#5fb0ff", "#e8f6ff"] },
  { id: "lagoon", name: "Lagoon", group: "Bold", c: ["#010807", "#043c3a", "#0b9b8c", "#5ef2c9", "#effff9"] },
  { id: "synth", name: "Synth", group: "Bold", c: ["#07000f", "#3c0a7a", "#e0218a", "#21e3d6", "#f6ffef"] },
  { id: "rust", name: "Rust", group: "Bold", c: ["#050202", "#2c0f08", "#8e3518", "#e6773a", "#ffe2c2"] },
  { id: "borealis", name: "Borealis", group: "Bold", c: ["#01040a", "#06324a", "#13a37a", "#9cff7a", "#f2fff0"] },
  { id: "plush", name: "Plush", group: "Bold", c: ["#060108", "#2e0630", "#8a1458", "#f04d8c", "#ffe0f0"] },
  { id: "toxic", name: "Toxic", group: "Bold", c: ["#000000", "#123d1b", "#79d11e", "#f3ff4a", "#ffffff"] },
  { id: "tube", name: "Tube", group: "Bold", c: ["#020005", "#1d0257", "#ff1fa8", "#ffe066", "#ffffff"] },
  { id: "haze", name: "Haze", group: "Bold", c: ["#0a0614", "#3b2b6b", "#c26ad1", "#ffb5a7", "#fff6ec"] },
  // Earth
  { id: "mesa", name: "Mesa", group: "Earth", c: ["#080403", "#3a1b10", "#a5502b", "#e3a26a", "#fbe9d2"] },
  { id: "clay", name: "Clay", group: "Earth", c: ["#0a0706", "#3e2a22", "#9a6b55", "#d8b7a0", "#f7eee6"] },
  { id: "olive", name: "Olive", group: "Earth", c: ["#060705", "#272c1f", "#6a7350", "#b6bd94", "#f1f2e6"] },
  { id: "peat", name: "Peat", group: "Earth", c: ["#060403", "#24180f", "#5f4127", "#a98153", "#efe1c7"] },
  // Spectrum
  { id: "spectrum", name: "Spectrum", group: "Spectrum", c: ["#000000", "#3b00ff", "#00e5ff", "#ffe600", "#ff2d55"] },
  { id: "fair", name: "Fair", group: "Spectrum", c: ["#05020a", "#ff2e63", "#ffb700", "#08d9d6", "#ffffff"] },
  { id: "sweets", name: "Sweets", group: "Spectrum", c: ["#140a1a", "#ff8fab", "#ffd6a5", "#9bf6ff", "#fdffb6"] },
  { id: "isle", name: "Isle", group: "Spectrum", c: ["#021014", "#00a6a6", "#f6d743", "#ff7b54", "#fff8e7"] },
];

export const hexToRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Five-slot palette from an image: album art in, matching visuals out.
 *  Clusters the picture in Oklab (perceptual), then fills the slots the way a designer would:
 *  background (its darkest real colour, deepened), shadow, mid (its main colour), accent (its most vivid
 *  colour that actually matters), glow (its lightest colour, lifted toward white). */
export function paletteFromImage(src: CanvasImageSource, w: number, h: number): [string, string, string, string, string] {
  const s = Math.min(1, 72 / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.imageSmoothingQuality = "high";
  x.drawImage(src, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  const px: Lab[] = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 32) px.push(toOklab(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255));
  if (px.length < 5) return PALETTES[0].c;
  return paletteFromLab(px);
}

type Lab = [number, number, number];

export function paletteFromLab(px: Lab[]): [string, string, string, string, string] {
  // k-means++ with deterministic farthest-point seeding
  const K = Math.min(8, px.length);
  const dist = (a: Lab, b: Lab) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const cents: Lab[] = [];
  let mean: Lab = [0, 0, 0];
  for (const p of px) { mean[0] += p[0]; mean[1] += p[1]; mean[2] += p[2]; }
  mean = [mean[0] / px.length, mean[1] / px.length, mean[2] / px.length];
  let best = px[0], bd = -1;
  for (const p of px) { const dd = dist(p, mean); if (dd > bd) { bd = dd; best = p; } }
  cents.push(best.slice() as Lab);
  const near = px.map((p) => dist(p, cents[0]));
  while (cents.length < K) {
    let bi = 0, bv = -1;
    for (let i = 0; i < px.length; i++) if (near[i] > bv) { bv = near[i]; bi = i; }
    if (bv <= 1e-6) break;
    cents.push(px[bi].slice() as Lab);
    for (let i = 0; i < px.length; i++) near[i] = Math.min(near[i], dist(px[i], cents[cents.length - 1]));
  }
  const n = cents.length, counts = new Array(n).fill(0);
  for (let it = 0; it < 12; it++) {
    const sums = Array.from({ length: n }, () => [0, 0, 0]);
    counts.fill(0);
    for (const p of px) {
      let bi = 0, bdd = 9;
      for (let k = 0; k < n; k++) { const dd = dist(p, cents[k]); if (dd < bdd) { bdd = dd; bi = k; } }
      sums[bi][0] += p[0]; sums[bi][1] += p[1]; sums[bi][2] += p[2]; counts[bi]++;
    }
    for (let k = 0; k < n; k++) if (counts[k]) cents[k] = [sums[k][0] / counts[k], sums[k][1] / counts[k], sums[k][2] / counts[k]];
  }
  const total = px.length;
  type Cl = { c: Lab; share: number; L: number; C: number };
  let cl: Cl[] = cents.map((c, k) => ({ c, share: counts[k] / total, L: c[0], C: Math.hypot(c[1], c[2]) })).filter((o) => o.share > 0);
  // merge near-identical clusters so one colour can't take two slots
  cl.sort((a, b) => b.share - a.share);
  const merged: Cl[] = [];
  for (const o of cl) {
    const m = merged.find((q) => Math.sqrt(dist(q.c, o.c)) < 0.045);
    if (m) m.share += o.share; else merged.push({ ...o });
  }
  cl = merged;
  const real = cl.filter((o) => o.share >= 0.025);
  const pool = real.length >= 2 ? real : cl;
  const byL = pool.slice().sort((a, b) => a.L - b.L);
  const darkest = byL[0];
  // glow comes from the lightest colour, even a small one (white type on a cover counts)
  const brightest = cl.filter((o) => o.share >= 0.004).sort((a, b) => b.L - a.L)[0];
  const lightest = brightest && brightest.L > 0.85 ? brightest : byL[byL.length - 1];
  const whiteGlow = lightest.L > 0.85;
  const hue = (o: Cl) => Math.atan2(o.c[2], o.c[1]);
  const hueGap = (x: Cl, y: Cl) => { const d = Math.abs(hue(x) - hue(y)) % (2 * Math.PI); return Math.min(d, 2 * Math.PI - d); };
  // mid: the cover's main colour (largest area that isn't near black or its white)
  const mainPool = pool.filter((o) => o.L > 0.2 && !(whiteGlow && o === lightest));
  const mainScore = (o: Cl) => o.share * (0.3 + Math.min(o.C / 0.1, 1) * 0.7);
  const mid = (mainPool.length ? mainPool : pool).slice().sort((x, y) => mainScore(y) - mainScore(x))[0];
  // accent: vivid, present, and a different colour from the main one
  const score = (o: Cl) => o.C * Math.sqrt(o.share) * (0.4 + Math.min(o.L, 0.85)) * (o.C > 0.03 && mid.C > 0.03 ? 0.35 + hueGap(o, mid) / Math.PI : 0.6);
  const accentPool = pool.filter((o) => o !== mid && Math.sqrt(dist(o.c, mid.c)) > 0.06 && !(whiteGlow && o === lightest) && o.L > 0.12);
  const accent = accentPool.length ? accentPool.slice().sort((x, y) => score(y) - score(x))[0] : mid;
  // shadow: a real darker colour between the background and the mid, else a blend
  const shadowCand = pool.filter((o) => o !== mid && o !== accent && o !== lightest && o.share >= 0.08 && o.L > darkest.L + 0.04 && o.L < Math.max(mid.L, accent.L)).sort((a, b) => b.share - a.share)[0];
  const lerp = (a: Lab, b: Lab, t: number): Lab => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  // background: the darkest colour's hue, deepened so the visuals have depth
  const bgL = Math.min(darkest.L * 0.55, 0.14);
  const bgK = darkest.L > 0 ? Math.min(1, bgL / Math.max(darkest.L, 1e-3)) : 0;
  const bg: Lab = [bgL, darkest.c[1] * bgK * 0.9, darkest.c[2] * bgK * 0.9];
  let shadow: Lab = shadowCand ? shadowCand.c : lerp(bg, mid.c, 0.42);
  if (shadow[0] > 0.5) shadow = [shadow[0] * 0.6, shadow[1] * 0.85, shadow[2] * 0.85];
  // glow: the lightest colour lifted toward white, keeping a hint of its tint
  const gl = lightest.c;
  const glow: Lab = [Math.max(gl[0], 0.93), gl[1] * 0.45, gl[2] * 0.45];
  // keep the middle of the ramp ordered dark to light so gradients stay smooth
  let m1 = mid.c, m2 = accent.c;
  if (m1[0] > m2[0] + 0.08) [m1, m2] = [m2, m1];
  if (shadow[0] > m1[0]) shadow = lerp(bg, m1, 0.45);
  return [bg, shadow, m1, m2, glow].map(labHex) as [string, string, string, string, string];
}

function toOklab(r: number, g: number, b: number): Lab {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  r = lin(r); g = lin(g); b = lin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

function labHex([L, a, b]: Lab): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  const enc = (v: number) => { v = Math.max(0, Math.min(1, v)); return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055; };
  return "#" + rgb.map((v) => Math.round(enc(v) * 255).toString(16).padStart(2, "0")).join("");
}
