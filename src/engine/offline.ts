import type { ExtAudioFrame } from "./audio";

/**
 * Reproduces what the live Web Audio AnalyserNodes report, but for any moment of a decoded track.
 * Follows the AnalyserNode spec (Blackman window, |X|/N, temporal smoothing, dB → byte mapping),
 * so a video export reacts exactly like playback does.
 */
const N = 2048;
const SMOOTH = 0.5; // matches analyser.smoothingTimeConstant
const MIN_DB = -100, MAX_DB = -30; // AnalyserNode defaults

export class OfflineAnalyzer {
  private mono: Float32Array;
  private L: Float32Array;
  private R: Float32Array;
  private win = new Float32Array(N);
  private re = new Float32Array(N);
  private im = new Float32Array(N);
  private smooth = new Float32Array(N / 2);
  private rev = new Uint32Array(N);
  private cos = new Float32Array(N / 2);
  private sin = new Float32Array(N / 2);
  readonly frame: ExtAudioFrame;
  readonly sampleRate: number;
  readonly duration: number;

  constructor(buf: AudioBuffer) {
    this.sampleRate = buf.sampleRate;
    this.duration = buf.duration;
    this.L = buf.getChannelData(0);
    this.R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : this.L;
    this.mono = new Float32Array(buf.length);
    for (let i = 0; i < buf.length; i++) this.mono[i] = (this.L[i] + this.R[i]) * 0.5;
    for (let n = 0; n < N; n++) this.win[n] = 0.42 - 0.5 * Math.cos((2 * Math.PI * n) / N) + 0.08 * Math.cos((4 * Math.PI * n) / N);
    const bits = Math.log2(N);
    for (let i = 0; i < N; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    for (let i = 0; i < N / 2; i++) { this.cos[i] = Math.cos((-2 * Math.PI * i) / N); this.sin[i] = Math.sin((-2 * Math.PI * i) / N); }
    this.frame = { freq: new Uint8Array(N / 2), time: new Float32Array(N), timeL: new Float32Array(N / 2), timeR: new Float32Array(N / 2), sampleRate: buf.sampleRate };
  }

  /** Forget smoothing history (call before a new export pass). */
  reset() { this.smooth.fill(0); }

  /** Analysis of the audio that has just played at time t (seconds). */
  at(t: number): ExtAudioFrame {
    const end = Math.round(t * this.sampleRate);
    const f = this.frame, src = this.mono, len = src.length;
    for (let i = 0; i < N; i++) { const j = end - N + i; f.time[i] = j >= 0 && j < len ? src[j] : 0; }
    for (let i = 0; i < N / 2; i++) {
      const j = end - N / 2 + i;
      f.timeL[i] = j >= 0 && j < len ? this.L[j] : 0;
      f.timeR[i] = j >= 0 && j < len ? this.R[j] : 0;
    }
    // windowed FFT (iterative radix-2)
    const re = this.re, im = this.im;
    for (let i = 0; i < N; i++) { re[this.rev[i]] = f.time[i] * this.win[i]; im[this.rev[i]] = 0; }
    for (let size = 2; size <= N; size <<= 1) {
      const half = size >> 1, step = N / size;
      for (let i = 0; i < N; i += size) {
        for (let k = 0; k < half; k++) {
          const c = this.cos[k * step], s = this.sin[k * step];
          const a = i + k, b = a + half;
          const tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
    const scale = 255 / (MAX_DB - MIN_DB);
    for (let k = 0; k < N / 2; k++) {
      const mag = Math.hypot(re[k], im[k]) / N;
      const sm = (this.smooth[k] = SMOOTH * this.smooth[k] + (1 - SMOOTH) * mag);
      const db = sm > 0 ? 20 * Math.log10(sm) : -Infinity;
      f.freq[k] = Math.max(0, Math.min(255, Math.floor(scale * (db - MIN_DB))));
    }
    return f;
  }
}

/** Decode any audio file the browser understands. */
export async function decodeAudio(file: Blob): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, 1, 48000);
  return ctx.decodeAudioData(await file.arrayBuffer());
}
