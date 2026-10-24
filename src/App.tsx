import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine, type SourceKind } from "./engine/audio";
import { Engine, type Emblem } from "./engine/engine";
import { PALETTES, paletteFromImage } from "./engine/palettes";
import { GLOBALS, type GlobalKey, type Look } from "./engine/params";
import { loadLanes, sample, saveLanes, writePoint, type LaneSet } from "./lib/lanes";
import { clearLicense, storedLicense, storeLicense, verifyLicense, type License } from "./lib/license";
import { cloneLook, FACTORY, freshLook, loadPresets, mixLooks, randomizeLook, randomScene, savePresets, type Preset } from "./lib/looks";
import { analyseImage, cropTo, isAudio, isImage, isVideo, loadImage, waveformPeaks, type ImageResult } from "./lib/media";
import { Midi } from "./lib/midi";
import { download, Recorder, stamp, type RecordOpts } from "./lib/recorder";
import { SCENES, sceneById } from "./scenes";
import { Icon } from "./ui/Icons";
import { Panel } from "./ui/Panel";
import { CoverSheet, HelpSheet, PaletteSheet, PresetSheet, ProSheet, RecordSheet, SceneGrid } from "./ui/Sheets";
import { Transport } from "./ui/Transport";

type SheetName = null | "scenes" | "palette" | "presets" | "help" | "record" | "pro" | "cover";
type Toast = { id: number; text: string; chips?: { label: string; run: () => void }[]; ms?: number };

const LOOK_KEY = "afterimage.look.v1";
const PREVIEW_MS = 20000;

function initialLook(): Look {
  try {
    const s = localStorage.getItem(LOOK_KEY);
    if (s) { const l = JSON.parse(s); if (l && l.scene) return { ...freshLook(), ...l }; }
  } catch { /* ignore */ }
  return { ...freshLook("ink", "gold"), trails: 60 };
}

function applyTarget(l: Look, t: string, v: number): Look {
  if (t.startsWith("g:")) return { ...l, [t.slice(2)]: v };
  if (t.startsWith("s:")) {
    const i = +t.slice(2), sc = sceneById(l.scene);
    const cur = (l.sceneValues[sc.id] ?? sc.sliders.map((s) => s.def)).slice();
    cur[i] = v;
    return { ...l, sceneValues: { ...l.sceneValues, [sc.id]: cur } };
  }
  return l;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const audio = useMemo(() => new AudioEngine(), []);
  const midi = useMemo(() => new Midi(), []);
  const recorder = useRef<Recorder | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const camStream = useRef<MediaStream | null>(null);
  const outWin = useRef<Window | null>(null);

  const [fatal, setFatal] = useState<string | null>(null);
  const [look, setLookState] = useState<Look>(initialLook);
  const lookRef = useRef(look);
  const history = useRef<Look[]>([]);
  const swapBack = useRef<Look | null>(null);
  const [panel, setPanel] = useState(false);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [proReason, setProReason] = useState<string | undefined>();
  const [presets, setPresets] = useState<Record<number, Preset>>(() => {
    const p = loadPresets();
    if (!Object.keys(p).length) FACTORY.forEach((f, i) => (p[i + 1] = { ...f, at: Date.now() }));
    return p;
  });
  const [curPreset, setCurPreset] = useState<number | null>(null);
  const [morph, setMorph] = useState(1500);
  const [src, setSrc] = useState<{ kind: SourceKind; playing: boolean; title: string; sub: string }>({ kind: "none", playing: false, title: "Nothing playing", sub: "" });
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [volume, setVol] = useState(0.9);
  const [lanes, setLanes] = useState<LaneSet>({});
  const lanesRef = useRef(lanes);
  const [armed, setArmed] = useState(false);
  const grabbed = useRef(new Set<string>());
  const lastWrite = useRef<Record<string, number>>({});
  const [learn, setLearn] = useState(false);
  const [, bump] = useState(0);
  const [license, setLicense] = useState<License | null>(() => storedLicense());
  const pro = !!license;
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [image, setImage] = useState<ImageResult | null>(null);
  const [photoPal, setPhotoPal] = useState<string[] | null>(null);
  const [emblem, setEmblemState] = useState<Emblem | null>(null);
  const [recOpts, setRecOpts] = useState<RecordOpts>({ height: 1080, fps: 60, aspect: "16:9", audio: true });
  const [recording, setRecording] = useState(false);
  const [recTime, setRecTime] = useState(0);
  const [debug, setDebug] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [idle, setIdle] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<{ until: number; back: Look } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [cameraOn, setCameraOn] = useState(false);
  const debugRef = useRef<HTMLDivElement>(null);
  const morphRaf = useRef(0);

  const scene = sceneById(look.scene);
  const allowed = useCallback((id: string) => pro || !sceneById(id).pro, [pro]);

  // ------------------------------------------------------------------ toasts
  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Math.random();
    setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.ms ?? (t.chips ? 9000 : 3200));
  }, []);

  // ------------------------------------------------------------------ look plumbing
  const pushLook = useCallback((next: Look, opts: { history?: boolean; snap?: boolean } = {}) => {
    cancelAnimationFrame(morphRaf.current);
    if (opts.history) {
      history.current.push(cloneLook(lookRef.current));
      if (history.current.length > 60) history.current.shift();
    }
    if (next.scene !== lookRef.current.scene) swapBack.current = cloneLook(lookRef.current);
    lookRef.current = next;
    setLookState(next);
    engineRef.current?.setLook(next, opts.snap);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch { /* ignore */ } }, 400);
    return () => clearTimeout(t);
  }, [look]);

  // ------------------------------------------------------------------ engine boot
  useEffect(() => {
    let e: Engine;
    try {
      e = new Engine(canvasRef.current!, audio);
    } catch (err) {
      setFatal(String((err as Error).message ?? err));
      return;
    }
    engineRef.current = e;
    e.onError = (m) => toast({ text: `Scene failed to compile: ${m.slice(0, 140)}` });
    e.setLook(lookRef.current, true);
    e.start();
    recorder.current = new Recorder(e, audio);
    audio.onChange = () => setSrc((s) => ({ ...s, kind: audio.kind, playing: audio.playing }));
    (window as unknown as { afterimage?: object }).afterimage = { engine: e, audio };
    return () => e.stop();
  }, [audio, toast]);

  // ------------------------------------------------------------------ controls
  const setTarget = useCallback((t: string, v: number) => {
    const next = applyTarget(lookRef.current, t, v);
    lookRef.current = next;
    setLookState(next);
    engineRef.current?.setLook(next);
    setCurPreset(null);
    if (armed && audio.kind === "track" && audio.playing) {
      const time = audio.currentTime;
      const ls = writePoint(lanesRef.current, t, time, v, lastWrite.current[t] ?? null);
      lastWrite.current[t] = time;
      lanesRef.current = ls;
      setLanes(ls);
    }
  }, [armed, audio]);

  const grab = useCallback((t: string, down: boolean) => {
    if (down) grabbed.current.add(t);
    else {
      grabbed.current.delete(t);
      delete lastWrite.current[t];
      if (audio.trackName && Object.keys(lanesRef.current).length) saveLanes(audio.trackName, lanesRef.current);
    }
  }, [audio]);

  // lane playback
  useEffect(() => {
    let raf = 0, lastPush = 0;
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      const L = lanesRef.current;
      if (audio.kind !== "track" || !audio.playing || !Object.keys(L).length) return;
      let l = lookRef.current, changed = false;
      for (const lane of Object.values(L)) {
        if (grabbed.current.has(lane.target)) continue;
        if (armed && lastWrite.current[lane.target] != null) continue;
        const v = sample(lane, audio.currentTime);
        if (v == null) continue;
        l = applyTarget(l, lane.target, v);
        changed = true;
      }
      if (!changed) return;
      lookRef.current = l;
      engineRef.current?.setLook(l);
      if (ts - lastPush > 90) { lastPush = ts; setLookState(l); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [audio, armed]);

  // MIDI values
  useEffect(() => {
    midi.onChange = () => bump((n) => n + 1);
    midi.onValue = (t, v) => {
      if (t.startsWith("g:")) {
        const d = GLOBALS.find((g) => g.key === t.slice(2));
        if (d) setTarget(t, d.int ? Math.round(d.min + v * (d.max - d.min)) : d.min + v * (d.max - d.min));
      } else setTarget(t, v * 100);
    };
  }, [midi, setTarget]);

  const gatePro = useCallback((reason: string) => { setProReason(reason); setSheet("pro"); }, []);

  const toggleLearn = useCallback(async () => {
    if (!pro) return gatePro("MIDI mapping is part of Pro.");
    try {
      await midi.enable();
      setLearn((v) => { if (v) midi.learn(null); return !v; });
      if (!midi.inputs.length) toast({ text: "No MIDI controller found. Plug one in; it's picked up automatically." });
      setPanel(true);
    } catch (e) {
      toast({ text: String((e as Error).message) });
    }
  }, [midi, pro, gatePro, toast]);

  // ------------------------------------------------------------------ scenes & palettes
  const pickScene = useCallback((id: string) => {
    const sc = sceneById(id);
    const next = { ...lookRef.current, scene: id };
    if (sc.pro && !pro) {
      setNow(Date.now());
      setPreview((p) => ({ until: Date.now() + PREVIEW_MS, back: p?.back ?? cloneLook(lookRef.current) }));
    } else setPreview(null);
    pushLook(next, { history: true });
    setSheet(null);
  }, [pro, pushLook]);

  useEffect(() => {
    if (!preview) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() > preview.until) {
        setPreview(null);
        if (sceneById(lookRef.current.scene).pro && !pro) {
          pushLook({ ...lookRef.current, scene: preview.back.scene });
          gatePro(`That was a 20 second preview of ${sceneById(lookRef.current.scene).name}. Pro unlocks every scene.`);
        }
      }
    }, 250);
    return () => clearInterval(t);
  }, [preview, pro, pushLook, gatePro]);

  const stepScene = useCallback((d: number) => {
    const i = SCENES.findIndex((s) => s.id === lookRef.current.scene);
    pickScene(SCENES[(i + d + SCENES.length) % SCENES.length].id);
  }, [pickScene]);

  const pickPalette = useCallback((id: string) => pushLook({ ...lookRef.current, palette: id }, { history: true }), [pushLook]);
  const stepPalette = useCallback((d: number) => {
    const ids = [...(photoPal ? ["photo"] : []), ...PALETTES.map((p) => p.id)];
    const i = ids.indexOf(lookRef.current.palette);
    pickPalette(ids[(i + d + ids.length) % ids.length]);
  }, [photoPal, pickPalette]);

  const setMode = useCallback((m: number) => {
    const l = lookRef.current;
    pushLook({ ...l, modes: { ...l.modes, [l.scene]: m } });
  }, [pushLook]);
  const stepMode = useCallback(() => {
    const sc = sceneById(lookRef.current.scene);
    if (sc.modes) setMode(((lookRef.current.modes[sc.id] ?? 0) + 1) % sc.modes.length);
  }, [setMode]);

  const randomLook = useCallback(() => pushLook(randomizeLook(lookRef.current, allowed), { history: true }), [pushLook, allowed]);
  const randomSceneOnly = useCallback(() => { setPreview(null); pushLook(randomScene(lookRef.current, allowed), { history: true }); }, [pushLook, allowed]);
  const shuffle = useCallback(() => { setPreview(null); pushLook(randomizeLook(randomScene(lookRef.current, allowed), allowed), { history: true }); }, [pushLook, allowed]);
  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (prev) { pushLook(prev); toast({ text: "Undone", ms: 1200 }); }
  }, [pushLook, toast]);
  const doSwapBack = useCallback(() => {
    const b = swapBack.current;
    if (b && (allowed(b.scene))) pushLook(b, { history: true });
  }, [pushLook, allowed]);

  // ------------------------------------------------------------------ presets
  const persist = (p: Record<number, Preset>) => { setPresets(p); savePresets(p); };
  const savePreset = useCallback((n: number) => {
    const l = lookRef.current;
    const name = `${sceneById(l.scene).name} · ${PALETTES.find((p) => p.id === l.palette)?.name ?? "Photo"}`;
    const p = { ...presets, [n]: { name, look: cloneLook(l), at: Date.now() } };
    persist(p);
    setCurPreset(n);
    toast({ text: `Saved to slot ${n}`, ms: 1500 });
  }, [presets, toast]);
  const recallPreset = useCallback((n: number) => {
    const p = presets[n];
    if (!p) return;
    if (!allowed(p.look.scene)) return gatePro(`Slot ${n} uses ${sceneById(p.look.scene).name}, a Pro scene.`);
    setCurPreset(n);
    const from = cloneLook(lookRef.current), to = cloneLook(p.look);
    if (to.palette === "photo" && !photoPal) to.palette = from.palette;
    history.current.push(from);
    if (!morph) return pushLook(to);
    cancelAnimationFrame(morphRaf.current);
    const t0 = performance.now();
    const step = (ts: number) => {
      const k = Math.min(1, (ts - t0) / morph), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const m = mixLooks(from, to, e);
      lookRef.current = m;
      engineRef.current?.setLook(m);
      setLookState(m);
      if (k < 1) morphRaf.current = requestAnimationFrame(step);
    };
    morphRaf.current = requestAnimationFrame(step);
  }, [presets, morph, pushLook, allowed, gatePro, photoPal]);

  // ------------------------------------------------------------------ sources
  const stopVideo = () => {
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ""; videoRef.current = null; }
  };
  const syncSrc = useCallback(() => setSrc({ kind: audio.kind, playing: audio.playing, title: audio.trackName || "Nothing playing", sub: audio.kind === "track" ? "Track" : audio.kind === "demo" ? "Built in" : audio.kind === "mic" ? "Live" : audio.kind === "system" ? "Live" : audio.kind === "video" ? "Video" : "" }), [audio]);

  const loadTrack = useCallback(async (f: File) => {
    stopVideo();
    await audio.loadTrack(f, f.name);
    setPeaks(null);
    const ls = loadLanes(audio.trackName);
    lanesRef.current = ls;
    setLanes(ls);
    syncSrc();
    waveformPeaks(f).then(setPeaks);
  }, [audio, syncSrc]);

  const useDemo = useCallback(() => { stopVideo(); audio.playDemo(); setPeaks(null); lanesRef.current = {}; setLanes({}); syncSrc(); }, [audio, syncSrc]);
  const useLive = useCallback(async (kind: "mic" | "system") => {
    try {
      stopVideo();
      await audio.live(kind);
      syncSrc();
      if (kind === "system") toast({ text: "Listening to your computer. Play something in Spotify, YouTube or any app." });
    } catch (e) {
      const m = String((e as Error).message || e);
      toast({ text: m === "noaudio" ? "No sound was shared. Pick a screen or tab and tick “Share audio”." : kind === "mic" ? "Microphone access was blocked." : "Sharing was cancelled." });
    }
  }, [audio, syncSrc, toast]);

  const showPicture = useCallback((c: HTMLCanvasElement, name: string) => {
    const e = engineRef.current;
    if (!e) return;
    e.setVideo(null);
    e.setImage(c);
    const pal = paletteFromImage(c, c.width, c.height);
    e.photoPalette = pal;
    setPhotoPal(pal);
    const l = lookRef.current;
    const next = { ...l, palette: "photo", scene: sceneById(l.scene).image ? l.scene : "limitless" };
    pushLook(next, { history: true });
    void name;
  }, [pushLook]);

  const useEmblem = useCallback((c: HTMLCanvasElement) => {
    const e = engineRef.current;
    if (!e) return;
    e.setEmblem(c);
    setEmblemState({ ...e.emblem });
    setPanel(true);
  }, []);

  const handleImage = useCallback(async (blob: Blob, name: string) => {
    let img: HTMLImageElement;
    try { img = await loadImage(blob); } catch (e) { toast({ text: String((e as Error).message) }); return; }
    const r = await analyseImage(img, name);
    setImage(r);
    if (r.transparent) {
      useEmblem(r.full);
      toast({ text: "Transparent image: placed as an emblem that rides the beat.", chips: [{ label: "Use as picture instead", run: () => { engineRef.current?.setEmblem(null); setEmblemState(null); showPicture(r.full, name); } }] });
      return;
    }
    showPicture(r.crop, name);
    if (r.found) {
      toast({
        text: `Album cover found · ${Math.round(r.confidence * 100)}%`,
        chips: [
          { label: "Adjust", run: () => setSheet("cover") },
          { label: "Whole image", run: () => showPicture(r.full, name) },
          { label: "As emblem", run: () => useEmblem(r.crop) },
        ],
      });
    } else {
      toast({ text: "Picture loaded. Colors taken from it.", chips: [{ label: "Pick cover", run: () => setSheet("cover") }, { label: "As emblem", run: () => useEmblem(r.full) }] });
    }
  }, [showPicture, useEmblem, toast]);

  const handleVideo = useCallback((f: File) => {
    const e = engineRef.current;
    if (!e) return;
    stopVideo();
    const v = document.createElement("video");
    v.src = URL.createObjectURL(f);
    v.loop = true;
    v.playsInline = true;
    v.crossOrigin = "anonymous";
    videoRef.current = v;
    audio.attachVideo(v);
    v.play().catch(() => {});
    e.setVideo(v);
    pushLook({ ...lookRef.current, scene: sceneById(lookRef.current.scene).image ? lookRef.current.scene : "limitless" }, { history: true });
    syncSrc();
    setSrc((s) => ({ ...s, title: f.name.replace(/\.[^.]+$/, ""), sub: "Video" }));
  }, [audio, pushLook, syncSrc]);

  const toggleCamera = useCallback(async () => {
    const e = engineRef.current;
    if (!e) return;
    if (camStream.current) {
      camStream.current.getTracks().forEach((t) => t.stop());
      camStream.current = null;
      e.clearImage();
      setCameraOn(false);
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
      camStream.current = s;
      const v = document.createElement("video");
      v.srcObject = s;
      v.muted = true;
      v.playsInline = true;
      await v.play();
      e.setVideo(v);
      setCameraOn(true);
      pushLook({ ...lookRef.current, scene: sceneById(lookRef.current.scene).image ? lookRef.current.scene : "limitless" }, { history: true });
    } catch {
      toast({ text: "Camera access was blocked." });
    }
  }, [pushLook, toast]);

  const handleFiles = useCallback((files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      if (isAudio(f)) loadTrack(f);
      else if (isImage(f)) handleImage(f, f.name);
      else if (isVideo(f)) handleVideo(f);
      else if (/\.json$/i.test(f.name)) importPresets(f);
      else toast({ text: `${f.name}: not a track, picture or video.` });
    }
  }, [loadTrack, handleImage, handleVideo, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  // paste a screenshot straight from the clipboard
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      const f = item?.getAsFile();
      if (f) handleImage(f, "Pasted image");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleImage]);

  const togglePlay = useCallback(() => {
    audio.toggle();
    if (videoRef.current) videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
    syncSrc();
  }, [audio, syncSrc]);

  // ------------------------------------------------------------------ output, stills, recording
  const saveStill = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    e.grab = (c) => c.toBlob((b) => b && download(b, `afterimage-${stamp()}.png`), "image/png");
    toast({ text: "Still saved", ms: 1400 });
  }, [toast]);

  const openOutput = useCallback(() => {
    if (!pro) return gatePro("The output window is part of Pro.");
    const e = engineRef.current;
    if (!e) return;
    if (outWin.current && !outWin.current.closed) { outWin.current.focus(); return; }
    const w = window.open("", "afterimage-output", "popup,width=1280,height=720");
    if (!w) return toast({ text: "The output window was blocked by a popup blocker." });
    w.document.title = "Afterimage output";
    w.document.body.style.cssText = "margin:0;background:#000;overflow:hidden;cursor:none";
    const v = w.document.createElement("video");
    v.style.cssText = "width:100vw;height:100vh;object-fit:contain;display:block";
    v.muted = true;
    v.autoplay = true;
    v.srcObject = e.canvas.captureStream(60);
    w.document.body.appendChild(v);
    w.document.addEventListener("dblclick", () => (w.document.fullscreenElement ? w.document.exitFullscreen() : w.document.documentElement.requestFullscreen()));
    outWin.current = w;
    toast({ text: "Output window open. Drag it to your projector and double-click for fullscreen." });
  }, [pro, gatePro, toast]);

  const startRecording = useCallback(() => {
    const r = recorder.current;
    if (!r) return;
    try {
      r.start(recOpts);
      setRecording(true);
      setSheet(null);
    } catch (e) {
      toast({ text: `Recording couldn't start: ${(e as Error).message}` });
    }
  }, [recOpts, toast]);
  const stopRecording = useCallback(async () => {
    const r = recorder.current;
    if (!r?.active) return;
    const { blob, ext } = await r.stop();
    setRecording(false);
    download(blob, `afterimage-${sceneById(lookRef.current.scene).id}-${stamp()}.${ext}`);
    toast({ text: `Saved ${(blob.size / 1e6).toFixed(1)} MB ${ext.toUpperCase()}` });
  }, [toast]);
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setRecTime(recorder.current?.elapsed ?? 0), 250);
    return () => clearInterval(t);
  }, [recording]);

  // ------------------------------------------------------------------ presets import/export
  const exportPresets = () => download(new Blob([JSON.stringify({ app: "afterimage", v: 1, presets }, null, 2)], { type: "application/json" }), `afterimage-presets-${stamp()}.json`);
  async function importPresets(f: File) {
    try {
      const j = JSON.parse(await f.text());
      if (!j.presets) throw new Error();
      persist({ ...presets, ...j.presets });
      toast({ text: `Imported ${Object.keys(j.presets).length} presets` });
    } catch { toast({ text: "That file isn't an Afterimage preset bank." }); }
  }

  // ------------------------------------------------------------------ keyboard
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key;
    if (mod && k.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
    if (mod && k.toLowerCase() === "o") { e.preventDefault(); fileInput.current?.click(); return; }
    if (mod) return;
    if (k === "Escape") { if (sheet) setSheet(null); else if (learn) { setLearn(false); midi.learn(null); } else if (hidden) setHidden(false); else setPanel(false); return; }
    if (/^Digit[1-9]$/.test(e.code)) { const n = +e.code.slice(5); e.shiftKey ? savePreset(n) : recallPreset(n); return; }
    switch (k) {
      case " ": e.preventDefault(); togglePlay(); break;
      case "Tab": e.preventDefault(); setSheet((s) => (s === "scenes" ? null : "scenes")); break;
      case "p": case "P": setSheet((s) => (s === "palette" ? null : "palette")); break;
      case "k": case "K": setSheet((s) => (s === "presets" ? null : "presets")); break;
      case "e": case "E": case "t": case "T": setPanel((v) => !v); break;
      case "ArrowRight": stepScene(1); break;
      case "ArrowLeft": stepScene(-1); break;
      case "ArrowUp": e.preventDefault(); stepPalette(1); break;
      case "ArrowDown": e.preventDefault(); stepPalette(-1); break;
      case "c": case "C": stepMode(); break;
      case "l": case "L": randomLook(); break;
      case "n": case "N": randomSceneOnly(); break;
      case "x": case "X": shuffle(); break;
      case "b": case "B": doSwapBack(); break;
      case "r": case "R": recording ? stopRecording() : setSheet((s) => (s === "record" ? null : "record")); break;
      case "s": case "S": saveStill(); break;
      case "o": case "O": openOutput(); break;
      case "f": case "F": document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); break;
      case "h": case "H": setHidden((v) => !v); break;
      case "d": case "D": setDebug((v) => !v); break;
      case "m": case "M": toggleLearn(); break;
      case "?": case "/": setSheet((s) => (s === "help" ? null : "help")); break;
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // ------------------------------------------------------------------ idle hide, drag & drop, pointer
  useEffect(() => {
    let t = 0;
    const move = (e: PointerEvent) => {
      setIdle(false);
      clearTimeout(t);
      const overUi = !!(e.target as HTMLElement)?.closest?.(".ui");
      if (!overUi) t = window.setTimeout(() => setIdle(true), 3200);
    };
    window.addEventListener("pointermove", move);
    return () => { window.removeEventListener("pointermove", move); clearTimeout(t); };
  }, []);
  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files")) { e.preventDefault(); depth++; setDragOver(true); } };
    const over = (e: DragEvent) => e.preventDefault();
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) setDragOver(false); };
    const drop = (e: DragEvent) => { e.preventDefault(); depth = 0; setDragOver(false); if (e.dataTransfer?.files.length) handleFiles(e.dataTransfer.files); };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => { window.removeEventListener("dragenter", enter); window.removeEventListener("dragover", over); window.removeEventListener("dragleave", leave); window.removeEventListener("drop", drop); };
  }, [handleFiles]);

  const stagePointer = (e: React.PointerEvent) => {
    const eng = engineRef.current;
    if (!eng) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    eng.mouse = [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height, e.buttons ? 1 : 0];
  };

  // debug overlay
  useEffect(() => {
    if (!debug) return;
    let raf = 0;
    const d = () => {
      raf = requestAnimationFrame(d);
      const e = engineRef.current, el = debugRef.current;
      if (!e || !el) return;
      const b = audio.bands;
      el.innerHTML = [
        `fps <b>${e.fps.toFixed(0)}</b>  scale <b>${e.renderScale.toFixed(2)}</b>`,
        `output <b>${e.width}×${e.height}</b>`,
        `exposure <b>${e.exposure.toFixed(2)}</b>`,
        `bass <b>${b.bass.toFixed(2)}</b> mid <b>${b.mid.toFixed(2)}</b> high <b>${b.high.toFixed(2)}</b>`,
        `kick <b>${b.kick.toFixed(2)}</b> accent <b>${b.accent.toFixed(2)}</b>`,
        `tempo <b>${b.bpm.toFixed(1)}</b> beats <b>${b.beats}</b>`,
        `source <b>${audio.kind}</b>  midi <b>${midi.inputs.length}</b>`,
      ].join("<br>");
    };
    raf = requestAnimationFrame(d);
    return () => cancelAnimationFrame(raf);
  }, [debug, audio, midi]);

  // ------------------------------------------------------------------ render
  if (fatal) {
    return (
      <div className="empty" style={{ pointerEvents: "auto" }}>
        <h1>Afterimage needs WebGL2</h1>
        <p>{fatal}</p>
        <p>Try the latest Chrome, Edge, Safari 17+ or Firefox, or the desktop app.</p>
      </div>
    );
  }

  const values = sceneValuesOf(look);
  const nothing = src.kind === "none" && !image && !cameraOn;
  const previewLeft = preview ? Math.max(0, Math.ceil((preview.until - now) / 1000)) : 0;
  const modeName = scene.modes ? scene.modes[look.modes[scene.id] ?? 0] : null;

  return (
    <div className={`app${idle && !sheet && !learn && !nothing ? " idle" : ""}${hidden ? " hidden" : ""}`}>
      <div className={`stage${recording ? " fixed" : ""}`} onPointerMove={stagePointer} onPointerDown={stagePointer} onPointerUp={stagePointer} onDoubleClick={() => setPanel((v) => !v)}>
        <canvas ref={canvasRef} />
      </div>

      <header className="top ui">
        <div className="brand glass"><div className="mark" /><b>Afterimage</b></div>
        <button className="scenechip glass" onClick={() => setSheet("scenes")}>
          <span className="k">Scene</span><span className="n">{scene.name}</span>{modeName && <span className="m">· {modeName}</span>}
          {scene.pro && !pro && <span className="pro-badge">PRO</span>}
        </button>
        <div className="spacer" />
        {!pro && <button className="pro-btn glass" onClick={() => { setProReason(undefined); setSheet("pro"); }}><span className="pro-badge">PRO</span>Unlock</button>}
        <div className="tools glass">
          <button className={`ib${sheet === "scenes" ? " on" : ""}`} onClick={() => setSheet("scenes")} data-tip="Scenes · Tab"><Icon.grid /></button>
          <button className={`ib${sheet === "palette" ? " on" : ""}`} onClick={() => setSheet("palette")} data-tip="Palette · P"><Icon.palette /></button>
          <button className={`ib${sheet === "presets" ? " on" : ""}`} onClick={() => setSheet("presets")} data-tip="Presets · K"><Icon.bank /></button>
          <button className={`ib${panel ? " on" : ""}`} onClick={() => setPanel((v) => !v)} data-tip="Tuning · E"><Icon.sliders /></button>
          <button className="ib" onClick={randomLook} data-tip="Randomize · L"><Icon.dice /></button>
          <div className="sep" />
          <button className="ib" onClick={saveStill} data-tip="Still · S"><Icon.still /></button>
          <button className={`ib${recording ? " on" : ""}`} onClick={() => (recording ? stopRecording() : setSheet("record"))} data-tip="Record · R"><Icon.rec />{recording && <span className="dot" />}</button>
          <button className="ib" onClick={openOutput} data-tip="Output window · O"><Icon.screen /></button>
          <button className="ib" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}))} data-tip="Fullscreen · F"><Icon.full /></button>
          <button className="ib" onClick={() => setSheet("help")} data-tip="Shortcuts · ?"><Icon.help /></button>
        </div>
      </header>

      {preview && previewLeft > 0 && (
        <div className="preview-pill glass ui">
          <span className="pro-badge">PRO</span><span>Previewing · {previewLeft}s</span>
          <button className="btn primary" style={{ height: 26 }} onClick={() => gatePro(`Keep ${scene.name} and every other scene with Pro.`)}>Unlock</button>
        </div>
      )}

      {debug && <div className="debug glass" ref={debugRef} />}

      {nothing && !hidden && (
        <div className="empty ui">
          <h1>Make the music visible.</h1>
          <p>Drop a song, a photo, or a screenshot of what's playing.<br />Album covers are found automatically.</p>
          <div className="row">
            <button className="btn primary" onClick={useDemo}><Icon.play /> Play the demo</button>
            <button className="btn" onClick={() => fileInput.current?.click()}><Icon.music /> Open a file</button>
            <button className="btn" onClick={() => useLive("system")}><Icon.speaker /> Use computer audio</button>
          </div>
        </div>
      )}

      <Panel
        open={panel} look={look} scene={scene} values={values}
        set={setTarget} grab={grab} setMode={setMode}
        learn={{ on: learn, learning: midi.learning, tag: (t) => { const m = midi.mapped(t); return m ? m.replace(/^cc:\d+:/, "CC").replace(/^n:\d+:/, "N") : null; }, pick: (t) => midi.learn(t) }}
        automated={(t) => !!lanes[t]?.pts.length}
        emblem={emblem}
        setEmblem={(p) => { const e = engineRef.current; if (!e) return; Object.assign(e.emblem, p); setEmblemState({ ...e.emblem }); }}
        removeEmblem={() => { engineRef.current?.setEmblem(null); setEmblemState(null); }}
        onClose={() => setPanel(false)} onRandom={randomLook}
        onResetScene={() => { const l = lookRef.current; const sv = { ...l.sceneValues }; delete sv[l.scene]; pushLook({ ...l, sceneValues: sv }, { history: true }); }}
        armed={armed} setArmed={setArmed} hasTrack={src.kind === "track"}
        clearLanes={() => { lanesRef.current = {}; setLanes({}); saveLanes(audio.trackName, {}); }}
        laneCount={Object.keys(lanes).length}
        midiOn={learn} toggleLearn={toggleLearn}
      />

      <Transport
        audio={audio} kind={src.kind} playing={src.playing} title={src.title} subtitle={src.sub}
        peaks={peaks} lanes={lanes} volume={volume}
        setVolume={(v) => { setVol(v); audio.setVolume(v); }}
        onToggle={togglePlay} onDemo={useDemo} onOpen={() => fileInput.current?.click()}
        onMic={() => useLive("mic")} onSystem={() => useLive("system")} onCamera={toggleCamera} cameraOn={cameraOn}
      />

      <div className="toasts ui">
        {toasts.map((t) => (
          <div key={t.id} className="toast glass">
            <span>{t.text}</span>
            {t.chips && <div className="chips">{t.chips.map((c) => <button key={c.label} className="btn" onClick={() => { c.run(); setToasts((ts) => ts.filter((x) => x.id !== t.id)); }}>{c.label}</button>)}</div>}
          </div>
        ))}
      </div>

      {recording && (
        <div className="recpill glass">
          <span className="r" /><span className="num">{Math.floor(recTime / 60)}:{String(Math.floor(recTime % 60)).padStart(2, "0")}</span>
          <button className="btn" style={{ height: 26 }} onClick={stopRecording}><Icon.stop /> Stop</button>
        </div>
      )}

      {dragOver && <div className="drop">Drop to load<small>Tracks · photos · screenshots · videos · preset banks</small></div>}

      {sheet === "scenes" && <SceneGrid current={look.scene} pro={pro} onPick={pickScene} onClose={() => setSheet(null)} />}
      {sheet === "palette" && <PaletteSheet current={look.palette} photo={photoPal} onPick={pickPalette} onClose={() => setSheet(null)} />}
      {sheet === "presets" && <PresetSheet presets={presets} current={curPreset} morph={morph} setMorph={setMorph} onRecall={(n) => { recallPreset(n); }} onSave={savePreset} onClear={(n) => { const p = { ...presets }; delete p[n]; persist(p); }} onExport={exportPresets} onImport={importPresets} onClose={() => setSheet(null)} />}
      {sheet === "help" && <HelpSheet onClose={() => setSheet(null)} />}
      {sheet === "record" && <RecordSheet pro={pro} opts={recOpts} setOpts={setRecOpts} onStart={startRecording} onClose={() => setSheet(null)} onPro={() => gatePro("1440p and 4K recording are part of Pro.")} />}
      {sheet === "pro" && <ProSheet license={license} reason={proReason} onActivate={(k) => { storeLicense(k); setLicense(verifyLicense(k)); setPreview(null); toast({ text: "Pro unlocked. Enjoy." }); setSheet(null); }} onDeactivate={() => { clearLicense(); setLicense(null); setSheet(null); }} onClose={() => setSheet(null)} />}
      {sheet === "cover" && image && (
        <CoverSheet full={image.full} box={image.box} found={image.found} confidence={image.confidence}
          onApply={(b) => { showPicture(cropTo(image, b), image.name); setSheet(null); }}
          onWhole={() => { showPicture(image.full, image.name); setSheet(null); }}
          onEmblem={() => { useEmblem(image.crop); setSheet(null); }}
          onClose={() => setSheet(null)} />
      )}

      <input ref={fileInput} type="file" hidden multiple accept="audio/*,image/*,video/*,.json" onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }} />
    </div>
  );
}

function sceneValuesOf(l: Look): number[] {
  const sc = sceneById(l.scene), v = l.sceneValues[sc.id];
  return sc.sliders.map((s, i) => (v && v[i] != null ? v[i] : s.def));
}

export type { GlobalKey };
