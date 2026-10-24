/** Multi-pass scenes: GPU fluid, reaction-diffusion, and a particle field. */
import type { Engine } from "../engine/engine";
import { freeFBO, makeFBO, Pair, program, type FBO, type Program } from "../engine/gl";
import { HELPERS, PRELUDE, SCENE_MAIN } from "../engine/glsl";
import type { Scene, Sim } from "./types";

const HDR = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uRes;
${HELPERS}
`;

function pass(e: Engine, p: Program, target: FBO | null, bind: (u: Program["u"]) => void, textures: [string, WebGLTexture][] = []) {
  const gl = e.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
  gl.viewport(0, 0, target ? target.w : e.width, target ? target.h : e.height);
  gl.useProgram(p.p);
  textures.forEach(([n, t], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(p.u[n], i); });
  if (target) gl.uniform2f(p.u.uRes, target.w, target.h);
  bind(p.u);
  e.draw();
}

// ---------------------------------------------------------------- fluid (stable fluids, Stam 1999)
class Fluid implements Sim {
  vel!: Pair; dye!: Pair; pres!: Pair; div!: FBO;
  p: Record<string, Program> = {};
  w = 0; h = 0;
  init(e: Engine) {
    const gl = e.gl;
    this.w = 256; this.h = Math.round(256 * e.height / Math.max(1, e.width)) || 144;
    const dw = 512, dh = Math.round(512 * this.h / this.w);
    this.vel = new Pair(gl, this.w, this.h);
    this.pres = new Pair(gl, this.w, this.h);
    this.div = makeFBO(gl, this.w, this.h);
    this.dye = new Pair(gl, dw, dh);
    this.p.advect = program(gl, HDR + `uniform sampler2D uVel, uSrc; uniform float uDt, uDiss; void main(){ vec2 uv = gl_FragCoord.xy/uRes; vec2 v = texture(uVel, uv).xy; fragColor = texture(uSrc, uv - v*uDt)*uDiss; }`);
    this.p.splat = program(gl, HDR + `uniform sampler2D uSrc; uniform vec2 uPt; uniform vec3 uVal; uniform float uR, uAspect; void main(){ vec2 uv = gl_FragCoord.xy/uRes; vec2 d = uv - uPt; d.x *= uAspect; float g = exp(-dot(d,d)/uR); fragColor = vec4(texture(uSrc, uv).rgb + uVal*g, 1.); }`);
    this.p.div = program(gl, HDR + `uniform sampler2D uVel; void main(){ vec2 t = 1./uRes, uv = gl_FragCoord.xy/uRes; float L = texture(uVel, uv - vec2(t.x,0)).x, R = texture(uVel, uv + vec2(t.x,0)).x, B = texture(uVel, uv - vec2(0,t.y)).y, T = texture(uVel, uv + vec2(0,t.y)).y; fragColor = vec4(.5*(R - L + T - B), 0, 0, 1); }`);
    this.p.jacobi = program(gl, HDR + `uniform sampler2D uP, uDiv; void main(){ vec2 t = 1./uRes, uv = gl_FragCoord.xy/uRes; float L = texture(uP, uv - vec2(t.x,0)).x, R = texture(uP, uv + vec2(t.x,0)).x, B = texture(uP, uv - vec2(0,t.y)).x, T = texture(uP, uv + vec2(0,t.y)).x; fragColor = vec4((L + R + B + T - texture(uDiv, uv).x)*.25, 0, 0, 1); }`);
    this.p.grad = program(gl, HDR + `uniform sampler2D uP, uVel; void main(){ vec2 t = 1./uRes, uv = gl_FragCoord.xy/uRes; float L = texture(uP, uv - vec2(t.x,0)).x, R = texture(uP, uv + vec2(t.x,0)).x, B = texture(uP, uv - vec2(0,t.y)).x, T = texture(uP, uv + vec2(0,t.y)).x; fragColor = vec4(texture(uVel, uv).xy - .5*vec2(R - L, T - B), 0, 1); }`);
    this.p.curl = program(gl, HDR + `uniform sampler2D uVel; uniform float uTime, uAmt; void main(){ vec2 uv = gl_FragCoord.xy/uRes; vec2 v = texture(uVel, uv).xy; vec2 n = vec2(fbm3(uv*4. + uTime*.1), fbm3(uv*4. - uTime*.1 + 9.)) - .5; fragColor = vec4(v*.995 + n*uAmt, 0, 1); }`);
    this.p.show = program(gl, PRELUDE + `uniform sampler2D uDye; vec3 scene(vec2 p, vec2 uv){ vec3 d = texture(uDye, uv).rgb; float v = clamp(length(d)*(.5 + S(1)), 0., 1.2); vec3 c = pal(min(v, 1.))*(.3 + v); float grain = h21(floor(gl_FragCoord.xy*(.4 + S(2)*.6)))*S(2); return c + pal(1.)*grain*v*.4; }` + SCENE_MAIN);
  }
  render(e: Engine, target: FBO, dt: number) {
    const b = e.audio.bands, r = e.react, t = e.time, s = e.curScene.map((v) => v / 100);
    const step = Math.min(dt, 0.033);
    const asp = e.width / e.height;
    // forces: kicks punch in a ring of splats, mids add curling turbulence
    pass(e, this.p.curl, this.vel.write, (u) => { e.gl.uniform1f(u.uTime, t); e.gl.uniform1f(u.uAmt, (0.002 + b.mid * r * 0.01) * (0.4 + s[2])); }, [["uVel", this.vel.read.tex]]);
    this.vel.swap();
    const splats = 2 + Math.round(b.kick * r * 6);
    for (let i = 0; i < splats; i++) {
      const a = t * 0.7 + i * 2.399;
      const pt = [0.5 + Math.cos(a) * 0.28 * (0.6 + s[3]), 0.5 + Math.sin(a * 1.3) * 0.28];
      const force = (0.2 + b.bass * r * 1.2 + (i < 2 ? 0.1 : 0.5)) * 0.6;
      const dir = [Math.cos(a + 1.6) * force, Math.sin(a + 1.6) * force];
      pass(e, this.p.splat, this.vel.write, (u) => { e.gl.uniform2f(u.uPt, pt[0], pt[1]); e.gl.uniform3f(u.uVal, dir[0], dir[1], 0); e.gl.uniform1f(u.uR, 0.0015 + b.bass * 0.002); e.gl.uniform1f(u.uAspect, asp); }, [["uSrc", this.vel.read.tex]]);
      this.vel.swap();
      const amt = 0.15 + b.level * r * 0.6;
      pass(e, this.p.splat, this.dye.write, (u) => { e.gl.uniform2f(u.uPt, pt[0], pt[1]); e.gl.uniform3f(u.uVal, amt, amt * 0.8, amt * 0.6); e.gl.uniform1f(u.uR, 0.0008 + b.kick * 0.002); e.gl.uniform1f(u.uAspect, asp); }, [["uSrc", this.dye.read.tex]]);
      this.dye.swap();
    }
    pass(e, this.p.advect, this.vel.write, (u) => { e.gl.uniform1f(u.uDt, step); e.gl.uniform1f(u.uDiss, 0.995); }, [["uVel", this.vel.read.tex], ["uSrc", this.vel.read.tex]]);
    this.vel.swap();
    pass(e, this.p.div, this.div, () => {}, [["uVel", this.vel.read.tex]]);
    for (let i = 0; i < 18; i++) {
      pass(e, this.p.jacobi, this.pres.write, () => {}, [["uP", this.pres.read.tex], ["uDiv", this.div.tex]]);
      this.pres.swap();
    }
    pass(e, this.p.grad, this.vel.write, () => {}, [["uP", this.pres.read.tex], ["uVel", this.vel.read.tex]]);
    this.vel.swap();
    pass(e, this.p.advect, this.dye.write, (u) => { e.gl.uniform1f(u.uDt, step); e.gl.uniform1f(u.uDiss, 0.985 + s[4] * 0.013); }, [["uVel", this.vel.read.tex], ["uSrc", this.dye.read.tex]]);
    this.dye.swap();
    const show = this.p.show;
    e.gl.bindFramebuffer(e.gl.FRAMEBUFFER, target.fb);
    e.gl.viewport(0, 0, target.w, target.h);
    e.gl.useProgram(show.p);
    e.bindSceneUniforms(show, target.w, target.h);
    e.gl.activeTexture(e.gl.TEXTURE6);
    e.gl.bindTexture(e.gl.TEXTURE_2D, this.dye.read.tex);
    e.gl.uniform1i(show.u.uDye, 6);
    e.draw();
  }
  dispose(e: Engine) { this.vel.free(); this.dye.free(); this.pres.free(); freeFBO(e.gl, this.div); }
}

// ---------------------------------------------------------------- reaction-diffusion (Gray-Scott)
class Morphogen implements Sim {
  rd!: Pair;
  step!: Program;
  show!: Program;
  seed!: Program;
  started = false;
  init(e: Engine) {
    const gl = e.gl;
    const w = 384, h = Math.round(384 * e.height / Math.max(1, e.width)) || 216;
    this.rd = new Pair(gl, w, h, { wrap: gl.REPEAT });
    this.seed = program(gl, HDR + `void main(){ vec2 uv = gl_FragCoord.xy/uRes; float b = step(.985, h21(floor(gl_FragCoord.xy/3.))) + step(length(uv - .5), .04); fragColor = vec4(1., clamp(b, 0., 1.), 0., 1.); }`);
    this.step = program(gl, HDR + `uniform sampler2D uS; uniform float uF, uK, uFold; uniform vec3 uMouse; uniform float uKick, uAspect;
      vec2 L(vec2 uv, vec2 t){ vec2 c = texture(uS, uv).xy; return -c + .2*(texture(uS, uv + vec2(t.x,0)).xy + texture(uS, uv - vec2(t.x,0)).xy + texture(uS, uv + vec2(0,t.y)).xy + texture(uS, uv - vec2(0,t.y)).xy) + .05*(texture(uS, uv + t).xy + texture(uS, uv - t).xy + texture(uS, uv + vec2(t.x,-t.y)).xy + texture(uS, uv - vec2(t.x,-t.y)).xy); }
      void main(){
        vec2 uv = gl_FragCoord.xy/uRes, t = 1./uRes;
        if(uFold > 1.5){ vec2 p = uv - .5; float r = length(p), a = atan(p.y, p.x), seg = 6.28318/uFold; a = abs(mod(a, seg) - seg*.5); uv = r*vec2(cos(a), sin(a)) + .5; }
        vec2 c = texture(uS, uv).xy, l = L(uv, t);
        float abb = c.x*c.y*c.y;
        vec2 n = c + vec2(1.*l.x - abb + uF*(1. - c.x), .5*l.y + abb - (uK + uF)*c.y);
        vec2 d = (gl_FragCoord.xy/uRes - uMouse.xy); d.x *= uAspect;
        if(uMouse.z > .5 && length(d) < .02) n.y = .9;
        if(uKick > .6 && h21(floor(gl_FragCoord.xy/4.) + floor(uKick*90.)) > .9993) n.y = 1.;
        fragColor = vec4(clamp(n, 0., 1.), 0., 1.);
      }`);
    this.show = program(gl, PRELUDE + `uniform sampler2D uRD; vec3 scene(vec2 p, vec2 uv){ float v = texture(uRD, uv).y; float e = smoothstep(.18, .32, v); float edge = smoothstep(.02, .0, abs(v - .25)); return mix(pal(.05), pal(.75), e) + pal(1.)*edge*(.5 + uHigh); }` + SCENE_MAIN);
    pass(e, this.seed, this.rd.read, () => {});
  }
  render(e: Engine, target: FBO, _dt: number) {
    const s = e.curScene.map((v) => v / 100), b = e.audio.bands, gl = e.gl;
    // pattern presets along the F/K map: spots -> mazes -> worms -> holes
    const pats = [[0.0367, 0.0649], [0.029, 0.057], [0.039, 0.058], [0.025, 0.06], [0.078, 0.061]];
    const pi = s[1] * (pats.length - 1), i0 = Math.floor(pi), fr = pi - i0;
    const a = pats[i0], c = pats[Math.min(pats.length - 1, i0 + 1)];
    const F = a[0] + (c[0] - a[0]) * fr + b.bass * e.react * 0.002, K = a[1] + (c[1] - a[1]) * fr;
    const iters = 6 + Math.round(s[0] * 14);
    const fold = Math.round(s[2] * 8);
    const m = [e.mouse[0] / (e.width / e.height) + 0.5, e.mouse[1] + 0.5, e.mouse[2]];
    for (let i = 0; i < iters; i++) {
      pass(e, this.step, this.rd.write, (u) => { gl.uniform1f(u.uF, F); gl.uniform1f(u.uK, K); gl.uniform1f(u.uFold, fold); gl.uniform3f(u.uMouse, m[0], m[1], m[2]); gl.uniform1f(u.uKick, b.kick * e.react); gl.uniform1f(u.uAspect, e.width / e.height); }, [["uS", this.rd.read.tex]]);
      this.rd.swap();
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, target.w, target.h);
    gl.useProgram(this.show.p);
    e.bindSceneUniforms(this.show, target.w, target.h);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, this.rd.read.tex);
    gl.uniform1i(this.show.u.uRD, 6);
    e.draw();
  }
  dispose() { this.rd.free(); }
}

// ---------------------------------------------------------------- particles (GPU state textures, drawn as points)
class Wisp implements Sim {
  state!: Pair;
  stepP!: Program;
  drawP!: Program;
  showP!: Program;
  layer!: FBO;
  n = 256;
  init(e: Engine) {
    const gl = e.gl;
    this.state = new Pair(gl, this.n, this.n, { nearest: true });
    const seed = program(gl, HDR + `void main(){ vec2 h = h22(gl_FragCoord.xy); fragColor = vec4((h - .5)*2., 0., 0.); }`);
    pass(e, seed, this.state.read, () => {});
    pass(e, seed, this.state.write, () => {});
    this.stepP = program(gl, HDR + `uniform sampler2D uS; uniform float uTime, uBass, uMid, uKick, uRoam, uAspect; uniform vec3 uMouse;
      void main(){
        vec4 s = texelFetch(uS, ivec2(gl_FragCoord.xy), 0);
        vec2 p = s.xy, v = s.zw;
        vec2 wand = uMouse.z > .5 ? uMouse.xy*vec2(2./uAspect, 2.) : vec2(sin(uTime*.37)*.6, cos(uTime*.29)*.5)*uRoam;
        float a = fbm3(p*1.6 + uTime*.12)*12.566;
        vec2 flow = vec2(cos(a), sin(a));
        vec2 toW = wand - p; float d = length(toW) + .05;
        v = v*.94 + flow*(.0015 + uMid*.004) + toW/d*(.0008 + uBass*.003);
        if(uKick > .5) v += normalize(p - wand + 1e-4)*.01*uKick;
        p += v;
        if(abs(p.x) > 1.4 || abs(p.y) > 1.2 || h21(gl_FragCoord.xy + floor(uTime*3.)) > .998) { p = wand + (h22(gl_FragCoord.xy + uTime) - .5)*.2; v = vec2(0.); }
        fragColor = vec4(p, v);
      }`);
    this.drawP = program(gl, `#version 300 es
      precision highp float;
      in float vSpeed;
      out vec4 fragColor;
      void main(){ vec2 d = gl_PointCoord - .5; float a = exp(-dot(d, d)*14.); fragColor = vec4(vec3(a*(.012 + vSpeed*1.2)), 1.); }`, `#version 300 es
      precision highp float;
      uniform sampler2D uS; uniform float uSize, uAspect; uniform int uN;
      out float vSpeed;
      void main(){ ivec2 id = ivec2(gl_VertexID % uN, gl_VertexID / uN); vec4 s = texelFetch(uS, id, 0); vSpeed = length(s.zw); gl_Position = vec4(s.x/uAspect, s.y, 0., 1.); gl_PointSize = uSize*(1. + vSpeed*60.); }`);
    this.showP = program(gl, PRELUDE + `uniform sampler2D uL; vec3 scene(vec2 p, vec2 uv){ float v = texture(uL, uv).r; vec3 c = pal(clamp(v*.5, 0., 1.))*min(v, 2.)*.6; vec2 wand = uMouse.z > .5 ? uMouse.xy : vec2(sin(uTime*.37)*.6*(.4 + S(1)*.6)/2.*uRes.x/uRes.y, cos(uTime*.29)*.25*(.4 + S(1)*.6)); c += pal(1.)*exp(-length(p - wand)*28.)*(1. + uKick*2.); return c; }` + SCENE_MAIN);
    this.layer = makeFBO(gl, Math.round(e.width / 2), Math.round(e.height / 2));
  }
  render(e: Engine, target: FBO, _dt: number) {
    const gl = e.gl, b = e.audio.bands, r = e.react, s = e.curScene.map((v) => v / 100), asp = e.width / e.height;
    if (this.layer.w !== Math.round(e.width / 2)) { freeFBO(gl, this.layer); this.layer = makeFBO(gl, Math.round(e.width / 2), Math.round(e.height / 2)); }
    pass(e, this.stepP, this.state.write, (u) => {
      gl.uniform1f(u.uTime, e.sceneTime); gl.uniform1f(u.uBass, b.bass * r); gl.uniform1f(u.uMid, b.mid * r); gl.uniform1f(u.uKick, b.kick * r);
      gl.uniform1f(u.uRoam, 0.4 + s[1] * 0.6); gl.uniform1f(u.uAspect, asp); gl.uniform3f(u.uMouse, e.mouse[0], e.mouse[1], e.mouse[2]);
    }, [["uS", this.state.read.tex]]);
    this.state.swap();
    // splat points additively into a half-res layer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.layer.fb);
    gl.viewport(0, 0, this.layer.w, this.layer.h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.drawP.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.state.read.tex);
    gl.uniform1i(this.drawP.u.uS, 0);
    gl.uniform1f(this.drawP.u.uSize, 1 + s[3] * 2.5);
    gl.uniform1f(this.drawP.u.uAspect, asp);
    gl.uniform1i(this.drawP.u.uN, this.n);
    const count = Math.round(this.n * this.n * (0.25 + s[2] * 0.75));
    gl.bindVertexArray(e.vao);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, target.w, target.h);
    gl.useProgram(this.showP.p);
    e.bindSceneUniforms(this.showP, target.w, target.h);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, this.layer.tex);
    gl.uniform1i(this.showP.u.uL, 6);
    e.draw();
  }
  dispose(e: Engine) { this.state.free(); freeFBO(e.gl, this.layer); }
}

export const fluid: Scene = {
  id: "fluid", name: "Fluid", group: "Fluid", blurb: "A real fluid simulation. Kicks stir the ink, mids curl it.",
  sliders: [{ label: "speed", def: 50 }, { label: "density", def: 50 }, { label: "grain", def: 30 }, { label: "spread", def: 50 }, { label: "persist", def: 50 }],
  sim: () => new Fluid(),
};

export const morphogen: Scene = {
  id: "morphogen", name: "Morphogen", group: "Pattern", blurb: "Reaction-diffusion growth. Drag to paint, kicks seed new colonies.",
  sliders: [{ label: "speed", def: 50 }, { label: "pattern", def: 25 }, { label: "fold", def: 0 }],
  sim: () => new Morphogen(),
};

export const wisp: Scene = {
  id: "wisp", name: "Wisp", group: "Space", blurb: "65,000 particles of dust following a glowing wanderer. Hold the mouse to lead it.",
  sliders: [{ label: "speed", def: 50 }, { label: "roam", def: 50 }, { label: "amount", def: 70 }, { label: "size", def: 30 }],
  sim: () => new Wisp(),
};
