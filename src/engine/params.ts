/** Global controls (shared by every scene). Values are stored in UI units. */
export type Def = { key: GlobalKey; label: string; def: number; min: number; max: number; int?: boolean; group: "big" | "frame" | "lens" | "drift" | "input"; hint: string };

export type GlobalKey =
  | "react" | "chaos" | "trails" | "heat" | "brightness" | "decay" | "gain"
  | "symmetry" | "tiles" | "twist" | "slice" | "lens" | "lensStyle" | "spin" | "hueDrift" | "vignette";

export const GLOBALS: Def[] = [
  { key: "react", label: "react", def: 70, min: 0, max: 100, group: "big", hint: "How hard the music drives the picture" },
  { key: "chaos", label: "chaos", def: 25, min: 0, max: 100, group: "big", hint: "Turbulence, feedback tunnels and tearing" },
  { key: "trails", label: "trails", def: 55, min: 0, max: 100, group: "big", hint: "How long each frame lingers" },
  { key: "heat", label: "heat", def: 40, min: 0, max: 100, group: "big", hint: "Bloom and flash" },
  { key: "brightness", label: "brightness", def: 50, min: 0, max: 100, group: "big", hint: "Exposure on top of auto exposure" },
  { key: "decay", label: "decay", def: 50, min: 0, max: 100, group: "input", hint: "How long a hit holds. Lower for fast music" },
  { key: "gain", label: "input gain", def: 50, min: 0, max: 100, group: "input", hint: "Calibrate quiet or loud sources. Center is unity" },
  { key: "symmetry", label: "symmetry", def: 0, min: 0, max: 12, int: true, group: "frame", hint: "1 mirror, 2 quad, 3+ radial" },
  { key: "tiles", label: "tiles", def: 0, min: 0, max: 8, int: true, group: "frame", hint: "Wallpaper repeat" },
  { key: "twist", label: "twist", def: 0, min: -100, max: 100, group: "frame", hint: "Radial vortex. Either side of center is a direction" },
  { key: "slice", label: "slice", def: 0, min: 0, max: 100, group: "frame", hint: "Shift horizontal bands" },
  { key: "spin", label: "spin", def: 0, min: -100, max: 100, group: "frame", hint: "Slow rotation (with symmetry on)" },
  { key: "lens", label: "lens", def: 0, min: 0, max: 100, group: "lens", hint: "Strength of the optical material" },
  { key: "lensStyle", label: "lens style", def: 0, min: 0, max: 6, int: true, group: "lens", hint: "" },
  { key: "hueDrift", label: "hue drift", def: 0, min: 0, max: 100, group: "drift", hint: "Slowly walks the colors" },
  { key: "vignette", label: "vignette", def: 25, min: 0, max: 100, group: "drift", hint: "Darkens the edges" },
];

export const LENS_STYLES = ["glass ribs", "glass fan", "anamorphic", "melt", "glitch", "pixels", "fly eye"];

export type Look = Record<GlobalKey, number> & {
  scene: string;
  palette: string; // palette id, or "photo" for colors taken from the dropped image
  modes: Record<string, number>;
  sceneValues: Record<string, number[]>;
};

export const DEFAULT_GLOBALS = Object.fromEntries(GLOBALS.map((d) => [d.key, d.def])) as Record<GlobalKey, number>;
