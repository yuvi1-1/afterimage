/** Web MIDI: learn any knob, fader or pad onto any control. Mappings persist per machine. */
export type MidiTarget = string; // "g:react" global, "s:2" scene slider, "a:next" action
type Msg = { id: string; value: number; isNote: boolean };

const KEY = "afterimage.midi.v1";

export class Midi {
  access: MIDIAccess | null = null;
  map: Record<string, MidiTarget> = {};
  learning: MidiTarget | null = null;
  inputs: string[] = [];
  onValue: ((t: MidiTarget, v: number) => void) | null = null;
  onChange: (() => void) | null = null;
  supported = typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;

  constructor() {
    try { this.map = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { this.map = {}; }
  }

  async enable() {
    if (!this.supported) throw new Error("This browser has no Web MIDI. Chrome, Edge and the desktop app do.");
    if (this.access) return;
    this.access = await navigator.requestMIDIAccess();
    const bind = () => {
      this.inputs = [];
      this.access!.inputs.forEach((inp) => {
        this.inputs.push(inp.name || "MIDI input");
        inp.onmidimessage = (e) => this.handle(e.data);
      });
      this.onChange?.();
    };
    this.access.onstatechange = bind;
    bind();
  }

  private parse(d: Uint8Array | null): Msg | null {
    if (!d || d.length < 3) return null;
    const type = d[0] & 0xf0, ch = d[0] & 0x0f;
    if (type === 0xb0) return { id: `cc:${ch}:${d[1]}`, value: d[2] / 127, isNote: false };
    if (type === 0x90 && d[2] > 0) return { id: `n:${ch}:${d[1]}`, value: d[2] / 127, isNote: true };
    return null;
  }

  private handle(d: Uint8Array | null) {
    const m = this.parse(d);
    if (!m) return;
    if (this.learning) {
      for (const k of Object.keys(this.map)) if (this.map[k] === this.learning) delete this.map[k];
      this.map[m.id] = this.learning;
      this.learning = null;
      this.save();
      this.onChange?.();
      return;
    }
    const t = this.map[m.id];
    if (t) this.onValue?.(t, m.value);
  }

  learn(t: MidiTarget | null) { this.learning = t; this.onChange?.(); }
  unmap(t: MidiTarget) { for (const k of Object.keys(this.map)) if (this.map[k] === t) delete this.map[k]; this.save(); this.onChange?.(); }
  clear() { this.map = {}; this.save(); this.onChange?.(); }
  mapped(t: MidiTarget) { return Object.keys(this.map).find((k) => this.map[k] === t) ?? null; }
  private save() { try { localStorage.setItem(KEY, JSON.stringify(this.map)); } catch { /* ignore */ } }
}
