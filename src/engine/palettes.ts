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

/** Five-slot palette from an image (k-means on a small thumbnail), sorted dark to light. */
export function paletteFromImage(src: CanvasImageSource, w: number, h: number): [string, string, string, string, string] {
  const s = Math.min(1, 48 / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.drawImage(src, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  const px: number[][] = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 32) px.push([d[i] / 255, d[i + 1] / 255, d[i + 2] / 255]);
  if (px.length < 5) return PALETTES[0].c;
  const L = (p: number[]) => p[0] * 0.299 + p[1] * 0.587 + p[2] * 0.114;
  px.sort((a, b) => L(a) - L(b));
  const K = 6;
  let cents = Array.from({ length: K }, (_, i) => px[Math.floor(((i + 0.5) / K) * px.length)].slice());
  const counts = new Array(K).fill(0);
  for (let it = 0; it < 8; it++) {
    const sums = Array.from({ length: K }, () => [0, 0, 0]);
    counts.fill(0);
    for (const p of px) {
      let bi = 0, bd = 9;
      for (let k = 0; k < K; k++) {
        const q = cents[k], dd = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
        if (dd < bd) { bd = dd; bi = k; }
      }
      sums[bi][0] += p[0]; sums[bi][1] += p[1]; sums[bi][2] += p[2]; counts[bi]++;
    }
    cents = cents.map((q, k) => (counts[k] ? sums[k].map((v) => v / counts[k]) : q));
  }
  const order = cents.map((q, k) => ({ q, n: counts[k] })).filter((o) => o.n).sort((a, b) => L(a.q) - L(b.q));
  const hex = (q: number[]) => "#" + q.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
  const dark = order[0].q.map((v) => v * 0.2);
  const light = order[order.length - 1].q.map((v) => v * 0.55 + 0.45);
  const mids = order.slice(1, -1);
  while (mids.length < 3) mids.push(order[Math.min(order.length - 1, mids.length)]);
  return [hex(dark), hex(mids[0].q), hex(mids[Math.floor(mids.length / 2)].q), hex(mids[mids.length - 1].q), hex(light)];
}
