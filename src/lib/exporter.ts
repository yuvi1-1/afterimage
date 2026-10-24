import { ArrayBufferTarget, FileSystemWritableFileStreamTarget, Muxer } from "mp4-muxer";
import type { Engine } from "../engine/engine";
import { OfflineAnalyzer } from "../engine/offline";
import { recordSize, type RecordOpts } from "./recorder";

/**
 * Offline video export: renders a track frame by frame at a fixed rate, analysing the audio
 * offline, and encodes straight to MP4 with WebCodecs. Never drops a frame, whatever the GPU,
 * and runs faster than real time on most machines.
 */
export type ExportOpts = RecordOpts & { start: number; end: number; quality: "standard" | "high" };
export type ExportProgress = { frame: number; frames: number; elapsed: number; eta: number; speed: number };
export type SaveTarget = { kind: "file"; handle: FileSystemFileHandle; name: string } | { kind: "memory"; name: string };

export const exportSupported = () => typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";

/** Ask where to save (must be called straight from a click). Falls back to an in-memory download. */
export async function pickSaveTarget(name: string): Promise<SaveTarget | null> {
  const w = window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle> };
  if (!w.showSaveFilePicker) return { kind: "memory", name };
  try {
    const handle = await w.showSaveFilePicker({ suggestedName: name, types: [{ description: "MP4 video", accept: { "video/mp4": [".mp4"] } }] });
    return { kind: "file", handle, name: handle.name };
  } catch (e) {
    if ((e as DOMException)?.name === "AbortError") return null; // user cancelled
    return { kind: "memory", name };
  }
}

/** Smallest H.264 High-profile level that fits the size and frame rate. */
function avcCodec(w: number, h: number, fps: number) {
  const fs = Math.ceil(w / 16) * Math.ceil(h / 16), mbps = fs * fps;
  const levels: [string, number, number][] = [["28", 245760, 8192], ["2A", 522240, 8704], ["32", 589824, 22080], ["33", 983040, 36864], ["34", 2073600, 36864], ["3C", 4177920, 139264]];
  const l = levels.find(([, m, f]) => mbps <= m && fs <= f) ?? levels[levels.length - 1];
  return `avc1.6400${l[0]}`;
}

async function pickVideoConfig(w: number, h: number, fps: number, bitrate: number) {
  const cands: { codec: string; mux: "avc" | "vp9" | "av1" }[] = [
    { codec: avcCodec(w, h, fps), mux: "avc" },
    { codec: "vp09.00.51.08", mux: "vp9" },
    { codec: "av01.0.12M.08", mux: "av1" },
  ];
  for (const c of cands) {
    const config: VideoEncoderConfig = { codec: c.codec, width: w, height: h, bitrate, framerate: fps, latencyMode: "quality", ...(c.mux === "avc" ? { avc: { format: "avc" } } : {}) };
    try {
      const s = await VideoEncoder.isConfigSupported(config);
      if (s.supported) return { config: s.config ?? config, mux: c.mux };
    } catch { /* try the next codec */ }
  }
  throw new Error("This browser can't encode video. Use Chrome, Edge or the desktop app.");
}

async function pickAudioConfig(sampleRate: number) {
  if (typeof AudioEncoder === "undefined") return null;
  const cands: { config: AudioEncoderConfig; mux: "aac" | "opus" }[] = [
    { config: { codec: "mp4a.40.2", sampleRate, numberOfChannels: 2, bitrate: 256000 }, mux: "aac" },
    { config: { codec: "opus", sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 }, mux: "opus" },
  ];
  for (const c of cands) {
    try { if ((await AudioEncoder.isConfigSupported(c.config)).supported && c.config.sampleRate === sampleRate) return c; } catch { /* next */ }
  }
  return null;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export async function exportVideo(
  engine: Engine,
  buffer: AudioBuffer,
  opts: ExportOpts,
  target: SaveTarget,
  hooks: { beforeFrame?: (t: number) => void; onProgress?: (p: ExportProgress) => void; signal: AbortSignal },
): Promise<{ blob: Blob | null; bytes: number; codec: string }> {
  if (!exportSupported()) throw new Error("Video export needs Chrome, Edge or the desktop app.");
  const [w, h] = recordSize(opts);
  const fps = opts.fps;
  const start = Math.max(0, Math.min(opts.start, buffer.duration));
  const end = Math.max(start + 0.5, Math.min(opts.end, buffer.duration));
  const frames = Math.round((end - start) * fps);
  const bitrate = Math.round(Math.min(120e6, w * h * fps * (opts.quality === "high" ? 0.25 : 0.12)));
  const vc = await pickVideoConfig(w, h, fps, bitrate);
  const ac = await pickAudioConfig(buffer.sampleRate);

  let stream: FileSystemWritableFileStream | null = null;
  let memTarget: ArrayBufferTarget | null = null;
  let muxTarget: ArrayBufferTarget | FileSystemWritableFileStreamTarget;
  if (target.kind === "file") {
    stream = await target.handle.createWritable();
    muxTarget = new FileSystemWritableFileStreamTarget(stream);
  } else muxTarget = memTarget = new ArrayBufferTarget();

  const muxer = new Muxer({
    target: muxTarget,
    video: { codec: vc.mux, width: w, height: h, frameRate: fps },
    ...(ac ? { audio: { codec: ac.mux, numberOfChannels: 2, sampleRate: ac.config.sampleRate } } : {}),
    fastStart: memTarget ? "in-memory" : false,
    firstTimestampBehavior: "offset",
  });

  let failure: Error | null = null;
  const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failure = e as Error; } });
  venc.configure(vc.config);
  const aenc = ac ? new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { failure = e as Error; } }) : null;
  aenc?.configure(ac!.config);

  // audio is fed in step with the video so the muxer can interleave
  const sr = buffer.sampleRate;
  const L = buffer.getChannelData(0), R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  let audioPos = Math.floor(start * sr);
  const audioEnd = Math.floor(end * sr);
  const feedAudio = (untilSec: number) => {
    if (!aenc) return;
    const until = Math.min(audioEnd, Math.floor(untilSec * sr));
    while (audioPos < until) {
      const n = Math.min(4096, until - audioPos);
      const data = new Float32Array(n * 2);
      data.set(L.subarray(audioPos, audioPos + n), 0);
      data.set(R.subarray(audioPos, audioPos + n), n);
      const ad = new AudioData({ format: "f32-planar", sampleRate: sr, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(((audioPos / sr) - start) * 1e6), data });
      aenc.encode(ad);
      ad.close();
      audioPos += n;
    }
  };

  const analyzer = new OfflineAnalyzer(buffer);
  const video = engine.video && !engine.video.srcObject ? engine.video : null;
  const seekVideo = async (t: number) => {
    if (!video || !video.duration) return;
    const target = t % video.duration;
    if (Math.abs(video.currentTime - target) < 0.5 / fps) return;
    await new Promise<void>((res) => {
      const done = () => { video.removeEventListener("seeked", done); res(); };
      video.addEventListener("seeked", done);
      video.currentTime = target;
      setTimeout(done, 1500);
    });
  };

  // take over the engine
  const wasPlayingVideo = video && !video.paused;
  video?.pause();
  engine.stop();
  engine.offline = true;
  const prevScale = engine.renderScale;
  engine.renderScale = 1;
  engine.fixedSize = [w, h];
  engine.resize(true);
  const dt = 1 / fps;
  const t0 = performance.now();
  try {
    // pre-roll one second so trails, simulations and smoothing settle before the first frame
    for (let t = Math.max(0, start - 1); t < start - dt / 2; t += dt) {
      hooks.beforeFrame?.(t);
      engine.renderFrame(dt, t * 1000, analyzer.at(t));
    }
    for (let i = 0; i < frames; i++) {
      if (hooks.signal.aborted) throw new DOMException("Export cancelled", "AbortError");
      if (failure) throw failure;
      const t = start + i / fps;
      hooks.beforeFrame?.(t);
      await seekVideo(t);
      engine.renderFrame(dt, t * 1000, analyzer.at(t));
      const vf = new VideoFrame(engine.canvas, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
      venc.encode(vf, { keyFrame: i % (fps * 2) === 0 });
      vf.close();
      feedAudio(t + dt);
      while (venc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 2));
      if (i % 3 === 0) {
        await tick();
        const elapsed = (performance.now() - t0) / 1000;
        const speed = (i + 1) / fps / Math.max(elapsed, 1e-3);
        hooks.onProgress?.({ frame: i + 1, frames, elapsed, eta: (frames - i - 1) / fps / Math.max(speed, 1e-3), speed });
      }
    }
    feedAudio(end);
    await venc.flush();
    if (aenc) await aenc.flush();
    if (failure) throw failure;
    muxer.finalize();
    let blob: Blob | null = null, bytes = 0;
    if (memTarget) { blob = new Blob([memTarget.buffer], { type: "video/mp4" }); bytes = blob.size; }
    if (stream) { await stream.close(); bytes = (await (target as { handle: FileSystemFileHandle }).handle.getFile()).size; }
    hooks.onProgress?.({ frame: frames, frames, elapsed: (performance.now() - t0) / 1000, eta: 0, speed: frames / fps / ((performance.now() - t0) / 1000) });
    return { blob, bytes, codec: vc.config.codec };
  } catch (e) {
    try { venc.close(); } catch { /* already closed */ }
    try { aenc?.close(); } catch { /* already closed */ }
    try { await stream?.abort(); } catch { /* ignore */ }
    throw e;
  } finally {
    engine.offline = false;
    engine.fixedSize = null;
    engine.renderScale = prevScale;
    engine.resize(true);
    engine.start();
    if (wasPlayingVideo) video!.play().catch(() => {});
  }
}
