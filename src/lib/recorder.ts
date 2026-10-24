import type { AudioEngine } from "../engine/audio";
import type { Engine } from "../engine/engine";

export type RecordOpts = { height: 1080 | 1440 | 2160; fps: 30 | 60; aspect: "16:9" | "9:16" | "1:1"; audio: boolean };

export function recordSize(o: RecordOpts): [number, number] {
  const h = o.height;
  if (o.aspect === "16:9") return [Math.round((h * 16) / 9) & ~1, h];
  if (o.aspect === "9:16") return [h, Math.round((h * 16) / 9) & ~1];
  return [h, h];
}

/** Best container the browser can write. Chrome 126+ and the desktop app write real MP4 (H.264 + AAC). */
export function pickMime(): { mime: string; ext: string } {
  const cands = [
    ["video/mp4;codecs=avc1.640033,mp4a.40.2", "mp4"],
    ["video/mp4;codecs=avc1,mp4a.40.2", "mp4"],
    ["video/mp4;codecs=avc1,opus", "mp4"],
    ["video/webm;codecs=vp9,opus", "webm"],
    ["video/webm", "webm"],
  ];
  for (const [m, e] of cands) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return { mime: m, ext: e };
  return { mime: "", ext: "webm" };
}

export class Recorder {
  rec: MediaRecorder | null = null;
  chunks: Blob[] = [];
  started = 0;
  ext = "mp4";
  constructor(private engine: Engine, private audio: AudioEngine) {}

  get active() { return !!this.rec && this.rec.state === "recording"; }
  get elapsed() { return this.active ? (performance.now() - this.started) / 1000 : 0; }

  start(o: RecordOpts) {
    const [w, h] = recordSize(o);
    this.engine.fixedSize = [w, h];
    this.engine.resize(true);
    const stream = this.engine.canvas.captureStream(o.fps);
    if (o.audio) {
      this.audio.ensure();
      this.audio.recordDest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    }
    const { mime, ext } = pickMime();
    this.ext = ext;
    const px = w * h;
    const bitrate = Math.round(Math.min(80e6, px * o.fps * 0.18));
    this.rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: bitrate, audioBitsPerSecond: 256000 });
    this.chunks = [];
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(1000);
    this.started = performance.now();
  }

  stop(): Promise<{ blob: Blob; ext: string }> {
    return new Promise((res) => {
      const r = this.rec;
      if (!r) return res({ blob: new Blob(), ext: this.ext });
      r.onstop = () => {
        this.engine.fixedSize = null;
        this.engine.resize(true);
        res({ blob: new Blob(this.chunks, { type: r.mimeType }), ext: this.ext });
        this.rec = null;
      };
      r.stop();
    });
  }
}

export function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

export const stamp = () => new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
