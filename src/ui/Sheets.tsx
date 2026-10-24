import { useEffect, useRef, useState, type ReactNode } from "react";
import { PALETTES } from "../engine/palettes";
import type { Look } from "../engine/params";
import { buyPro, checkoutAvailable } from "../lib/checkout";
import { BUY_URL, PRICE, verifyLicense, type License } from "../lib/license";
import type { Preset } from "../lib/looks";
import { recordSize, type RecordOpts, pickMime } from "../lib/recorder";
import { SCENES } from "../scenes";
import { Icon } from "./Icons";

export function Sheet({ title, sub, onClose, children, small, actions }: { title: string; sub?: string; onClose: () => void; children: ReactNode; small?: boolean; actions?: ReactNode }) {
  return (
    <div className="scrim ui" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`sheet glass${small ? " small" : ""}`} role="dialog" aria-label={title} onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-h">
          <h2>{title}</h2>
          {sub && <span className="k">{sub}</span>}
          {actions}
          <button className="ib" onClick={onClose} aria-label="Close"><Icon.x /></button>
        </div>
        <div className="sheet-b">{children}</div>
      </div>
    </div>
  );
}

const GROUPS = ["Image", "Fluid", "Fractal", "Space", "Pattern", "Signal"] as const;
const thumbBg = (id: string) => `url(./thumbs/${id}.webp), linear-gradient(135deg, #1a1a20, #0b0b0e)`;

export function SceneGrid({ current, pro, onPick, onClose }: { current: string; pro: boolean; onPick: (id: string) => void; onClose: () => void }) {
  return (
    <Sheet title="Scenes" sub={`${SCENES.length} scenes · Tab`} onClose={onClose}>
      {GROUPS.map((g) => {
        const list = SCENES.filter((s) => s.group === g);
        if (!list.length) return null;
        return (
          <div key={g}>
            <div className="grp-t">{g}</div>
            <div className="scenes">
              {list.map((s) => (
                <button key={s.id} className={`card${s.id === current ? " on" : ""}`} onClick={() => onPick(s.id)}>
                  <div className="th" style={{ backgroundImage: thumbBg(s.id) }}>{s.pro && !pro && <span className="pro-badge">PRO</span>}</div>
                  <div className="meta"><b>{s.name}</b><span>{s.blurb}</span></div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </Sheet>
  );
}

export function PaletteSheet({ current, photo, onPick, onClose }: { current: string; photo: string[] | null; onPick: (id: string) => void; onClose: () => void }) {
  const groups = [...new Set(PALETTES.map((p) => p.group))];
  const sw = (c: string[]) => <div className="sw">{c.map((h, i) => <i key={i} style={{ background: h }} />)}</div>;
  return (
    <Sheet title="Palette" sub="P · ↑ ↓ to step" onClose={onClose}>
      {photo && (
        <>
          <div className="grp-t">From your image</div>
          <div className="pals">
            <button className={`pal${current === "photo" ? " on" : ""}`} onClick={() => onPick("photo")}>{sw(photo)}<b>Photo</b></button>
          </div>
        </>
      )}
      {groups.map((g) => (
        <div key={g}>
          <div className="grp-t">{g}</div>
          <div className="pals">
            {PALETTES.filter((p) => p.group === g).map((p) => (
              <button key={p.id} className={`pal${p.id === current ? " on" : ""}`} onClick={() => onPick(p.id)}>{sw(p.c)}<b>{p.name}</b></button>
            ))}
          </div>
        </div>
      ))}
    </Sheet>
  );
}

export function PresetSheet({ presets, current, morph, setMorph, onRecall, onSave, onClear, onExport, onImport, onClose }: {
  presets: Record<number, Preset>; current: number | null; morph: number; setMorph: (ms: number) => void;
  onRecall: (n: number) => void; onSave: (n: number) => void; onClear: (n: number) => void;
  onExport: () => void; onImport: (f: File) => void; onClose: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const h = hover != null ? presets[hover] : null;
  const color = (l: Look) => PALETTES.find((p) => p.id === l.palette)?.c[3] ?? "#f2b544";
  return (
    <Sheet title="Presets" sub="128 slots" onClose={onClose} actions={
      <div className="row">
        <button className="btn ghost" onClick={() => file.current?.click()}>Import</button>
        <button className="btn ghost" onClick={onExport}>Export</button>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
      </div>
    }>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
        <div className="hint" style={{ margin: 0 }}>Click to recall · Shift-click to save the current look · Alt-click to clear. Keys 1–9 recall, Shift+1–9 save.</div>
        <label className="row" style={{ color: "var(--dim)" }}>Morph
          <input className="field num" style={{ width: 84, height: 30 }} type="number" min={0} max={20000} step={250} value={morph} onChange={(e) => setMorph(Math.max(0, +e.target.value))} /> ms
        </label>
      </div>
      <div className="slots">
        {Array.from({ length: 128 }, (_, i) => i + 1).map((n) => {
          const p = presets[n];
          return (
            <button key={n} className={`slot${p ? " full" : ""}${current === n ? " cur" : ""}`} style={p ? ({ "--c": color(p.look) } as React.CSSProperties) : undefined}
              onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)}
              onClick={(e) => (e.altKey ? onClear(n) : e.shiftKey || !p ? onSave(n) : onRecall(n))}
              title={p ? p.name : "Empty · click to save"}>{n}</button>
          );
        })}
      </div>
      <div className="hint" style={{ minHeight: 18, marginTop: 12 }}>{h ? `${hover} · ${h.name} · ${SCENES.find((s) => s.id === h.look.scene)?.name ?? ""} · ${PALETTES.find((p) => p.id === h.look.palette)?.name ?? "Photo"}` : hover ? `${hover} · empty` : ""}</div>
    </Sheet>
  );
}

const KEYS: [string, string[]][] = [
  ["Play / pause", ["Space"]], ["Scenes", ["Tab"]], ["Palette", ["P"]], ["Tuning panel", ["E"]],
  ["Next / previous scene", ["→", "←"]], ["Next / previous palette", ["↑", "↓"]], ["Next scene mode", ["C"]],
  ["Randomize look", ["L"]], ["Random scene", ["N"]], ["Shuffle everything", ["X"]], ["Swap back", ["B"]], ["Undo", ["⌘/Ctrl", "Z"]],
  ["Recall preset", ["1–9"]], ["Save preset", ["Shift", "1–9"]], ["Presets", ["K"]],
  ["Record video", ["R"]], ["Save still (PNG)", ["S"]], ["Output window", ["O"]], ["Fullscreen", ["F"]], ["Hide interface", ["H"]],
  ["MIDI learn", ["M"]], ["Debug overlay", ["D"]], ["Open file", ["⌘/Ctrl", "O"]], ["Help", ["?"]],
];

export function HelpSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Keyboard" sub="Everything is one key away" onClose={onClose}>
      <div className="keys">
        {KEYS.map(([a, k]) => <div key={a}><span>{a}</span><span>{k.map((x) => <kbd key={x}>{x}</kbd>)}</span></div>)}
      </div>
      <p className="hint" style={{ marginTop: 18 }}>Drop a track, a photo, a screenshot of your player or a video anywhere on the window. Screenshots are scanned for the album cover, and transparent logos become an emblem that rides the beat.</p>
    </Sheet>
  );
}

export function RecordSheet({ pro, opts, setOpts, onStart, onClose, onPro }: { pro: boolean; opts: RecordOpts; setOpts: (o: RecordOpts) => void; onStart: () => void; onClose: () => void; onPro: () => void }) {
  const [w, h] = recordSize(opts);
  const { ext } = pickMime();
  const seg = <T extends string | number>(vals: T[], cur: T, key: keyof RecordOpts, label: (v: T) => string, locked?: (v: T) => boolean) => (
    <div className="seg">
      {vals.map((v) => (
        <button key={String(v)} className={cur === v ? "on" : ""} onClick={() => (locked?.(v) ? onPro() : setOpts({ ...opts, [key]: v }))}>
          {label(v)}{locked?.(v) ? " · Pro" : ""}
        </button>
      ))}
    </div>
  );
  return (
    <Sheet title="Record" sub="R" small onClose={onClose}>
      <div className="grp-t">Size</div>
      {seg<number>([1080, 1440, 2160], opts.height, "height", (v) => (v === 2160 ? "4K" : `${v}p`), (v) => !pro && v > 1080)}
      <div className="grp-t">Shape</div>
      {seg<string>(["16:9", "9:16", "1:1"], opts.aspect, "aspect", (v) => (v === "16:9" ? "16:9 wide" : v === "9:16" ? "9:16 vertical" : "1:1 square"))}
      <div className="grp-t">Frame rate</div>
      {seg<number>([30, 60], opts.fps, "fps", (v) => `${v} fps`)}
      <div className="toggle on" onClick={() => setOpts({ ...opts, audio: !opts.audio })} style={{ opacity: opts.audio ? 1 : 0.6 }}>
        <span>Include the audio</span><i style={{ background: opts.audio ? "var(--accent)" : undefined }} />
      </div>
      <p className="hint">{w} × {h} · {ext.toUpperCase()}{ext === "webm" ? " (this browser can't write MP4; the desktop app and recent Chrome can)" : ""}. Recording follows the music in real time: start the track, press record, press R again to stop.</p>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={onStart}><Icon.rec /> Start recording</button>
      </div>
    </Sheet>
  );
}

export function ProSheet({ license, reason, onActivate, onDeactivate, onClose }: { license: License | null; reason?: string; onActivate: (key: string) => void; onDeactivate: () => void; onClose: () => void }) {
  const [key, setKey] = useState("");
  const [err, setErr] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const pay = async () => {
    setErr(""); setNote("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr("Enter your email. Your license key is tied to it.");
    setBusy(true);
    try {
      const r = await buyPro(email.trim());
      if (r.status === "cancelled") setNote("Payment cancelled. Nothing was charged.");
      else if (r.license && verifyLicense(r.license)) onActivate(r.license);
      else setNote(r.message || "Payment received. Your license key will be emailed to you shortly.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title={license ? "Afterimage Pro" : "Unlock Afterimage Pro"} small onClose={onClose}>
      {license ? (
        <>
          <p style={{ marginTop: 0 }}>Licensed to <b>{license.email}</b> since {license.issued}. Thank you for supporting independent software.</p>
          <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn danger" onClick={onDeactivate}>Remove license from this device</button></div>
        </>
      ) : (
        <>
          {reason && <p style={{ marginTop: 0, color: "var(--accent)" }}>{reason}</p>}
          <ul style={{ margin: "0 0 14px", paddingLeft: 18, color: "var(--dim)", lineHeight: 1.8 }}>
            <li>All {SCENES.filter((s) => s.pro).length} Pro scenes: fluids, fractals, particles, reaction-diffusion</li>
            <li>1440p and 4K video recording</li>
            <li>Output window for projectors and second screens</li>
            <li>MIDI controller mapping</li>
            <li>Web and desktop app, one license, every update</li>
          </ul>
          {checkoutAvailable ? (
            <div style={{ marginBottom: 18 }}>
              <input className="field" type="email" placeholder="you@example.com" value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") pay(); }} aria-label="Email for your license" />
              <div className="row" style={{ marginTop: 10, justifyContent: "space-between" }}>
                <span className="hint" style={{ margin: 0 }}>Pay securely with Razorpay. Pro unlocks instantly.</span>
                <button className="btn primary" disabled={busy} onClick={pay}>{busy ? "Opening…" : `Buy Pro · ${PRICE} once`}</button>
              </div>
              {note && <div className="hint" style={{ color: "var(--text)" }}>{note}</div>}
            </div>
          ) : (
            <div className="row" style={{ marginBottom: 18 }}>
              <a className="btn primary" href={BUY_URL} target="_blank" rel="noreferrer">Buy Pro · {PRICE} once</a>
            </div>
          )}
          {err && <div className="err" style={{ marginBottom: 10 }}>{err}</div>}
          <div className="grp-t">Have a key?</div>
          <textarea className="field" placeholder="AFTR-…" value={key} onChange={(e) => { setKey(e.target.value); setErr(""); }} onKeyDown={(e) => e.stopPropagation()} />
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
            <button className="btn" onClick={() => (verifyLicense(key) ? onActivate(key) : setErr("That key isn't valid. Paste the whole key, starting with AFTR-."))}>Activate</button>
          </div>
        </>
      )}
    </Sheet>
  );
}

export function CoverSheet({ full, box, found, confidence, onApply, onWhole, onEmblem, onClose }: {
  full: HTMLCanvasElement; box: { x: number; y: number; w: number; h: number }; found: boolean; confidence: number;
  onApply: (b: { x: number; y: number; w: number; h: number }) => void; onWhole: () => void; onEmblem: () => void; onClose: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [b, setB] = useState(box);
  useEffect(() => {
    const c = full.cloneNode() as HTMLCanvasElement;
    c.getContext("2d")!.drawImage(full, 0, 0);
    host.current!.prepend(c);
    return () => c.remove();
  }, [full]);
  const drag = (e: React.PointerEvent, mode: "move" | "size") => {
    e.preventDefault();
    const r = host.current!.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, b0 = b;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / r.width, dy = (ev.clientY - sy) / r.height;
      if (mode === "move") setB({ ...b0, x: Math.max(0, Math.min(1 - b0.w, b0.x + dx)), y: Math.max(0, Math.min(1 - b0.h, b0.y + dy)) });
      else {
        const s = Math.max(0.05, Math.min(1 - b0.x, b0.w + dx));
        const hh = Math.min(1 - b0.y, (s * r.width) / r.height);
        setB({ ...b0, w: (hh * r.height) / r.width, h: hh });
      }
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <Sheet title={found ? "Album cover found" : "Pick the cover"} sub={found ? `${Math.round(confidence * 100)}% sure` : "Drag the frame onto the artwork"} onClose={onClose}>
      <div style={{ textAlign: "center" }}>
        <div className="cropper" ref={host}>
          <div className="box" style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%`, cursor: "move" }} onPointerDown={(e) => drag(e, "move")}>
            <div style={{ position: "absolute", right: -7, bottom: -7, width: 14, height: 14, borderRadius: 4, background: "var(--accent)", cursor: "nwse-resize" }} onPointerDown={(e) => { e.stopPropagation(); drag(e, "size"); }} />
          </div>
        </div>
      </div>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16, flexWrap: "wrap" }}>
        <button className="btn ghost" onClick={onEmblem}>Use as emblem</button>
        <button className="btn ghost" onClick={onWhole}>Use the whole image</button>
        <button className="btn primary" onClick={() => onApply(b)}>Use this crop</button>
      </div>
    </Sheet>
  );
}
