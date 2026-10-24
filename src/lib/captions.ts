import type { Engine } from "../engine/engine";
import { lyricAt, type LyricLine } from "./tags";

/** Title cards and synced lyrics, drawn to a transparent canvas that the engine lays over the visuals. */
export type TitleMode = "off" | "corner" | "center" | "lower";
export type CaptionFont = "grotesk" | "serif" | "mono" | "condensed";
export type CaptionState = {
  title: string;
  artist: string;
  titleMode: TitleMode;
  titleShow: "always" | "intro";
  font: CaptionFont;
  lyricsOn: boolean;
  lyricPos: "bottom" | "center";
  lyricOffset: number; // seconds, + shows lines later
  tint: boolean;
  pulse: number; // 0..1, how much text breathes on kicks
};

export const DEFAULT_CAPTIONS: CaptionState = {
  title: "", artist: "", titleMode: "off", titleShow: "intro", font: "grotesk",
  lyricsOn: true, lyricPos: "bottom", lyricOffset: 0, tint: false, pulse: 0.4,
};

const FONTS: Record<CaptionFont, (px: number, bold?: boolean) => string> = {
  grotesk: (px, b = true) => `${b ? 700 : 500} ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`,
  serif: (px, b = true) => `italic ${b ? 600 : 400} ${px}px Georgia, "Times New Roman", serif`,
  mono: (px, b = true) => `${b ? 700 : 400} ${px}px Menlo, Consolas, "Courier New", monospace`,
  condensed: (px, b = true) => `${b ? 800 : 600} ${px}px "Arial Narrow", "Helvetica Neue", Impact, sans-serif`,
};

const INTRO = 9; // seconds a title card stays up in "intro" mode
const FADE = 1.2;

export class Captions {
  canvas = document.createElement("canvas");
  private key = "";

  /**
   * Redraw if what should be on screen changed, then hand the canvas to the engine.
   * t is the track position in seconds (or seconds since the source started).
   */
  update(engine: Engine, st: CaptionState, lyrics: LyricLine[], t: number) {
    const w = engine.width, h = engine.height;
    const titleOn = st.titleMode !== "off" && !!(st.title || st.artist);
    let titleA = titleOn ? 1 : 0;
    if (titleOn && st.titleShow === "intro") titleA = t < INTRO ? Math.min(1, t / 0.6) : Math.max(0, 1 - (t - INTRO) / FADE);
    const li = st.lyricsOn && lyrics.length ? lyricAt(lyrics, t - st.lyricOffset) : -1;
    const line = li >= 0 ? lyrics[li].text : "";
    const since = li >= 0 ? t - st.lyricOffset - lyrics[li].t : 0;
    const lineA = line ? Math.min(1, since / 0.25) : 0;
    const q = (v: number) => Math.round(v * 12) / 12; // quantise fades so we redraw a handful of times, not every frame
    engine.caption.pulse = st.pulse;
    engine.caption.tint = st.tint ? 1 : 0;
    if (!titleA && !line) { if (engine.caption.on) engine.setCaption(null); this.key = ""; return; }
    const key = JSON.stringify([w, h, st.title, st.artist, st.titleMode, st.font, st.lyricPos, q(titleA), li, line, q(lineA)]);
    if (key === this.key && engine.caption.on) return;
    this.key = key;
    this.draw(w, h, st, q(titleA), line, q(lineA), li >= 0 && li + 1 < lyrics.length ? lyrics[li + 1].text : "");
    engine.setCaption(this.canvas);
  }

  private draw(w: number, h: number, st: CaptionState, titleA: number, line: string, lineA: number, next: string) {
    const c = this.canvas;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const x = c.getContext("2d")!;
    x.clearRect(0, 0, w, h);
    const s = Math.min(w, h), F = FONTS[st.font], upper = st.font === "condensed";
    x.fillStyle = "#fff";
    x.shadowColor = "rgba(0,0,0,.55)";
    x.shadowBlur = s * 0.018;
    x.shadowOffsetY = s * 0.004;
    const wrap = (text: string, max: number) => {
      const words = text.split(/\s+/), out: string[] = [];
      let cur = "";
      for (const wd of words) { const t = cur ? `${cur} ${wd}` : wd; if (x.measureText(t).width > max && cur) { out.push(cur); cur = wd; } else cur = t; }
      if (cur) out.push(cur);
      return out.slice(0, 3);
    };
    const T = upper ? st.title.toUpperCase() : st.title;
    const A = st.artist.toUpperCase();
    // ---- title card
    if (titleA > 0) {
      x.globalAlpha = titleA;
      const m = s * 0.06;
      if (st.titleMode === "center") {
        x.textAlign = "center"; x.textBaseline = "middle";
        x.font = F(s * 0.085);
        const lines = wrap(T, w * 0.82), lh = s * 0.095;
        const y0 = h * 0.5 - ((lines.length - 1) * lh) / 2 - (A ? s * 0.03 : 0);
        lines.forEach((l, i) => x.fillText(l, w / 2, y0 + i * lh));
        if (A) { x.font = F(s * 0.03, false); spaced(x, A, w / 2, y0 + lines.length * lh - lh * 0.25, s * 0.006, "center"); }
      } else if (st.titleMode === "lower") {
        x.textAlign = "left"; x.textBaseline = "alphabetic";
        const bx = m, by = h - m * 1.4;
        x.globalAlpha = titleA * 0.9;
        x.fillRect(bx, by - s * 0.085, s * 0.006, s * 0.1);
        x.globalAlpha = titleA;
        x.font = F(s * 0.05); x.fillText(T, bx + s * 0.022, by - s * 0.035);
        if (A) { x.font = F(s * 0.024, false); spaced(x, A, bx + s * 0.022, by + s * 0.005, s * 0.005, "left"); }
      } else { // corner
        x.textAlign = "left"; x.textBaseline = "alphabetic";
        if (A) { x.font = F(s * 0.022, false); spaced(x, A, m, h - m - s * 0.05, s * 0.005, "left"); }
        x.font = F(s * 0.042); x.fillText(T, m, h - m);
      }
    }
    // ---- lyrics
    if (line && lineA > 0) {
      x.globalAlpha = lineA;
      x.textAlign = "center";
      const center = st.lyricPos === "center";
      x.font = F(s * (center ? 0.07 : 0.05));
      const L = upper ? line.toUpperCase() : line;
      const lines = wrap(L, w * 0.84), lh = s * (center ? 0.082 : 0.06);
      const base = center ? h * 0.5 - ((lines.length - 1) * lh) / 2 : h * (st.titleMode === "corner" || st.titleMode === "lower" ? 0.72 : 0.8) - (lines.length - 1) * lh;
      const rise = (1 - lineA) * s * 0.02;
      x.textBaseline = "middle";
      lines.forEach((l, i) => x.fillText(l, w / 2, base + i * lh + rise));
      if (next && !center) {
        x.globalAlpha = lineA * 0.35;
        x.font = F(s * 0.032, false);
        x.fillText(upper ? next.toUpperCase() : next, w / 2, base + lines.length * lh + s * 0.01);
      }
    }
    x.globalAlpha = 1;
  }
}

/** Letter-spaced text (canvas letterSpacing is not everywhere yet). */
function spaced(x: CanvasRenderingContext2D, text: string, cx: number, y: number, gap: number, align: "left" | "center") {
  const chars = [...text];
  const widths = chars.map((ch) => x.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
  let px = align === "center" ? cx - total / 2 : cx;
  const prev = x.textAlign;
  x.textAlign = "left";
  chars.forEach((ch, i) => { x.fillText(ch, px, y); px += widths[i] + gap; });
  x.textAlign = prev;
}

const KEY = "afterimage.captions.v1";
export function loadCaptionPrefs(): CaptionState {
  try { return { ...DEFAULT_CAPTIONS, ...JSON.parse(localStorage.getItem(KEY) || "{}"), title: "", artist: "" }; } catch { return { ...DEFAULT_CAPTIONS }; }
}
export function saveCaptionPrefs(s: CaptionState) {
  try { const { title: _t, artist: _a, ...rest } = s; void _t; void _a; localStorage.setItem(KEY, JSON.stringify(rest)); } catch { /* ignore */ }
}
