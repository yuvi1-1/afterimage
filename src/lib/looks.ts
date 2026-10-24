import { PALETTES } from "../engine/palettes";
import { DEFAULT_GLOBALS, GLOBALS, type GlobalKey, type Look } from "../engine/params";
import { SCENES, sceneById } from "../scenes";

export const freshLook = (scene = "limitless", palette = "gold"): Look => ({ ...DEFAULT_GLOBALS, scene, palette, modes: {}, sceneValues: {} });

export const cloneLook = (l: Look): Look => JSON.parse(JSON.stringify(l));

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

/** Randomize the look but keep it tasteful: big edits in useful ranges, frame tricks only sometimes. */
export function randomizeLook(l: Look, allowed: (id: string) => boolean): Look {
  const n = cloneLook(l);
  n.react = Math.round(rnd(45, 95));
  n.chaos = Math.round(Math.random() < 0.6 ? rnd(5, 40) : rnd(40, 85));
  n.trails = Math.round(rnd(20, 85));
  n.heat = Math.round(rnd(20, 70));
  n.symmetry = Math.random() < 0.35 ? pick([1, 2, 3, 4, 5, 6, 8]) : 0;
  n.tiles = Math.random() < 0.12 ? pick([2, 3, 4]) : 0;
  n.twist = Math.random() < 0.25 ? Math.round(rnd(-60, 60)) : 0;
  n.slice = Math.random() < 0.12 ? Math.round(rnd(10, 50)) : 0;
  n.spin = n.symmetry > 2 && Math.random() < 0.5 ? Math.round(rnd(-40, 40)) : 0;
  n.lens = Math.random() < 0.3 ? Math.round(rnd(20, 70)) : 0;
  n.lensStyle = Math.floor(Math.random() * 7);
  n.palette = pick(PALETTES).id;
  const sc = sceneById(n.scene);
  if (sc.modes) n.modes[sc.id] = Math.floor(Math.random() * sc.modes.length);
  n.sceneValues[sc.id] = sc.sliders.map((s) => Math.round(Math.max(0, Math.min(100, s.def + rnd(-35, 35)))));
  void allowed;
  return n;
}

export function randomScene(l: Look, allowed: (id: string) => boolean): Look {
  const pool = SCENES.filter((s) => s.id !== l.scene && allowed(s.id));
  const n = cloneLook(l);
  n.scene = pick(pool).id;
  return n;
}

/** Interpolate two looks; discrete values switch at the midpoint. */
export function mixLooks(a: Look, b: Look, t: number): Look {
  const n = cloneLook(t < 0.5 ? a : b);
  for (const d of GLOBALS) {
    const k = d.key as GlobalKey;
    n[k] = d.int ? (t < 0.5 ? a[k] : b[k]) : a[k] + (b[k] - a[k]) * t;
  }
  if (a.scene === b.scene) {
    const av = a.sceneValues[a.scene], bv = b.sceneValues[b.scene];
    if (av && bv) n.sceneValues[a.scene] = av.map((v, i) => v + ((bv[i] ?? v) - v) * t);
  }
  return n;
}

// ------------------------------------------------------------------ presets
export type Preset = { name: string; look: Look; at: number };
const KEY = "afterimage.presets.v1";

export function loadPresets(): Record<number, Preset> {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
export function savePresets(p: Record<number, Preset>) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage full or blocked */ }
}

/** Starter looks so the preset bank is never empty. */
export const FACTORY: Preset[] = [
  { name: "Gilded tunnel", look: { ...freshLook("descent", "gold"), modes: { descent: 2 }, trails: 45, heat: 55 }, at: 0 },
  { name: "Cold ink", look: { ...freshLook("ink", "frost"), chaos: 35, trails: 70 }, at: 0 },
  { name: "Bloom", look: { ...freshLook("anemone", "plush"), symmetry: 0, heat: 60 }, at: 0 },
  { name: "Relic", look: { ...freshLook("relic", "silver"), trails: 30 }, at: 0 },
  { name: "Mirror hall", look: { ...freshLook("mandala", "synth"), symmetry: 6, spin: 20 }, at: 0 },
  { name: "Chladni", look: { ...freshLook("sand", "lamp"), heat: 30 }, at: 0 },
  { name: "Ridge line", look: { ...freshLook("ridge", "tube") }, at: 0 },
  { name: "Lab meters", look: { ...freshLook("signal", "lagoon"), trails: 20 }, at: 0 },
];
