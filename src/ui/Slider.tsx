import { useRef, useState } from "react";

type Props = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  def?: number;
  int?: boolean;
  big?: boolean;
  hint?: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  onGrab?: (down: boolean) => void;
  /** MIDI learn: when set, clicking selects this control instead of dragging */
  learn?: "off" | "armed" | "learning";
  onLearn?: () => void;
  midiTag?: string | null;
  automated?: boolean;
};

export function Slider({ label, value, min = 0, max = 100, def, int, big, hint, format, onChange, onGrab, learn = "off", onLearn, midiTag, automated }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const span = max - min;
  const t = Math.max(0, Math.min(1, (value - min) / span));
  const bipolar = min < 0;
  const set = (clientX: number, fine: boolean, start?: { x: number; v: number }) => {
    const r = ref.current!.getBoundingClientRect();
    let v: number;
    if (fine && start) v = start.v + ((clientX - start.x) / r.width) * span * 0.2;
    else v = min + ((clientX - r.left) / r.width) * span;
    v = Math.max(min, Math.min(max, v));
    onChange(int ? Math.round(v) : Math.round(v * 10) / 10);
  };
  const down = (e: React.PointerEvent) => {
    if (learn !== "off") { onLearn?.(); return; }
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    setDrag(true);
    onGrab?.(true);
    const start = { x: e.clientX, v: value };
    if (!e.shiftKey) set(e.clientX, false);
    const move = (ev: PointerEvent) => set(ev.clientX, ev.shiftKey, start);
    const up = () => {
      setDrag(false);
      onGrab?.(false);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };
  const key = (e: React.KeyboardEvent) => {
    const step = (int ? 1 : span / 100) * (e.shiftKey ? 10 : 1);
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { onChange(Math.min(max, value + step)); e.preventDefault(); e.stopPropagation(); }
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") { onChange(Math.max(min, value - step)); e.preventDefault(); e.stopPropagation(); }
  };
  const shown = format ? format(value) : int ? String(Math.round(value)) : String(Math.round(value));
  const lo = bipolar ? Math.min(t, 0.5) : 0, hi = bipolar ? Math.max(t, 0.5) : t;
  return (
    <div
      className={`sl${big ? " big" : ""}${drag ? " drag" : ""}${learn === "armed" ? " learn" : ""}${learn === "learning" ? " learning" : ""}${automated ? " auto" : ""}`}
      onPointerDown={down}
      onDoubleClick={() => def != null && onChange(def)}
      onKeyDown={key}
      tabIndex={0}
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      title={hint ? `${hint}. Double-click to reset, Shift-drag for fine.` : "Double-click to reset, Shift-drag for fine."}
    >
      <span className="lab">{label}{midiTag ? <span className="midi-tag">{midiTag}</span> : null}</span>
      <span className="val num">{shown}</span>
      <div className="track" ref={ref}>
        <div className="fill" style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }} />
        <div className="knob" style={{ left: `${t * 100}%` }} />
      </div>
    </div>
  );
}

export function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={`toggle${on ? " on" : ""}`} onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <span>{label}</span>
      <i />
    </div>
  );
}
