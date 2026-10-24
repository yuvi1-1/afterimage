/** Audio input + analysis: bands, kick and accent detection, tempo, FFT / waveform / spectrogram data. */

export type Bands = { bass: number; mid: number; high: number; level: number; kick: number; accent: number; bpm: number; beatPhase: number; beats: number };
/** One frame of analysis computed offline (same shapes the live analysers produce). */
export type ExtAudioFrame = { freq: Uint8Array; time: Float32Array; timeL: Float32Array; timeR: Float32Array; sampleRate: number };

export type SourceKind = "none" | "track" | "mic" | "system" | "demo" | "video";

const FFT_BINS = 512;
const SPEC_ROWS = 128;

export class AudioEngine {
  ctx: AudioContext | null = null;
  analyser!: AnalyserNode;
  analyserL!: AnalyserNode;
  analyserR!: AnalyserNode;
  out!: GainNode; // to speakers
  bus!: GainNode; // audible sources
  monitor!: GainNode; // live inputs: analysed + recorded, not played back
  recordDest!: MediaStreamAudioDestinationNode;
  el: HTMLAudioElement | null = null;
  stream: MediaStream | null = null;
  liveNode: MediaStreamAudioSourceNode | null = null;
  kind: SourceKind = "none";
  trackName = "";
  trackArtist = "";
  freq = new Uint8Array(1024);
  time = new Float32Array(2048);
  timeL = new Float32Array(1024);
  timeR = new Float32Array(1024);
  /** Packed textures the engine uploads every frame */
  fftTex = new Uint8Array(FFT_BINS);
  waveTex = new Uint8Array(FFT_BINS * 4); // RGBA: L, R, mono, 0
  specTex = new Uint8Array(FFT_BINS * SPEC_ROWS);
  specRow = 0;
  bands: Bands = { bass: 0, mid: 0, high: 0, level: 0, kick: 0, accent: 0, bpm: 120, beatPhase: 0, beats: 0 };
  private hist: number[] = [];
  private histH: number[] = [];
  private peaks = [0.3, 0.3, 0.3];
  private lastKick = 0;
  private lastAccent = 0;
  private onsets: number[] = [];
  private smoothedFFT = new Float32Array(FFT_BINS);
  demo: DemoBeat | null = null;
  onKick: (() => void) | null = null;
  onChange: (() => void) | null = null;
  videoNode: MediaElementAudioSourceNode | null = null;

  ensure(): AudioContext {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    }
    const ctx = (this.ctx = new AudioContext({ latencyHint: "interactive" }));
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.5;
    this.analyserL = ctx.createAnalyser();
    this.analyserR = ctx.createAnalyser();
    this.analyserL.fftSize = this.analyserR.fftSize = 1024;
    const split = ctx.createChannelSplitter(2);
    this.out = ctx.createGain();
    this.out.connect(ctx.destination);
    this.recordDest = ctx.createMediaStreamDestination();
    this.bus = ctx.createGain();
    this.monitor = ctx.createGain();
    for (const n of [this.bus, this.monitor]) {
      n.connect(this.analyser);
      n.connect(split);
      n.connect(this.recordDest);
    }
    this.bus.connect(this.out);
    split.connect(this.analyserL, 0);
    split.connect(this.analyserR, 1);
    this.el = new Audio();
    this.el.crossOrigin = "anonymous";
    ctx.createMediaElementSource(this.el).connect(this.bus);
    this.el.addEventListener("ended", () => this.onChange?.());
    this.el.addEventListener("play", () => this.onChange?.());
    this.el.addEventListener("pause", () => this.onChange?.());
    this.demo = new DemoBeat(ctx, this.bus);
    return ctx;
  }

  stopAll(except?: SourceKind) {
    if (except !== "track" && this.el) this.el.pause();
    if (except !== "demo") this.demo?.stop();
    if (except !== "mic" && except !== "system" && this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      this.liveNode?.disconnect();
      this.liveNode = null;
    }
    this.kind = except ?? "none";
    this.onChange?.();
  }

  async loadTrack(file: File | Blob, name: string) {
    this.ensure();
    this.stopAll("track");
    if (this.el!.src) URL.revokeObjectURL(this.el!.src);
    this.el!.src = URL.createObjectURL(file);
    this.trackName = name.replace(/\.[^.]+$/, "");
    this.trackArtist = "";
    this.kind = "track";
    try { await this.el!.play(); } catch { /* user can press play */ }
    this.onChange?.();
  }

  playDemo() {
    this.ensure();
    this.stopAll("demo");
    this.demo!.start();
    this.kind = "demo";
    this.trackName = "Demo groove · 122 bpm";
    this.onChange?.();
  }

  async live(kind: "mic" | "system", deviceId?: string) {
    this.ensure();
    let stream: MediaStream;
    if (kind === "mic") {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } else {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } as MediaTrackConstraints });
      stream.getVideoTracks().forEach((t) => t.stop());
      if (!stream.getAudioTracks().length) throw new Error("noaudio");
    }
    this.stopAll(kind);
    this.stream = stream;
    this.liveNode = this.ctx!.createMediaStreamSource(stream);
    this.liveNode.connect(this.monitor);
    this.kind = kind;
    this.trackName = kind === "mic" ? "Audio input" : "Computer audio";
    this.onChange?.();
  }

  attachVideo(el: HTMLVideoElement) {
    this.ensure();
    this.stopAll();
    if (this.videoNode?.mediaElement !== el) {
      this.videoNode?.disconnect();
      this.videoNode = this.ctx!.createMediaElementSource(el);
      this.videoNode.connect(this.bus);
    }
    this.kind = "video";
    this.trackName = "Video sound";
    this.onChange?.();
  }

  get playing(): boolean {
    if (this.kind === "track") return !!this.el && !this.el.paused;
    if (this.kind === "demo") return !!this.demo?.playing;
    return this.kind === "mic" || this.kind === "system" || this.kind === "video";
  }

  toggle() {
    this.ensure();
    if (this.kind === "track") this.el!.paused ? this.el!.play() : this.el!.pause();
    else if (this.kind === "demo") this.demo!.playing ? this.demo!.stop() : this.demo!.start();
    else if (this.kind === "mic" || this.kind === "system") this.stopAll();
    else if (this.el?.src) { this.stopAll("track"); this.el.play(); this.kind = "track"; }
    else this.playDemo();
    this.onChange?.();
  }

  setVolume(v: number) {
    this.ensure();
    this.out.gain.value = v;
  }

  private band(lo: number, hi: number, binHz: number) {
    const f = this.freq;
    const a = Math.max(1, Math.floor(lo / binHz)), b = Math.min(f.length - 1, Math.ceil(hi / binHz));
    let s = 0;
    for (let i = a; i <= b; i++) s += f[i];
    return s / ((b - a + 1) * 255);
  }

  /** gain: 0.25..4, decay: 0..1 (1 = long hold) */
  update(dt: number, now: number, gain: number, decay: number, ext?: ExtAudioFrame) {
    const B = this.bands;
    const release = 0.3 - decay * 0.26;
    let raw: number[];
    const live = !!ext || (!!this.ctx && this.playing);
    if (live) {
      let binHz: number;
      if (ext) {
        this.freq.set(ext.freq);
        this.time.set(ext.time);
        this.timeL.set(ext.timeL);
        this.timeR.set(ext.timeR);
        binHz = ext.sampleRate / 2048;
      } else {
        this.analyser.getByteFrequencyData(this.freq);
        this.analyser.getFloatTimeDomainData(this.time);
        this.analyserL.getFloatTimeDomainData(this.timeL);
        this.analyserR.getFloatTimeDomainData(this.timeR);
        binHz = this.ctx!.sampleRate / this.analyser.fftSize;
      }
      raw = [this.band(25, 140, binHz), this.band(140, 2000, binHz) * 1.35, this.band(2000, 10000, binHz) * 2.1];
      // log-spaced FFT texture
      for (let i = 0; i < FFT_BINS; i++) {
        const f0 = 25 * Math.pow(16000 / 25, i / FFT_BINS), f1 = 25 * Math.pow(16000 / 25, (i + 1) / FFT_BINS);
        const v = Math.min(1, this.band(f0, f1, binHz) * gain * (1 + i / 300));
        this.smoothedFFT[i] += (v - this.smoothedFFT[i]) * (v > this.smoothedFFT[i] ? 0.7 : 0.2);
      }
    } else {
      // gentle idle motion so scenes never look dead
      const ph = (now / 1000 * 2) % 1;
      raw = [Math.exp(-ph * 5) * 0.42 + 0.06, 0.22 + 0.07 * Math.sin(now / 1400), 0.14 + 0.06 * Math.sin(now / 900 + 1)];
      for (let i = 0; i < FFT_BINS; i++) this.smoothedFFT[i] = Math.max(0, (0.5 - i / FFT_BINS * 0.45) * (0.6 + 0.4 * Math.sin(i * 0.05 + now / 500)) * Math.exp(-ph * 2));
      for (let i = 0; i < 1024; i++) {
        const t = now / 1000 + i / 44100;
        this.timeL[i] = Math.sin(t * 2 * Math.PI * 110) * 0.3 * Math.exp(-ph * 3) + Math.sin(t * 2 * Math.PI * 330) * 0.1;
        this.timeR[i] = Math.sin(t * 2 * Math.PI * 110 + 0.8) * 0.3 * Math.exp(-ph * 3) + Math.cos(t * 2 * Math.PI * 220) * 0.1;
        this.time[i] = (this.timeL[i] + this.timeR[i]) / 2;
      }
    }
    const keys = ["bass", "mid", "high"] as const;
    raw.forEach((r, i) => {
      const v = r * gain;
      this.peaks[i] = Math.max(this.peaks[i] * 0.997, v, 0.18);
      const norm = Math.min(1.5, v * 0.45 + (v / this.peaks[i]) * 0.55);
      B[keys[i]] += (norm - B[keys[i]]) * (norm > B[keys[i]] ? 0.65 : release);
    });
    B.level = B.bass * 0.5 + B.mid * 0.32 + B.high * 0.18;
    // kick: low-band flux against a short running average
    const lo = raw[0] * gain;
    this.hist.push(lo);
    if (this.hist.length > 43) this.hist.shift();
    const avg = this.hist.reduce((a, b) => a + b, 0) / this.hist.length;
    if (lo > avg * 1.22 + 0.035 && lo > 0.18 && now - this.lastKick > 220) {
      if (this.lastKick) this.onsets.push(now - this.lastKick);
      if (this.onsets.length > 24) this.onsets.shift();
      this.lastKick = now;
      B.kick = 1;
      B.beats++;
      this.onKick?.();
      this.estimateTempo();
    }
    // accent: sharp rise in highs (snares, claps, hats on downbeats)
    const hi = raw[2] * gain;
    this.histH.push(hi);
    if (this.histH.length > 30) this.histH.shift();
    const avgH = this.histH.reduce((a, b) => a + b, 0) / this.histH.length;
    if (hi > avgH * 1.35 + 0.05 && now - this.lastAccent > 160) {
      this.lastAccent = now;
      B.accent = 1;
    }
    const fall = Math.pow(0.02, dt * (1.3 + (1 - decay) * 2.5));
    B.kick *= fall;
    B.accent *= Math.pow(0.02, dt * 3);
    const period = 60000 / B.bpm;
    B.beatPhase = ((now - this.lastKick) % period) / period;
    // textures
    for (let i = 0; i < FFT_BINS; i++) this.fftTex[i] = this.smoothedFFT[i] * 255;
    for (let i = 0; i < FFT_BINS; i++) {
      const j = i * 2;
      this.waveTex[i * 4] = Math.max(0, Math.min(255, (this.timeL[j] * gain * 0.5 + 0.5) * 255));
      this.waveTex[i * 4 + 1] = Math.max(0, Math.min(255, (this.timeR[j] * gain * 0.5 + 0.5) * 255));
      this.waveTex[i * 4 + 2] = Math.max(0, Math.min(255, (this.time[j] * gain * 0.5 + 0.5) * 255));
    }
    this.specTex.set(this.fftTex, this.specRow * FFT_BINS);
    this.specRow = (this.specRow + 1) % SPEC_ROWS;
  }

  private estimateTempo() {
    if (this.onsets.length < 6) return;
    // fold intervals into 80..170 bpm and take the median
    const bpms = this.onsets.map((ms) => {
      let b = 60000 / ms;
      while (b < 80) b *= 2;
      while (b > 170) b /= 2;
      return b;
    }).sort((a, b) => a - b);
    const med = bpms[Math.floor(bpms.length / 2)];
    this.bands.bpm += (med - this.bands.bpm) * 0.3;
  }

  get currentTime() { return this.el?.currentTime ?? 0; }
  get duration() { return this.el?.duration ?? 0; }
  seek(t: number) { if (this.el) this.el.currentTime = t; }
}

export const SPEC = { bins: FFT_BINS, rows: SPEC_ROWS };

/** An original 122 bpm groove synthesized live, so the app works before you load anything. */
class DemoBeat {
  playing = false;
  private step = 0;
  private next = 0;
  private timer: number | undefined;
  private out: GainNode;
  private noise: AudioBuffer;
  constructor(private ctx: AudioContext, dest: AudioNode) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.out = ctx.createGain();
    this.out.gain.value = 0.8;
    this.out.connect(comp);
    comp.connect(dest);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  start() {
    if (this.playing) return;
    this.playing = true;
    this.next = this.ctx.currentTime + 0.06;
    this.timer = window.setInterval(() => this.tick(), 25);
  }
  stop() {
    this.playing = false;
    clearInterval(this.timer);
  }
  private tick() {
    const spb = 60 / 122 / 4;
    while (this.next < this.ctx.currentTime + 0.12) {
      this.play(this.step, this.next);
      this.next += spb;
      this.step = (this.step + 1) % 128;
    }
  }
  private env(g: GainNode, t: number, a: number, peak: number, dec: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  private kick(t: number) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    this.env(g, t, 0.003, 1, 0.42);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.5);
  }
  private hit(t: number, type: BiquadFilterType, f: number, q: number, peak: number, dec: number) {
    const s = this.ctx.createBufferSource(), fl = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noise;
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    this.env(g, t, 0.002, peak, dec);
    s.connect(fl).connect(g).connect(this.out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dec + 0.05);
  }
  private tone(t: number, freq: number, type: OscillatorType, peak: number, dec: number, cutoff: number, a = 0.005) {
    const o = this.ctx.createOscillator(), fl = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    fl.type = "lowpass";
    fl.frequency.setValueAtTime(cutoff * 2.5, t);
    fl.frequency.exponentialRampToValueAtTime(cutoff, t + dec * 0.6);
    this.env(g, t, a, peak, dec);
    o.connect(fl).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + a + dec + 0.05);
  }
  private play(step: number, t: number) {
    const bar = Math.floor(step / 16), s = step % 16;
    const roots = [55, 43.65, 65.41, 49];
    const chords = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]];
    const r = roots[bar % 4], ch = chords[bar % 4];
    if (s % 4 === 0 && !(bar === 7 && s >= 8)) this.kick(t);
    if (s === 4 || s === 12) this.hit(t, "bandpass", 1600, 0.8, 0.55, 0.18);
    if (s % 2 === 1) this.hit(t, "highpass", 8000, 1, 0.16, 0.04);
    if (s % 4 === 2) this.hit(t, "highpass", 7000, 1, 0.12, 0.22);
    if ([0, 3, 6, 8, 10, 14].includes(s)) this.tone(t, s === 10 ? r * 2 : r, "sawtooth", 0.34, 0.2, 380);
    if (s === 0) ch.forEach((f) => { this.tone(t, f, "sawtooth", 0.035, 1.8, 1100, 0.25); this.tone(t, f * 1.004, "sawtooth", 0.03, 1.8, 900, 0.3); });
    if (bar >= 2) { const pat = [0, 1, 2, 1, 2, 0, 1, 2]; this.tone(t, ch[pat[s % 8]] * 4, "square", 0.022, 0.12, 3800); }
  }
}
