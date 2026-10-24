import type { Emblem } from "../engine/engine";
import type { CaptionState } from "../lib/captions";
import { GLOBALS, LENS_STYLES, MOD_SOURCES, type Def, type Look, type Mod } from "../engine/params";
import type { AutoMode } from "../lib/autopilot";
import type { Scene } from "../scenes/types";
import { Icon } from "./Icons";
import { Slider, Toggle } from "./Slider";

export type LearnState = { on: boolean; learning: string | null; tag: (t: string) => string | null; pick: (t: string) => void };

type Props = {
  open: boolean;
  look: Look;
  scene: Scene;
  values: number[];
  set: (target: string, v: number) => void;
  grab: (target: string, down: boolean) => void;
  setMode: (m: number) => void;
  learn: LearnState;
  automated: (t: string) => boolean;
  emblem: Emblem | null;
  setEmblem: (e: Partial<Emblem>) => void;
  removeEmblem: () => void;
  onClose: () => void;
  onRandom: () => void;
  onResetScene: () => void;
  armed: boolean;
  setArmed: (v: boolean) => void;
  hasTrack: boolean;
  clearLanes: () => void;
  laneCount: number;
  midiOn: boolean;
  toggleLearn: () => void;
  quality: { value: number; set: (q: number) => void };
  follow: { on: boolean; set: (v: boolean) => void; np: { app?: string; title?: string; artist?: string } | null } | null;
  cursor: { mode: number; amount: number; set: (c: Partial<{ mode: number; amount: number }>) => void };
  mod: { on: boolean; toggle: () => void; selected: string | null; select: (t: string) => void; set: (t: string, m: Mod | null) => void };
  auto: { mode: AutoMode; setMode: (m: AutoMode) => void; bars: number; setBars: (b: number) => void; bpm: number; locked: boolean; tap: () => void; unlock: () => void };
  text: { st: CaptionState; set: (p: Partial<CaptionState>) => void; lyricCount: number; onLyrics: () => void; clearLyrics: () => void };
};

export function Panel(p: Props) {
  const { look, scene, learn } = p;
  // scene sliders are modulated per scene, so their modulation key carries the scene id
  const modKey = (t: string) => (t.startsWith("s:") ? `${t}@${scene.id}` : t);
  const modOf = (t: string) => look.mods?.[modKey(t)];
  const ctl = (t: string) => {
    const m = modOf(t);
    const tag = [learn.tag(t), m && m.amt ? `~${m.src}` : null].filter(Boolean).join(" ") || null;
    return {
      learn: (learn.on ? (learn.learning === t ? "learning" : "armed") : p.mod.on ? (p.mod.selected === modKey(t) ? "learning" : "armed") : "off") as "off" | "armed" | "learning",
      onLearn: () => (learn.on ? learn.pick(t) : p.mod.select(modKey(t))),
      midiTag: tag,
      automated: p.automated(t),
      onGrab: (d: boolean) => p.grab(t, d),
    };
  };
  const selMod = p.mod.selected ? look.mods?.[p.mod.selected] : undefined;
  const selLabel = p.mod.selected ? (p.mod.selected.startsWith("g:") ? GLOBALS.find((d) => `g:${d.key}` === p.mod.selected)?.label : scene.sliders[+p.mod.selected.slice(2).split("@")[0]]?.label) : null;
  const g = (d: Def, extra: { big?: boolean; format?: (v: number) => string } = {}) => (
    <Slider key={d.key} label={d.label} value={look[d.key]} min={d.min} max={d.max} def={d.def} int={d.int} hint={d.hint} onChange={(v) => p.set(`g:${d.key}`, v)} {...ctl(`g:${d.key}`)} {...extra} />
  );
  const by = (grp: Def["group"]) => GLOBALS.filter((d) => d.group === grp);
  const symFmt = (v: number) => (v === 0 ? "off" : v === 1 ? "mirror" : v === 2 ? "quad" : `${v}×`);
  return (
    <aside className={`panel glass ui${p.open ? "" : " closed"}`} onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel-head">
        <h3>Tuning</h3>
        <button className="btn ghost" onClick={p.onRandom} data-tip="Randomize look (L)"><Icon.dice /></button>
        <button className="btn ghost" onClick={p.mod.toggle} data-tip="Audio modulation (Q)" style={p.mod.on ? { color: "var(--accent)" } : undefined}><Icon.wave /></button>
        <button className={`btn ghost${learn.on ? " on" : ""}`} onClick={p.toggleLearn} data-tip="MIDI learn (M)" style={learn.on ? { color: "var(--accent)" } : undefined}><Icon.knob /></button>
        <button className="btn ghost" onClick={p.onClose} data-tip="Close (E)"><Icon.x /></button>
      </div>
      <div className="panel-body">
        {learn.on && <div className="hint" style={{ color: "var(--accent)" }}>MIDI learn: click a control, then move a knob or fader on your controller. Press M when done.</div>}
        {p.mod.on && (
          <div className="sec" style={{ borderTop: 0 }}>
            <div className="sec-h"><span style={{ color: "var(--accent)" }}>Modulation{selLabel ? ` · ${selLabel}` : ""}</span>{p.mod.selected && selMod && <button onClick={() => p.mod.set(p.mod.selected!, null)}>remove</button>}</div>
            {!p.mod.selected ? (
              <div className="hint">Click any control below, then pick what moves it. The control rides the music on top of where you set it.</div>
            ) : (
              <>
                <div className="seg">
                  {MOD_SOURCES.map((src) => (
                    <button key={src} className={selMod?.src === src ? "on" : ""} onClick={() => p.mod.set(p.mod.selected!, { src, amt: selMod?.amt || 0.3 })}>{src}</button>
                  ))}
                </div>
                <Slider label="amount" value={(selMod?.amt ?? 0) * 100} min={-100} max={100} def={0} format={(v) => `${v > 0 ? "+" : ""}${Math.round(v)}%`} onChange={(v) => p.mod.set(p.mod.selected!, { src: selMod?.src ?? "bass", amt: v / 100 })} />
              </>
            )}
          </div>
        )}
        <div className="sec">
          <div className="sec-h"><span>Autopilot</span><span className="num" style={{ textTransform: "none", letterSpacing: 0 }}>{Math.round(p.auto.bpm)} bpm{p.auto.locked ? " · locked" : ""}</span></div>
          <div className="seg">
            {(["off", "drift", "show"] as const).map((m) => (
              <button key={m} className={p.auto.mode === m ? "on" : ""} onClick={() => p.auto.setMode(m)}>{m}</button>
            ))}
            <span style={{ flex: 1 }} />
            <button onClick={p.auto.tap} title="Tap along with the beat (.)">tap</button>
            {p.auto.locked && <button onClick={p.auto.unlock} title="Back to automatic tempo (,)">auto</button>}
          </div>
          {p.auto.mode !== "off" && (
            <div className="seg">
              {[4, 8, 16].map((b) => (
                <button key={b} className={p.auto.bars === b ? "on" : ""} onClick={() => p.auto.setBars(b)}>every {b} bars</button>
              ))}
            </div>
          )}
          <div className="hint">{p.auto.mode === "drift" ? "Drift nudges colors, modes and the look every phrase, and goes big on drops." : p.auto.mode === "show" ? "Show changes scene on every phrase and hits hard on drops. Built for live sets." : "Let Afterimage change looks on phrases and drops by itself (A)."}</div>
        </div>
        <div className="sec">
          {by("big").map((d) => g(d, { big: true }))}
        </div>

        <div className="sec">
          <div className="sec-h"><span>{scene.name}</span><button onClick={p.onResetScene}>reset</button></div>
          {scene.modes && (
            <div className="seg">
              {scene.modes.map((m, i) => (
                <button key={m} className={(look.modes[scene.id] ?? 0) === i ? "on" : ""} onClick={() => p.setMode(i)}>{m}</button>
              ))}
            </div>
          )}
          {scene.sliders.map((s, i) => (
            <Slider key={scene.id + i} label={s.label} value={p.values[i]} def={s.def} onChange={(v) => p.set(`s:${i}`, v)} {...ctl(`s:${i}`)} />
          ))}
        </div>

        <div className="sec">
          <div className="sec-h"><span>Frame</span></div>
          {by("frame").map((d) => g(d, d.key === "symmetry" ? { format: symFmt } : d.key === "tiles" ? { format: (v) => (v ? `${v}×` : "off") } : {}))}
        </div>

        <div className="sec">
          <div className="sec-h"><span>Lens</span></div>
          <div className="seg">
            {LENS_STYLES.map((s, i) => (
              <button key={s} className={Math.round(look.lensStyle) === i ? "on" : ""} onClick={() => p.set("g:lensStyle", i)}>{s}</button>
            ))}
          </div>
          {g(GLOBALS.find((d) => d.key === "lens")!)}
        </div>

        <div className="sec">
          <div className="sec-h"><span>Cursor</span></div>
          <div className="seg">
            {["off", "flow", "swirl", "ripple", "light"].map((m, i) => (
              <button key={m} className={p.cursor.mode === i ? "on" : ""} onClick={() => p.cursor.set({ mode: i })}>{m}</button>
            ))}
          </div>
          {p.cursor.mode > 0 && <Slider label="strength" value={p.cursor.amount * 100} def={60} onChange={(v) => p.cursor.set({ amount: v / 100 })} />}
          <div className="hint">{["The pointer leaves the picture alone.", "Drag the picture along as you move and leave a glowing trail.", "Whirl the picture around the pointer.", "A lens and ripples follow the pointer.", "A soft light follows the pointer and paints into the trails."][p.cursor.mode]} Click anywhere for a shockwave. Exports ignore the pointer.</div>
        </div>

        <div className="sec">
          <div className="sec-h"><span>Color</span></div>
          {by("drift").map((d) => g(d))}
        </div>

        <div className="sec">
          <div className="sec-h"><span>Input</span></div>
          {by("input").map((d) => g(d, d.key === "gain" ? { format: (v) => `${(Math.pow(4, (v - 50) / 50)).toFixed(2)}×` } : {}))}
          {p.follow && (
            <>
              <Toggle label="Follow what's playing (Spotify, Music)" on={p.follow.on} onChange={p.follow.set} />
              <div className="hint">{p.follow.on ? (p.follow.np?.title ? `Now: ${p.follow.np.title}${p.follow.np.artist ? ` · ${p.follow.np.artist}` : ""} on ${p.follow.np.app}. Titles and album art switch with every song.` : "Play something in Spotify or Apple Music. Its title and album art show up here and in the visuals.") : "Titles and album art from your music app are ignored."}</div>
            </>
          )}
          <div className="sec-h" style={{ marginTop: 10 }}><span>Quality</span></div>
          <div className="seg">
            {([[1, "sharp"], [0.75, "balanced"], [0.5, "fast"]] as const).map(([q, n]) => (
              <button key={n} className={p.quality.value === q ? "on" : ""} onClick={() => p.quality.set(q)}>{n}</button>
            ))}
          </div>
          <div className="hint">Lower it on older laptops. Exports always render at full quality.</div>
        </div>

        {p.emblem && (
          <div className="sec">
            <div className="sec-h"><span>Emblem</span><button onClick={p.removeEmblem}>remove</button></div>
            <Slider label="size" value={p.emblem.size * 100} onChange={(v) => p.setEmblem({ size: v / 100 })} def={45} />
            <Slider label="opacity" value={p.emblem.opacity * 100} onChange={(v) => p.setEmblem({ opacity: v / 100 })} def={100} />
            <Slider label="pulse" value={p.emblem.pulse * 100} onChange={(v) => p.setEmblem({ pulse: v / 100 })} def={50} />
            <Slider label="spin" value={p.emblem.spin * 100} min={-100} max={100} onChange={(v) => p.setEmblem({ spin: v / 100 })} def={0} />
            <Toggle label="Clean (sits above the effects)" on={p.emblem.clean} onChange={(v) => p.setEmblem({ clean: v })} />
            <Toggle label="Force white" on={p.emblem.white} onChange={(v) => p.setEmblem({ white: v })} />
            <Toggle label="Invert" on={p.emblem.invert} onChange={(v) => p.setEmblem({ invert: v })} />
          </div>
        )}

        <div className="sec">
          <div className="sec-h"><span>Text</span></div>
          <div className="seg">
            {(["off", "corner", "lower", "center"] as const).map((m) => (
              <button key={m} className={p.text.st.titleMode === m ? "on" : ""} onClick={() => p.text.set({ titleMode: m })}>{m === "off" ? "no title" : m === "lower" ? "lower third" : m}</button>
            ))}
          </div>
          {p.text.st.titleMode !== "off" && (
            <>
              <input className="field" style={{ height: 32, marginBottom: 6 }} placeholder="Title" value={p.text.st.title} onChange={(e) => p.text.set({ title: e.target.value })} onKeyDown={(e) => e.stopPropagation()} aria-label="Title" />
              <input className="field" style={{ height: 32, marginBottom: 8 }} placeholder="Artist" value={p.text.st.artist} onChange={(e) => p.text.set({ artist: e.target.value })} onKeyDown={(e) => e.stopPropagation()} aria-label="Artist" />
              <div className="seg">
                <button className={p.text.st.titleShow === "intro" ? "on" : ""} onClick={() => p.text.set({ titleShow: "intro" })}>first 9 s</button>
                <button className={p.text.st.titleShow === "always" ? "on" : ""} onClick={() => p.text.set({ titleShow: "always" })}>always</button>
              </div>
            </>
          )}
          <div className="seg">
            {(["grotesk", "serif", "mono", "condensed"] as const).map((f) => (
              <button key={f} className={p.text.st.font === f ? "on" : ""} onClick={() => p.text.set({ font: f })}>{f}</button>
            ))}
          </div>
          <div className="row" style={{ justifyContent: "space-between", margin: "4px 0" }}>
            <span style={{ color: "var(--dim)", fontSize: 12.5 }}>{p.text.lyricCount ? `Lyrics · ${p.text.lyricCount} lines` : "Synced lyrics (.lrc)"}</span>
            <span className="row">
              {p.text.lyricCount > 0 && <button className="btn ghost" style={{ height: 26 }} onClick={p.text.clearLyrics}>remove</button>}
              <button className="btn" style={{ height: 26 }} onClick={p.text.onLyrics}>{p.text.lyricCount ? "replace" : "add"}</button>
            </span>
          </div>
          {p.text.lyricCount > 0 && (
            <>
              <Toggle label="Show lyrics" on={p.text.st.lyricsOn} onChange={(v) => p.text.set({ lyricsOn: v })} />
              <div className="seg">
                <button className={p.text.st.lyricPos === "bottom" ? "on" : ""} onClick={() => p.text.set({ lyricPos: "bottom" })}>bottom</button>
                <button className={p.text.st.lyricPos === "center" ? "on" : ""} onClick={() => p.text.set({ lyricPos: "center" })}>center</button>
              </div>
              <Slider label="lyric timing" value={p.text.st.lyricOffset} min={-2} max={2} def={0} format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} s`} onChange={(v) => p.text.set({ lyricOffset: Math.round(v * 10) / 10 })} />
            </>
          )}
          <Slider label="text pulse" value={p.text.st.pulse * 100} def={40} onChange={(v) => p.text.set({ pulse: v / 100 })} />
          <Toggle label="Tint text with the palette" on={p.text.st.tint} onChange={(v) => p.text.set({ tint: v })} />
          <div className="hint">Titles fill in from the song's tags. Drop an .lrc file for synced lyrics. Text appears in recordings and exports.</div>
        </div>

        <div className="sec">
          <div className="sec-h"><span>Automation</span>{p.laneCount > 0 && <button onClick={p.clearLanes}>clear {p.laneCount}</button>}</div>
          <Toggle label="Record control moves to the track" on={p.armed} onChange={p.setArmed} />
          <div className="hint">{p.hasTrack ? "While armed and playing, every move you make is written to the track's timeline and replays on the next pass. Lanes show on the scrubber." : "Load a track to record automation against it."}</div>
        </div>
      </div>
    </aside>
  );
}
