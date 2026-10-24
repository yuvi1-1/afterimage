import { VERT } from "./glsl";

export type Program = { p: WebGLProgram; u: Record<string, WebGLUniformLocation> };
export type FBO = { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number; mip: boolean };

export function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s) || "";
    const lines = src.split("\n");
    const m = /0:(\d+)/.exec(log);
    const ctx = m ? lines.slice(Math.max(0, +m[1] - 3), +m[1] + 2).join("\n") : "";
    throw new Error(`${log}\n${ctx}`);
  }
  return s;
}

export function program(gl: WebGL2RenderingContext, frag: string, vert = VERT): Program {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link failed");
  const u: Record<string, WebGLUniformLocation> = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i)!;
    u[info.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(p, info.name)!;
  }
  return { p, u };
}

export function texParams(gl: WebGL2RenderingContext, wrap: number, mip: boolean, nearest = false) {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, nearest ? gl.NEAREST : mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
}

export function makeFBO(gl: WebGL2RenderingContext, w: number, h: number, opts: { mip?: boolean; float?: boolean; wrap?: number; nearest?: boolean } = {}): FBO {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const float = opts.float ?? true;
  if (float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  texParams(gl, opts.wrap ?? gl.CLAMP_TO_EDGE, !!opts.mip, opts.nearest);
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  if (opts.mip) gl.generateMipmap(gl.TEXTURE_2D);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb, w, h, mip: !!opts.mip };
}

export function freeFBO(gl: WebGL2RenderingContext, f: FBO | null | undefined) {
  if (!f) return;
  gl.deleteTexture(f.tex);
  gl.deleteFramebuffer(f.fb);
}

/** Ping-pong pair */
export class Pair {
  a: FBO;
  b: FBO;
  constructor(private gl: WebGL2RenderingContext, w: number, h: number, opts: Parameters<typeof makeFBO>[3] = {}) {
    this.a = makeFBO(gl, w, h, opts);
    this.b = makeFBO(gl, w, h, opts);
  }
  get read() { return this.a; }
  get write() { return this.b; }
  swap() { [this.a, this.b] = [this.b, this.a]; }
  free() { freeFBO(this.gl, this.a); freeFBO(this.gl, this.b); }
}
