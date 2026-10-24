import type { Bands } from "../engine/audio";

/**
 * Autopilot: watches the music and decides when the look should change.
 * - phrase: every N bars (counted from kicks, or from the tempo when kicks are sparse)
 * - drop: a sudden jump in energy after a quieter stretch
 */
export type AutoMode = "off" | "drift" | "show";
export type AutoEvent = "phrase" | "drop" | null;

export class Autopilot {
  mode: AutoMode = "off";
  bars = 8;
  private lastBeats = -1;
  private beatsAtPhrase = 0;
  private lastKickAt = 0;
  private phraseAt = 0;
  private fast = 0;
  private slow = 0;
  private lastDrop = -1e9;
  private lastNow = 0;

  reset(now: number) {
    this.lastBeats = -1;
    this.phraseAt = now;
    this.lastKickAt = now;
    this.fast = this.slow = 0;
    this.lastDrop = -1e9;
    this.lastNow = now;
  }

  tick(b: Bands, now: number): AutoEvent {
    if (this.mode === "off") return null;
    const dt = Math.min(0.2, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    if (this.lastBeats < 0) { this.lastBeats = b.beats; this.beatsAtPhrase = b.beats; this.phraseAt = now; this.lastKickAt = now; }
    if (b.beats !== this.lastBeats) { this.lastBeats = b.beats; this.lastKickAt = now; }
    // energy envelopes (~0.4 s and ~8 s)
    this.fast += (b.level - this.fast) * (1 - Math.exp(-dt / 0.4));
    this.slow += (b.level - this.slow) * (1 - Math.exp(-dt / 8));
    if (now - this.lastDrop > 16000 && this.slow < 0.32 && this.fast > Math.max(0.42, this.slow * 1.9)) {
      this.lastDrop = now;
      this.beatsAtPhrase = b.beats;
      this.phraseAt = now;
      return "drop";
    }
    const beatsPerPhrase = this.bars * 4;
    const kicksSparse = now - this.lastKickAt > 4000;
    const byKicks = !kicksSparse && b.beats - this.beatsAtPhrase >= beatsPerPhrase;
    const byClock = kicksSparse && now - this.phraseAt >= (beatsPerPhrase * 60000) / Math.max(60, b.bpm);
    if (byKicks || byClock) {
      this.beatsAtPhrase = b.beats;
      this.phraseAt = now;
      return "phrase";
    }
    return null;
  }
}

/** Tap tempo: average of the last few taps, reset after a pause. */
export class TapTempo {
  private taps: number[] = [];
  tap(now: number): number | null {
    if (this.taps.length && now - this.taps[this.taps.length - 1] > 2000) this.taps = [];
    this.taps.push(now);
    if (this.taps.length > 8) this.taps.shift();
    if (this.taps.length < 3) return null;
    const iv = (this.taps[this.taps.length - 1] - this.taps[0]) / (this.taps.length - 1);
    return 60000 / iv;
  }
}
