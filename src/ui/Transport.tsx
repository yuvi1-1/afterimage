import { useEffect, useRef } from "react";
import type { AudioEngine, SourceKind } from "../engine/audio";
import type { LaneSet } from "../lib/lanes";
import { Icon } from "./Icons";

type Props = {
  audio: AudioEngine;
  kind: SourceKind;
  playing: boolean;
  title: string;
  subtitle: string;
  peaks: Float32Array | null;
  lanes: LaneSet;
  volume: number;
  setVolume: (v: number) => void;
  onToggle: () => void;
  onDemo: () => void;
  onOpen: () => void;
  onMic: () => void;
  onSystem: () => void;
  onCamera: () => void;
  cameraOn: boolean;
};

const fmt = (s: number) => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "–:––");

export function Transport(p: Props) {
  const wave = useRef<HTMLCanvasElement>(null);
  const bars = useRef<HTMLDivElement>(null);
  const kick = useRef<HTMLDivElement>(null);
  const bpm = useRef<HTMLSpanElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  const latest = useRef(p);
  latest.current = p;

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const { audio, peaks, lanes, kind } = latest.current;
      const b = audio.bands;
      if (bars.current) {
        const v = [b.bass, b.mid, b.high, b.level];
        Array.from(bars.current.children).forEach((el, i) => ((el as HTMLElement).style.height = `${Math.min(100, v[i] * 75) + 6}%`));
      }
      if (kick.current) kick.current.style.opacity = String(0.15 + b.kick * 0.85);
      if (bpm.current) bpm.current.textContent = audio.playing && b.beats > 6 ? `${Math.round(b.bpm)} bpm` : "– bpm";
      if (time.current) time.current.textContent = kind === "track" ? `${fmt(audio.currentTime)} / ${fmt(audio.duration)}` : "";
      const c = wave.current;
      if (!c) return;
      const dpr = Math.min(2, devicePixelRatio || 1), W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      const x = c.getContext("2d")!;
      x.clearRect(0, 0, W, H);
      if (kind === "track" && audio.duration) {
        const prog = audio.currentTime / audio.duration;
        const n = peaks?.length ?? 0;
        for (let i = 0; i < W; i += 3 * dpr) {
          const t = i / W, v = n ? peaks![Math.floor(t * n)] : 0.3;
          const hgt = Math.max(1.5 * dpr, v * H * 0.85);
          x.fillStyle = t < prog ? "rgba(236,235,232,.95)" : "rgba(236,235,232,.28)";
          x.fillRect(i, (H - hgt) / 2, 2 * dpr, hgt);
        }
        // lanes
        const cols = ["#f2b544", "#5fb0ff", "#ff6b8b", "#7ee08a", "#c49bff"];
        Object.values(lanes).forEach((l, li) => {
          if (l.pts.length < 1) return;
          x.strokeStyle = cols[li % cols.length];
          x.lineWidth = 1.5 * dpr;
          x.beginPath();
          l.pts.forEach(([t, v], i) => {
            const px = (t / audio.duration) * W, py = H - 3 * dpr - (v / 100) * (H - 6 * dpr);
            i ? x.lineTo(px, py) : x.moveTo(px, py);
          });
          x.stroke();
        });
        x.fillStyle = "#fff";
        x.fillRect(prog * W - dpr, 0, 2 * dpr, H);
      } else {
        // live scope
        const w = audio.waveTex;
        x.strokeStyle = "rgba(236,235,232,.6)";
        x.lineWidth = 1.5 * dpr;
        x.beginPath();
        for (let i = 0; i < 512; i += 2) {
          const px = (i / 511) * W, py = (1 - w[i * 4 + 2] / 255) * H;
          i ? x.lineTo(px, py) : x.moveTo(px, py);
        }
        x.stroke();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const seek = (e: React.PointerEvent) => {
    const a = p.audio;
    if (p.kind !== "track" || !a.duration) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const go = (cx: number) => a.seek(Math.max(0, Math.min(1, (cx - r.left) / r.width)) * a.duration);
    go(e.clientX);
    const move = (ev: PointerEvent) => go(ev.clientX);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <footer className="transport glass ui" onPointerDown={(e) => e.stopPropagation()}>
      <div className="sources">
        <button className={`src${p.kind === "demo" ? " on" : ""}`} onClick={p.onDemo} data-tip="Built-in groove"><Icon.spark /> Demo</button>
        <button className={`src${p.kind === "track" ? " on" : ""}`} onClick={p.onOpen} data-tip="Open a track, photo or video"><Icon.music /> Open</button>
        <button className={`src${p.kind === "mic" ? " on" : ""}`} onClick={p.onMic} data-tip="Microphone or audio interface"><Icon.mic /> Input</button>
        <button className={`src${p.kind === "system" ? " on" : ""}`} onClick={p.onSystem} data-tip="Spotify, YouTube, any app"><Icon.speaker /> Computer</button>
        <button className={`src${p.cameraOn ? " on" : ""}`} onClick={p.onCamera} data-tip="Camera as the picture"><Icon.camera /></button>
      </div>
      <button className="play" onClick={p.onToggle} aria-label={p.playing ? "Pause" : "Play"}>{p.playing ? <Icon.pause /> : <Icon.play />}</button>
      <div className="trackbox">
        <div className="trackline"><span className="t">{p.title}</span><span className="s">{p.subtitle}</span><span className="s num" ref={time} style={{ marginLeft: "auto" }} /></div>
        <div className="wave" onPointerDown={seek}><canvas ref={wave} /></div>
      </div>
      <div className="meters">
        <div className="bars" ref={bars}><span /><span /><span /><span /></div>
        <div className="kick" ref={kick} />
        <span className="bpm num" ref={bpm}>– bpm</span>
        <div className="vol" data-tip="Volume"><input type="range" min={0} max={1} step={0.01} value={p.volume} onChange={(e) => p.setVolume(+e.target.value)} aria-label="Volume" /></div>
      </div>
    </footer>
  );
}
