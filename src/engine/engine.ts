import { SCENES, sceneById } from "../scenes";
import type { Scene, Sim } from "../scenes/types";
import { AudioEngine, SPEC, type ExtAudioFrame } from "./audio";
import { freeFBO, makeFBO, Pair, program, texParams, type FBO, type Program } from "./gl";
import { FEEDBACK, FINAL, LUMA, PRELUDE, SCENE_MAIN } from "./glsl";
import { hexToRgb, PALETTES } from "./palettes";
import { GLOBALS, type GlobalKey, type Look } from "./params";

export type Emblem = { on: boolean; clean: boolean; size: number; opacity: number; pulse: number; spin: number; white: boolean; invert: boolean; aspect: number };

/**
 * Renders the visuals. Pipeline per frame:
 * scene (or sim) -> trails feedback (HDR, mipmapped) -> final composite (transforms, lens, bloom, grade).
 */
export class Engine {
  gl: WebGL2RenderingContext;
  audio: AudioEngine;
  look!: Look;
  /** smoothed copies of numeric params */
  cur: Record<string, number> = {};
  curScene: number[] = [0, 0, 0, 0, 0, 0];
  scene: Scene = SCENES[0];
  sim: Sim | null = null;
  programs = new Map<string, Program>();
  feedback: Program;
  final: Program;
  luma: Program;
  vao: WebGLVertexArrayObject;
  sceneFBO: FBO | null = null;
  acc: Pair | null = null;
  lumaFBO: FBO;
  imgTex: WebGLTexture;
  emblemTex: WebGLTexture;
  capTex: WebGLTexture;
  /** Title / lyric overlay (see lib/captions.ts) */
  caption = { on: false, alpha: 1, pulse: 0.4, tint: 0 };
  fftTex: WebGLTexture;
  waveTex: WebGLTexture;
  specTex: WebGLTexture;
  imgAspect = 1;
  hasImage = false;
  video: HTMLVideoElement | null = null;
  photoPalette: string[] | null = null;
  emblem: Emblem = { on: false, clean: false, size: 0.45, opacity: 1, pulse: 0.5, spin: 0, white: false, invert: false, aspect: 1 };
  palCur: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
  width = 0;
  height = 0;
  fixedSize: [number, number] | null = null;
  renderScale = 1;
  time = 0;
  sceneTime = 0;
  hue = 0;
  spinAngle = 0;
  exposure = 1;
  fps = 60;
  mouse = [0, 0, 0];
  error: string | null = null;
  onError: ((e: string) => void) | null = null;
  private frameCount = 0;
  private last = performance.now();
  private raf = 0;
  private fpsAcc = 0;
  private fpsN = 0;
  private slow = 0;
  private fast = 0;
  grab: ((c: HTMLCanvasElement) => void) | null = null;

  constructor(public canvas: HTMLCanvasElement, audio: AudioEngine) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("This browser has no WebGL2, which the visuals need.");
    this.gl = gl;
    this.audio = audio;
    if (!gl.getExtension("EXT_color_buffer_float")) throw new Error("This GPU can't render to float textures (EXT_color_buffer_float).");
    gl.getExtension("OES_texture_float_linear");
    this.vao = gl.createVertexArray()!;
    this.feedback = program(gl, FEEDBACK);
    this.final = program(gl, FINAL);
    this.luma = program(gl, LUMA);
    this.lumaFBO = makeFBO(gl, 1, 1, { float: false });
    const tex = (w: number, h: number, fmt: "R" | "RGBA", wrap: number, mip = false) => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      if (fmt === "R") gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      texParams(gl, wrap, mip);
      return t;
    };
    this.fftTex = tex(SPEC.bins, 1, "R", gl.CLAMP_TO_EDGE);
    this.waveTex = tex(SPEC.bins, 1, "RGBA", gl.CLAMP_TO_EDGE);
    this.specTex = tex(SPEC.bins, SPEC.rows, "R", gl.REPEAT);
    this.imgTex = tex(1, 1, "RGBA", gl.MIRRORED_REPEAT, true);
    this.emblemTex = tex(1, 1, "RGBA", gl.CLAMP_TO_EDGE);
    this.capTex = tex(1, 1, "RGBA", gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 20, 28, 255]));
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); setTimeout(() => location.reload(), 500); });
  }

  // ---------------------------------------------------------------- state
  setLook(look: Look, snap = false) {
    this.look = look;
    const sc = sceneById(look.scene);
    if (sc.id !== this.scene.id || (!this.sim && sc.sim) || !this.programs.size) this.switchScene(sc);
    if (snap) {
      for (const d of GLOBALS) this.cur[d.key] = look[d.key];
      this.curScene = this.sceneValues().slice();
    }
  }

  sceneValues(): number[] {
    const v = this.look.sceneValues[this.scene.id];
    return this.scene.sliders.map((s, i) => (v && v[i] != null ? v[i] : s.def));
  }

  private switchScene(sc: Scene) {
    if (this.sim) { this.sim.dispose(this); this.sim = null; }
    this.scene = sc;
    this.sceneTime = 0;
    if (sc.sim) {
      this.sim = sc.sim();
      try { this.sim.init(this); } catch (e) { this.fail(e); }
    } else this.sceneProgram(sc);
    this.curScene = this.sceneValues().slice();
    this.resize(true);
  }

  sceneProgram(sc: Scene): Program | null {
    let p = this.programs.get(sc.id);
    if (!p && sc.frag) {
      try {
        p = program(this.gl, PRELUDE + sc.frag + SCENE_MAIN);
        this.programs.set(sc.id, p);
      } catch (e) { this.fail(e); return null; }
    }
    return p ?? null;
  }

  private fail(e: unknown) {
    this.error = String((e as Error)?.message ?? e);
    console.error(this.error);
    this.onError?.(this.error);
  }

  setImage(src: TexImageSource & { width: number; height: number }) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    this.imgAspect = src.width / src.height;
    this.hasImage = true;
  }

  setVideo(v: HTMLVideoElement | null) {
    this.video = v;
    if (v) this.hasImage = true;
  }

  clearImage() {
    this.video = null;
    this.hasImage = false;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 20, 28, 255]));
  }

  setEmblem(src: (TexImageSource & { width: number; height: number }) | null) {
    if (!src) { this.emblem.on = false; return; }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.emblemTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.emblem.aspect = src.width / src.height;
    this.emblem.on = true;
  }

  setCaption(src: (TexImageSource & { width: number; height: number }) | null) {
    if (!src) { this.caption.on = false; return; }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.capTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.caption.on = true;
  }

  // ---------------------------------------------------------------- sizing
  resize(force = false) {
    const c = this.canvas;
    let w: number, h: number;
    if (this.fixedSize) [w, h] = this.fixedSize;
    else {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.round(c.clientWidth * dpr);
      h = Math.round(c.clientHeight * dpr);
      const cap = 2560 / Math.max(w, h);
      if (cap < 1) { w = Math.round(w * cap); h = Math.round(h * cap); }
    }
    w = Math.max(2, w & ~1);
    h = Math.max(2, h & ~1);
    if (!force && w === this.width && h === this.height && this.sceneFBO) return;
    this.width = w;
    this.height = h;
    c.width = w;
    c.height = h;
    const gl = this.gl;
    this.acc?.free();
    this.acc = new Pair(gl, w, h, { mip: true });
    const s = (this.scene.scale ?? 1) * this.renderScale;
    freeFBO(gl, this.sceneFBO);
    this.sceneFBO = makeFBO(gl, Math.max(2, Math.round(w * s)), Math.max(2, Math.round(h * s)));
  }

  // ---------------------------------------------------------------- loop
  start() {
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() { cancelAnimationFrame(this.raf); }

  /** shared uniforms for scene programs */
  bindSceneUniforms(p: Program, w: number, h: number) {
    const gl = this.gl, u = p.u, b = this.audio.bands, r = this.react;
    gl.uniform2f(u.uRes, w, h);
    gl.uniform1f(u.uTime, this.time);
    gl.uniform1f(u.uT, this.sceneTime);
    gl.uniform1f(u.uBass, b.bass * r);
    gl.uniform1f(u.uMid, b.mid * r);
    gl.uniform1f(u.uHigh, b.high * r);
    gl.uniform1f(u.uLevel, b.level * r);
    gl.uniform1f(u.uKick, b.kick * r);
    gl.uniform1f(u.uAccent, b.accent * r);
    gl.uniform1f(u.uBeatPhase, b.beatPhase);
    gl.uniform1f(u.uReact, r);
    gl.uniform1f(u.uChaos, this.cur.chaos / 100);
    gl.uniform1f(u.uSpecRow, this.audio.specRow / SPEC.rows);
    gl.uniform1f(u.uImgAspect, this.imgAspect);
    gl.uniform1f(u.uHasImg, this.hasImage ? 1 : 0);
    gl.uniform1fv(u.uS, this.curScene.map((v) => v / 100).concat([0, 0, 0, 0, 0, 0]).slice(0, 6));
    gl.uniform1i(u.uMode, this.look.modes[this.scene.id] ?? 0);
    gl.uniform3fv(u.uPal, this.palCur.flat());
    gl.uniform3f(u.uMouse, this.mouse[0], this.mouse[1], this.mouse[2]);
    const tex: [string, WebGLTexture][] = [["uFFT", this.fftTex], ["uWave", this.waveTex], ["uSpec", this.specTex], ["uImg", this.imgTex], ["uPrev", this.acc!.read.tex]];
    tex.forEach(([name, t], i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      if (u[name]) gl.uniform1i(u[name], i);
    });
  }

  get react() { return (this.cur.react ?? 70) / 100 * 1.45; }

  draw() {
    this.gl.bindVertexArray(this.vao);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  frame(now: number) {
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (!this.look) return;
    this.renderFrame(dt, now);
  }

  /** Offline rendering (video export) drives the engine itself, one fixed step at a time. */
  offline = false;

  /** Render one frame. `ext` supplies pre-analysed audio (offline export) instead of the live analyser. */
  renderFrame(dt: number, now: number, ext?: ExtAudioFrame) {
    const gl = this.gl;
    this.resize();
    // smooth params
    const k = 1 - Math.exp(-dt * 9);
    for (const d of GLOBALS) {
      const t = this.look[d.key as GlobalKey];
      if (this.cur[d.key] == null || d.int) this.cur[d.key] = t;
      else this.cur[d.key] += (t - this.cur[d.key]) * k;
    }
    const tv = this.sceneValues();
    this.curScene = tv.map((v, i) => (this.curScene[i] ?? v) + (v - (this.curScene[i] ?? v)) * k);
    // palette
    const stops = this.look.palette === "photo" && this.photoPalette ? this.photoPalette : (PALETTES.find((p) => p.id === this.look.palette) ?? PALETTES[0]).c;
    const pk = 1 - Math.exp(-dt * 4);
    stops.forEach((h, i) => { const c = hexToRgb(h); for (let j = 0; j < 3; j++) this.palCur[i][j] += (c[j] - this.palCur[i][j]) * pk; });
    // audio
    const gain = Math.pow(4, (this.cur.gain - 50) / 50);
    this.audio.update(dt, now, gain, this.cur.decay / 100, ext);
    const b = this.audio.bands;
    const speed = this.scene.sliders[0]?.label === "speed" ? 0.15 + (this.curScene[0] / 50) * 0.85 : 1;
    this.time += dt;
    this.sceneTime += dt * speed * (1 + b.level * this.react * 0.5);
    this.hue += dt * (this.cur.hueDrift / 100) * 0.9;
    this.spinAngle += dt * (this.cur.spin / 100) * 0.8;
    // textures
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.bindTexture(gl.TEXTURE_2D, this.fftTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SPEC.bins, 1, gl.RED, gl.UNSIGNED_BYTE, this.audio.fftTex);
    gl.bindTexture(gl.TEXTURE_2D, this.waveTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SPEC.bins, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.audio.waveTex);
    gl.bindTexture(gl.TEXTURE_2D, this.specTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SPEC.bins, SPEC.rows, gl.RED, gl.UNSIGNED_BYTE, this.audio.specTex);
    if (this.video && this.video.readyState >= 2 && this.video.videoWidth) {
      gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.generateMipmap(gl.TEXTURE_2D);
      this.imgAspect = this.video.videoWidth / this.video.videoHeight;
    }
    const sf = this.sceneFBO!, acc = this.acc!;
    // 1) scene
    if (this.sim) {
      try { this.sim.render(this, sf, dt); } catch (e) { this.fail(e); this.sim = null; }
    } else {
      const p = this.sceneProgram(this.scene);
      if (p) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, sf.fb);
        gl.viewport(0, 0, sf.w, sf.h);
        gl.useProgram(p.p);
        this.bindSceneUniforms(p, sf.w, sf.h);
        this.draw();
      }
    }
    // 2) feedback
    gl.bindFramebuffer(gl.FRAMEBUFFER, acc.write.fb);
    gl.viewport(0, 0, this.width, this.height);
    const f = this.feedback;
    gl.useProgram(f.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sf.tex); gl.uniform1i(f.u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, acc.read.tex); gl.uniform1i(f.u.uPrevAcc, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.emblemTex); gl.uniform1i(f.u.uEmblem, 2);
    gl.uniform2f(f.u.uRes, this.width, this.height);
    gl.uniform1f(f.u.uTrails, this.cur.trails / 100);
    gl.uniform1f(f.u.uChaos, this.cur.chaos / 100);
    gl.uniform1f(f.u.uBass, b.bass * this.react);
    gl.uniform1f(f.u.uKick, b.kick * this.react);
    gl.uniform1f(f.u.uTime, this.time);
    this.emblemUniforms(f, this.emblem.on && !this.emblem.clean);
    gl.uniform3fv(f.u.uPal, this.palCur.flat());
    this.draw();
    gl.bindTexture(gl.TEXTURE_2D, acc.write.tex);
    gl.generateMipmap(gl.TEXTURE_2D);
    acc.swap();
    // auto exposure (skipped for photos and video on the image scene)
    if (++this.frameCount % 8 === 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.lumaFBO.fb);
      gl.viewport(0, 0, 1, 1);
      gl.useProgram(this.luma.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, acc.read.tex); gl.uniform1i(this.luma.u.uAcc, 0);
      this.draw();
      const px = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const l = Math.max(0.02, px[0] / 255);
      const target = this.scene.image && this.hasImage ? 1 : Math.min(1.7, Math.max(0.5, 0.2 / l));
      this.exposure += (target - this.exposure) * 0.25;
    }
    // 3) final
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    const F = this.final;
    gl.useProgram(F.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, acc.read.tex); gl.uniform1i(F.u.uAcc, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.emblemTex); gl.uniform1i(F.u.uEmblem, 1);
    gl.uniform2f(F.u.uRes, this.width, this.height);
    gl.uniform1f(F.u.uTime, this.time);
    gl.uniform1f(F.u.uBass, b.bass * this.react);
    gl.uniform1f(F.u.uMid, b.mid * this.react);
    gl.uniform1f(F.u.uHigh, b.high * this.react);
    gl.uniform1f(F.u.uKick, b.kick * this.react);
    gl.uniform1f(F.u.uAccent, b.accent * this.react);
    gl.uniform1f(F.u.uHeat, this.cur.heat / 100);
    gl.uniform1f(F.u.uBright, Math.pow(2, (this.cur.brightness - 50) / 50 * 1.0) * (this.cur.brightness < 50 ? 1 : 1.2));
    gl.uniform1f(F.u.uExposure, this.exposure);
    gl.uniform1f(F.u.uHue, this.hue);
    gl.uniform1f(F.u.uVig, this.cur.vignette / 100);
    gl.uniform1f(F.u.uChaos, this.cur.chaos / 100);
    gl.uniform1f(F.u.uSym, Math.round(this.cur.symmetry));
    gl.uniform1f(F.u.uTiles, Math.round(this.cur.tiles));
    gl.uniform1f(F.u.uTwist, this.cur.twist / 100);
    gl.uniform1f(F.u.uSlice, this.cur.slice / 100);
    gl.uniform1f(F.u.uSpin, this.spinAngle);
    gl.uniform1f(F.u.uLens, this.cur.lens / 100);
    gl.uniform1f(F.u.uLensStyle, Math.round(this.cur.lensStyle));
    this.emblemUniforms(F, this.emblem.on && this.emblem.clean);
    gl.uniform1f(F.u.uEmblemClean, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.capTex); gl.uniform1i(F.u.uCap, 2);
    gl.uniform1f(F.u.uCapOn, this.caption.on ? 1 : 0);
    gl.uniform1f(F.u.uCapAlpha, this.caption.alpha);
    gl.uniform1f(F.u.uCapPulse, this.caption.pulse);
    gl.uniform1f(F.u.uCapTint, this.caption.tint);
    gl.uniform3fv(F.u.uPal, this.palCur.flat());
    this.draw();
    if (this.grab) { const g = this.grab; this.grab = null; g(this.canvas); }
    // fps + adaptive scene resolution
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsN / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsN = 0;
      if (!this.offline) {
        if (this.fps < 42) { this.slow++; this.fast = 0; } else if (this.fps > 57) { this.fast++; this.slow = 0; } else { this.slow = this.fast = 0; }
        if (this.slow >= 3 && this.renderScale > 0.4) { this.renderScale *= 0.82; this.slow = 0; this.resize(true); }
        if (this.fast >= 8 && this.renderScale < 1) { this.renderScale = Math.min(1, this.renderScale * 1.15); this.fast = 0; this.resize(true); }
      }
    }
  }

  private emblemUniforms(p: Program, on: boolean) {
    const gl = this.gl, e = this.emblem, u = p.u;
    gl.uniform1f(u.uEmblemOn, on ? 1 : 0);
    gl.uniform1f(u.uEmblemSize, e.size);
    gl.uniform1f(u.uEmblemOpacity, e.opacity);
    gl.uniform1f(u.uEmblemPulse, e.pulse);
    gl.uniform1f(u.uEmblemSpin, e.spin);
    gl.uniform1f(u.uEmblemAspect, e.aspect);
    gl.uniform1f(u.uEmblemWhite, e.white ? 1 : 0);
    gl.uniform1f(u.uEmblemInvert, e.invert ? 1 : 0);
  }
}

export { SCENES };
