/** Scenes built around the album cover, plus a few big-stage looks. */
import type { Engine } from "../engine/engine";
import { freeFBO, makeFBO, Pair, program, type FBO, type Program } from "../engine/gl";
import { HELPERS, PRELUDE, SCENE_MAIN } from "../engine/glsl";
import type { Scene, Sim } from "./types";

/** Square-cropped cover sampling, with generated palette art when nothing has been dropped. */
export const COVER = /* glsl */ `
vec3 genArt(vec2 uv){
  vec2 q = uv - .5; float r = length(q);
  float n = fbm(q*3. + 3.1);
  vec3 c = mix(pal(.12), pal(.55), smoothstep(0., 1., uv.y + (n - .5)*.5));
  c = mix(c, pal(.95), smoothstep(.012, 0., abs(r - .3 - (n - .5)*.04))*.9);
  c += pal(.8)*smoothstep(.16, 0., r)*.7;
  return c;
}
vec2 sqUV(vec2 uv){ float a = uImgAspect; return a > 1. ? vec2((uv.x - .5)/a + .5, uv.y) : vec2(uv.x, (uv.y - .5)*a + .5); }
vec3 cover(vec2 uv){ return uHasImg > .5 ? textureLod(uImg, sqUV(uv), 0.).rgb : genArt(uv); }
vec3 coverL(vec2 uv, float l){ return uHasImg > .5 ? textureLod(uImg, sqUV(uv), l).rgb : genArt(uv); }
`;

// ---------------------------------------------------------------- Halo: the classic circular spectrum around the cover
export const halo: Scene = {
  id: "halo", name: "Halo", group: "Image", blurb: "Your cover in a ring of spectrum bars with drifting embers. The classic music-channel look.",
  image: true, scale: 0.9,
  modes: ["bars", "dots", "wave"],
  sliders: [{ label: "speed", def: 45 }, { label: "size", def: 45 }, { label: "bars", def: 40 }, { label: "reach", def: 50 }, { label: "backdrop", def: 50 }, { label: "embers", def: 50 }],
  frag: COVER + /* glsl */ `
vec3 scene(vec2 p, vec2 uv){
  float r = length(p);
  float R = (.14 + S(1)*.12)*(1. + uKick*.06 + uBass*.025);
  vec3 col = coverL(rot(uT*.02)*p*(.55 - uBass*.04) + .5, 5.5)*(.12 + S(4)*.4);
  col *= smoothstep(1.1, .2, r);
  float at = abs(atan(p.x, p.y))/PI;       // 0 at the top, 1 at the bottom, mirrored left/right
  float n = 48. + floor(S(2)*144.);
  float cell = fract(at*n), x = (floor(at*n) + .5)/n;
  float v = fft(pow(x, 1.25)*.82);
  v = v*v*(.9 + uLevel*.25);
  float len = v*(.05 + S(3)*.24);
  float edge = R + .012;
  if(uMode == 0){
    float bar = smoothstep(.12, .2, cell)*smoothstep(.88, .8, cell)*smoothstep(edge - .002, edge, r)*smoothstep(edge + len + .003, edge + len, r);
    col += mix(pal(.5), pal(.95), x)*bar*(.75 + v*.5);
  } else if(uMode == 1){
    float k = floor((r - edge)/.018); float rr = edge + (k + .5)*.018;
    vec2 cc = vec2(sin((floor(at*n) + .5)/n*PI)*sign(p.x), cos((floor(at*n) + .5)/n*PI))*rr;
    float dot_ = smoothstep(.0065, .003, length(p - cc))*step(0., k)*step(rr - edge, len + .004);
    col += mix(pal(.55), pal(.95), x)*dot_*(.8 + v*.6);
  } else {
    float w = wave(at).z*.06*(1. + uLevel);
    float ring = smoothstep(.004, 0., abs(r - edge - len*.5 - w));
    col += pal(.9)*ring*1.4 + pal(.6)*exp(-abs(r - edge - len*.5 - w)*70.)*.4;
  }
  col += pal(.8)*exp(-max(r - edge, 0.)*16.)*step(R, r)*(.08 + uLevel*.22);
  // embers drifting outward
  float a = atan(p.y, p.x);
  for(int k=0;k<3;k++){
    float fk = float(k);
    vec2 g = vec2(a*(6. + fk*3.)/PI, log(max(r, .01))*5. - uT*(.5 + fk*.35) - uBass*.15);
    vec2 id = floor(g), f = fract(g) - .5;
    vec2 o = h22(id + fk*7.3) - .5;
    float d = length(f - o*.7);
    float on = step(.6, h21(id + fk));
    col += pal(.95)*smoothstep(.08, 0., d)*on*step(R*1.25, r)*(.2 + uHigh*.8)*S(5)*1.2;
  }
  // the cover disc
  if(r < R){
    vec2 cu = rot(uT*.08*(S(0) - .2))*p/(2.*R) + .5;
    vec3 c = cover(cu)*(1. + uKick*.12);
    col = mix(col, c, smoothstep(R, R - .003, r));
  }
  col += pal(1.)*smoothstep(.0035, 0., abs(r - R))*(.5 + uKick*1.2);
  return col;
}`,
};

// ---------------------------------------------------------------- Vinyl: the record spins, the grooves glint with the music
export const vinyl: Scene = {
  id: "vinyl", name: "Vinyl", group: "Image", blurb: "A record spinning at tempo with your cover as the label. The grooves light up with the song.",
  image: true, scale: 0.9,
  sliders: [{ label: "speed", def: 45 }, { label: "size", def: 70 }, { label: "groove glow", def: 60 }, { label: "tilt", def: 25 }, { label: "backdrop", def: 45 }],
  frag: COVER + /* glsl */ `
vec3 scene(vec2 p, vec2 uv){
  float tilt = S(3)*.55;
  vec2 q = p; q.y /= 1. - tilt;
  q.y -= tilt*.08;
  float R = .26 + S(1)*.2;
  q /= 1. + uKick*.015;
  float r = length(q), a = atan(q.y, q.x);
  float spin = uT*(2.2 + S(0)*2.);
  vec3 bg = coverL(p*.4 + .5, 6.)*(.08 + S(4)*.35) + pal(.1)*.2;
  bg *= smoothstep(1.3, .1, length(p));
  // soft shadow under the disc
  bg *= 1. - .7*smoothstep(R*1.15, R*.8, length(q - vec2(.02, -.03)));
  if(r > R) return bg + pal(.9)*exp(-(r - R)*40.)*.05*(1. + uLevel);
  // vinyl body: fine grooves whose shine follows the spectrum at that radius
  float x = clamp((r - R*.36)/(R*.64), 0., 1.);
  float band = fft(pow(1. - x, 1.3)*.8);
  // fade the micro-grooves out where they'd be finer than a pixel (no moiré)
  float fw = fwidth(r)*1600.;
  float grooves = .5 + .5*sin(r*1600. + sin(a*3. + spin)*.3)*clamp(1. - fw/2.5, 0., 1.);
  float ring = .5 + .5*sin(r*90.)*clamp(1. - fwidth(r)*90./2.5, 0., 1.);
  vec3 col = vec3(.03, .03, .036) + vec3(.035)*grooves*ring + pal(.2)*.04;
  // two still highlights (the light doesn't spin with the record)
  float la = a - .7;
  float spec_ = pow(abs(cos(la)), 24.)*(.25 + grooves*.75);
  col += mix(vec3(.6), pal(.85), .5)*spec_*(.35 + band*S(2)*1.6);
  col += vec3(.5)*pow(abs(cos(la + 1.6)), 60.)*(.12 + grooves*.2);
  col += pal(.7)*band*band*grooves*S(2)*.35*smoothstep(.0, .2, x);
  // lead-in groove and label edge
  col += vec3(.06)*smoothstep(.002, 0., abs(r - R*.965));
  // label: the cover, spinning
  float L = R*.38;
  if(r < L){
    vec2 cu = rot(spin)*q/(2.*L)*1.41 + .5;
    vec3 lab = cover(cu);
    lab *= .85 + .15*smoothstep(L, L*.6, r);
    col = mix(col, lab, smoothstep(L, L - .003, r));
    col = mix(col, vec3(.01), smoothstep(.009, .007, r)); // spindle hole
  }
  col *= mix(1., .55, tilt*(q.y/R*.5 + .5)); // falloff across a tilted disc
  return col;
}`,
};

// ---------------------------------------------------------------- Monolith: the cover as a glossy slab over a mirror floor
export const monolith: Scene = {
  id: "monolith", name: "Monolith", group: "Image", blurb: "Your cover as a floating slab over a mirror floor. Kicks tip it, the light swings with the bass.",
  image: true, scale: 0.7,
  sliders: [{ label: "speed", def: 40 }, { label: "turn", def: 50 }, { label: "height", def: 50 }, { label: "light", def: 55 }, { label: "fog", def: 40 }],
  frag: COVER + /* glsl */ `
vec3 boxN; vec2 boxUV; float boxFace;
float boxHit(vec3 ro, vec3 rd, vec3 sz){
  vec3 m = 1./rd, n = m*ro, k = abs(m)*sz, t1 = -n - k, t2 = -n + k;
  float tN = max(max(t1.x, t1.y), t1.z), tF = min(min(t2.x, t2.y), t2.z);
  if(tN > tF || tF < 0.) return -1.;
  boxN = -sign(rd)*step(t1.yzx, t1.xyz)*step(t1.zxy, t1.xyz);
  vec3 pos = ro + rd*tN;
  boxUV = pos.xy/(2.*sz.xy) + .5;
  boxFace = boxN.z;
  return tN;
}
mat3 objRot(){
  float a = sin(uT*.35)*(.4 + S(1)*.9) + uKick*.08, b = sin(uT*.23)*.18 + uBass*.05;
  mat2 ra = rot(a), rb = rot(b);
  return mat3(vec3(ra[0].x, 0., ra[0].y), vec3(0., 1., 0.), vec3(ra[1].x, 0., ra[1].y))*mat3(vec3(1., 0., 0.), vec3(0., rb[0].x, rb[0].y), vec3(0., rb[1].x, rb[1].y));
}
vec3 env(vec3 rd){
  vec3 c = mix(pal(.05), pal(.3), smoothstep(-.2, .8, rd.y));
  float soft = smoothstep(.85, 1., max(dot(rd, normalize(vec3(sin(uT*.3 + uBass)*.6, .6, -.5))), 0.));
  return c + pal(.95)*soft*(.6 + S(3)*1.2);
}
vec3 shadeBox(vec3 ro, vec3 rd, mat3 M, vec3 sz, out float hit){
  vec3 lro = transpose(M)*ro, lrd = transpose(M)*rd;
  float t = boxHit(lro, lrd, sz);
  hit = t;
  if(t < 0.) return vec3(0.);
  vec3 n = M*boxN;
  vec3 l = normalize(vec3(sin(uT*.3 + uBass)*.6, .6, -.5));
  float dif = max(dot(n, l), 0.)*.6 + .4;
  vec3 base;
  if(boxFace < -.5) base = cover(boxUV);
  else if(boxFace > .5) base = coverL(boxUV, 5.)*.25;
  else base = pal(.25)*.6;
  vec3 c = base*dif;
  float fr = pow(1. - max(dot(-rd, n), 0.), 4.);
  c += env(reflect(rd, n))*(.08 + fr*.6);
  float rim = smoothstep(.96, 1., max(abs(boxUV.x - .5), abs(boxUV.y - .5))*2.);
  c += pal(1.)*rim*(.3 + uKick*1.5)*step(.5, abs(boxFace));
  return c;
}
vec3 scene(vec2 p, vec2 uv){
  vec3 ro = vec3(0., .1 + (S(2) - .5)*.6, -3.2), rd = normalize(vec3(p, 1.45));
  mat3 M = objRot();
  vec3 sz = vec3(.72, .72, .045);
  float lift = .12 + sin(uT*.6)*.05 + uKick*.04;
  vec3 off = vec3(0., lift, 0.);
  float h;
  vec3 col = shadeBox(ro - off, rd, M, sz, h);
  float floorY = -.78;
  float tf = rd.y < 0. ? (floorY - ro.y)/rd.y : 1e9;
  if(h < 0. || tf < h){
    if(tf < 1e8){
      vec3 fp = ro + rd*tf;
      vec3 rr = reflect(rd, vec3(0., 1., 0.));
      float h2;
      vec3 refl = shadeBox(fp - off, rr, M, sz, h2);
      vec3 fc = env(rr)*.3;
      if(h2 > 0.) fc = refl*(.55 - min(h2*.12, .4));
      float fade = exp(-tf*(.08 + S(4)*.25));
      float spot = exp(-length(fp.xz - vec2(0., .2))*.9);
      col = mix(pal(.02), fc*.8 + pal(.6)*spot*.15*(1. + uLevel), fade);
    } else col = env(rd)*.5;
  }
  return col;
}`,
};

// ---------------------------------------------------------------- Tunnel: flying through a corridor tiled with the cover
export const tunnel: Scene = {
  id: "tunnel", name: "Tunnel", group: "Image", blurb: "A corridor tiled with your cover. Each tile pulses with its own slice of the spectrum.",
  image: true, scale: 0.85,
  modes: ["square", "round"],
  sliders: [{ label: "speed", def: 50 }, { label: "tiles", def: 40 }, { label: "pulse", def: 55 }, { label: "fog", def: 45 }, { label: "twist", def: 25 }],
  frag: COVER + /* glsl */ `
vec3 scene(vec2 p, vec2 uv){
  p = rot(uT*.08*(S(4) - .25)*2. + sin(uT*.2)*.05)*p;
  float r = uMode == 0 ? max(abs(p.x), abs(p.y)) : length(p);
  r = max(r, .002);
  float z = .3/r + uT*1.4 + uKick*.04;
  float n = 2. + floor(S(1)*5.);
  float u;
  if(uMode == 0){
    // walk the square's perimeter
    float side = abs(p.x) > abs(p.y) ? (p.x > 0. ? 0. : 2.) : (p.y > 0. ? 1. : 3.);
    float along = side == 0. ? p.y : side == 1. ? -p.x : side == 2. ? -p.y : p.x;
    u = side + (along/r*.5 + .5);
  } else u = (atan(p.y, p.x)/TAU + .5)*4.;
  vec2 g = vec2(u*n, z*n*.5);
  vec2 id = floor(g), f = fract(g);
  float pulse = fft(fract(h21(id)*.9));
  vec3 c = cover(f);
  c *= .55 + pulse*S(2)*1.6;
  float edge = min(min(f.x, 1. - f.x), min(f.y, 1. - f.y));
  c = mix(pal(.95)*(.5 + pulse), c, smoothstep(.0, .05, edge));
  float fog = exp(-(.3/r)*(.12 + S(3)*.4));
  return mix(pal(.02), c, fog) + pal(1.)*exp(-r*30.)*(.3 + uLevel);
}`,
};

// ---------------------------------------------------------------- Aurora: curtains of light over a still lake
export const aurora: Scene = {
  id: "aurora", name: "Aurora", group: "Space", blurb: "Northern lights rippling over a mirror lake. Mids ripple the curtains, highs make the stars sing.",
  scale: 0.75,
  sliders: [{ label: "speed", def: 40 }, { label: "curtains", def: 50 }, { label: "height", def: 50 }, { label: "stars", def: 50 }, { label: "lake", def: 50 }],
  frag: /* glsl */ `
vec3 sky(vec2 p){
  vec3 col = mix(pal(.04), pal(.18)*.6, smoothstep(-.1, .6, p.y));
  // stars
  vec2 g = p*vec2(90., 90.); vec2 id = floor(g), f = fract(g) - .5;
  float st = step(.985, h21(id))*smoothstep(.12, 0., length(f));
  col += vec3(st)*(.5 + uHigh*1.5*h21(id + 3.))*S(3)*1.4;
  // curtains
  int layers = 2 + int(S(1)*4.);
  for(int i=0;i<6;i++){
    if(i >= layers) break;
    float fi = float(i);
    float x = p.x*(1. + fi*.3) + fi*1.7;
    float base = -.08 + fi*.05 + (S(2) - .5)*.2 + fbm3(vec2(x*.8, uT*.1 + fi))*.22;
    float wav = sin(x*3. + uT*(.6 + uMid*1.2) + fi)*.04*(1. + uMid*2.);
    float y = p.y - base - wav;
    float rays = pow(vnoise(vec2(x*28. + uT*.4, fi)), 2.)*.8 + .2;
    float curtain = smoothstep(-.04, .03, y)*exp(-max(y, 0.)*(7.5 - fi*.6))*rays;
    vec3 c = mix(pal(.55), pal(.85 + fi*.03), smoothstep(0., .25, y));
    col += c*curtain*(.4 + uLevel*.6 + uKick*.25)*(1. - fi*.1);
  }
  return col;
}
vec3 scene(vec2 p, vec2 uv){
  float horizon = -.22 + (S(4) - .5)*.2;
  if(p.y > horizon) return sky(p);
  vec2 q = vec2(p.x + sin(p.y*90. + uT*2.)*.003*(1. + uBass*2.), 2.*horizon - p.y);
  vec3 refl = sky(q)*.7;
  float d = horizon - p.y;
  return mix(refl, pal(.02), smoothstep(0., .5, d)*.6) + pal(.4)*smoothstep(.004, 0., abs(d))*.4;
}`,
};

// ---------------------------------------------------------------- Chrome: liquid metal blobs reflecting the cover
export const chrome: Scene = {
  id: "chrome", name: "Chrome", group: "Fractal", blurb: "Liquid metal blobs that merge and split on the beat, reflecting your cover.",
  scale: 0.6,
  modes: ["mirror", "gold", "oil"],
  sliders: [{ label: "speed", def: 45 }, { label: "blobs", def: 55 }, { label: "melt", def: 50 }, { label: "size", def: 50 }, { label: "light", def: 50 }],
  frag: COVER + /* glsl */ `
float smin(float a, float b, float k){ float h = clamp(.5 + .5*(b - a)/k, 0., 1.); return mix(b, a, h) - k*h*(1. - h); }
int NB;
float map(vec3 p){
  float d = 1e9, k = .2 + S(2)*.45;
  for(int i=0;i<7;i++){
    if(i >= NB) break;
    float fi = float(i);
    vec3 c = vec3(sin(uT*.6 + fi*2.1)*.9, sin(uT*.47 + fi*1.3)*.55, cos(uT*.5 + fi*1.7)*.6);
    float band = fft(fract(fi*.137 + .05));
    float r = (.22 + S(3)*.18)*(.75 + band*.7) + (i == 0 ? uKick*.08 : 0.);
    d = smin(d, length(p - c) - r, k);
  }
  return d;
}
vec3 nrm(vec3 p){ vec2 e = vec2(.002, 0.); return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx))); }
vec3 env(vec3 d){
  vec3 c = coverL(d.xy*.45 + .5, 1.5)*(.8 + .5*d.y);
  c = mix(c, mix(pal(.15), pal(.75), d.y*.5 + .5), .35)*1.25;
  float strip = smoothstep(.97, 1., max(dot(d, normalize(vec3(.4, .8, -.4))), 0.)) + smoothstep(.985, 1., max(dot(d, normalize(vec3(-.7, .2, -.3))), 0.));
  return c + vec3(strip)*(1. + S(4)*2.);
}
vec3 scene(vec2 p, vec2 uv){
  NB = 3 + int(S(1)*4.);
  vec3 ro = vec3(0., 0., -3.), rd = normalize(vec3(p, 1.3));
  float t = 0.;
  for(int i=0;i<64;i++){ float d = map(ro + rd*t); if(d < .002 || t > 6.) break; t += d; }
  vec3 bg = env(rd)*.18 + pal(.03);
  if(t > 6.) return bg;
  vec3 pos = ro + rd*t, n = nrm(pos), rf = reflect(rd, n);
  float fr = .3 + .7*pow(1. - max(dot(-rd, n), 0.), 3.);
  vec3 c = env(rf)*fr;
  if(uMode == 1) c *= vec3(1., .78, .42)*1.3;
  if(uMode == 2) c = mix(c, hueRot(pal(.7), dot(n, rd)*6. + uT)*lum(c)*2., .55);
  return c + pal(1.)*uAccent*.08;
}`,
};

// ---------------------------------------------------------------- Skyline: a 3D city of spectrum bars, history rolling back
export const skyline: Scene = {
  id: "skyline", name: "Skyline", group: "Signal", blurb: "A 3D city of spectrum bars. Each row is a moment ago, rolling into the distance.",
  scale: 0.85,
  sliders: [{ label: "speed", def: 50 }, { label: "columns", def: 45 }, { label: "height", def: 55 }, { label: "depth", def: 50 }, { label: "glow", def: 50 }],
  frag: /* glsl */ `
vec3 scene(vec2 p, vec2 uv){
  float cols = 16. + floor(S(1)*40.);
  int rows = 6 + int(S(3)*14.);
  float horizon = .18;
  vec3 col = p.y > horizon ? mix(pal(.04), pal(.18)*.6, smoothstep(horizon, horizon + .5, p.y)) : pal(.02)*1.5;
  col += pal(.6)*exp(-abs(p.y - horizon)*25.)*.12;
  // front to back: the first block that covers this pixel wins
  for(int k=0;k<20;k++){
    if(k >= rows) break;
    float fk = float(k);
    float z = 1. + fk*.45;
    float sc = 1./z;
    float baseY = horizon - .85*sc;
    float wcol = 1.6/cols;
    float cx = p.x/sc/wcol + cols*.5;
    float ci = floor(cx);
    if(ci < 0. || ci >= cols) continue;
    float f = fract(cx);
    float x = (ci + .5)/cols;
    float v = spec(pow(x, 1.2)*.8, fk*3.);
    float hgt = (.015 + v*v*(.12 + S(2)*.4))*sc;
    float top = baseY + hgt;
    float inX = step(.08, f)*step(f, .92);
    float capH = .028*sc;
    if(inX > .5 && p.y > baseY && p.y < top + capH){
      float isTop = step(top, p.y);
      vec3 c = mix(pal(.35 + v*.4), pal(.9 + v*.1), isTop)*(isTop > .5 ? 1.2 : .45 + .55*(p.y - baseY)/max(hgt, 1e-3));
      float fog = exp(-fk*(.08 + (1. - S(4))*.1));
      c *= fog;
      c += pal(1.)*isTop*v*S(4)*.8*fog;
      return c + col*(1. - fog)*.3;
    }
  }
  // floor grid
  if(p.y < horizon){
    float d = (horizon - p.y);
    float zz = .85/max(d, 1e-3);
    vec2 g = vec2(p.x*zz, zz + uT*1.5);
    vec2 gf = vec2(fract(g.x*2.), fract(g.y));
    vec2 gd = min(gf, 1. - gf);
    float line = smoothstep(.05, 0., min(gd.x, gd.y))*exp(-zz*.1);
    col += pal(.7)*line*.3*(1. + uKick);
  }
  return col;
}`,
};

// ---------------------------------------------------------------- Lasers: club beams through haze, synced to the tempo
export const lasers: Scene = {
  id: "lasers", name: "Lasers", group: "Space", blurb: "Club lasers sweeping through haze, locked to the tempo. Kicks strobe, drops fan them wide.",
  scale: 0.8,
  modes: ["fan", "cross", "tunnel", "rain"],
  sliders: [{ label: "speed", def: 50 }, { label: "beams", def: 50 }, { label: "spread", def: 55 }, { label: "haze", def: 50 }, { label: "width", def: 35 }],
  frag: /* glsl */ `
float beam(vec2 p, vec2 o, float ang, float w){
  vec2 d = vec2(sin(ang), cos(ang));
  vec2 v = p - o; float t = dot(v, d);
  if(t < 0.) return 0.;
  float dist = length(v - d*t);
  return exp(-dist/(w*(1. + t*.6)))*exp(-t*.25);
}
vec3 scene(vec2 p, vec2 uv){
  float haze = (.35 + fbm(p*2.5 + vec2(uT*.05, -uT*.08))*.9)*(.3 + S(3)*1.2);
  vec3 col = pal(.02) + pal(.15)*haze*.08;
  int n = 3 + int(S(1)*9.);
  float w = .002 + S(4)*.01;
  float sweep = uT*.9 + uBeatPhase*.0;
  float spread = .2 + S(2)*1.1 + uLevel*.3;
  float strobe = 1. + uKick*2.5;
  for(int i=0;i<12;i++){
    if(i >= n) break;
    float fi = float(i), fn = float(n);
    float s = fn > 1. ? fi/(fn - 1.) - .5 : 0.;
    vec2 o; float a;
    if(uMode == 0){ o = vec2(0., -.6); a = s*spread*2. + sin(sweep + fi*.3)*.25; }
    else if(uMode == 1){ float side = mod(fi, 2.) < .5 ? -1. : 1.; o = vec2(side*.9, -.55); a = -side*(.5 + s*spread) + sin(sweep*1.3 + fi)*.3; }
    else if(uMode == 2){ o = vec2(0.); a = fi/fn*TAU + sweep*.4; }
    else { o = vec2(s*2.2*(uRes.x/uRes.y)*.5, .6); a = PI + sin(sweep + fi*1.7)*.15; }
    float b = beam(p, o, a, w);
    vec3 c = pal(.6 + .4*fract(fi*.37));
    col += c*b*(1. + haze*1.6)*strobe*(.6 + fft(fract(fi*.11 + .05))*1.4);
    col += c*exp(-length(p - o)*30.)*.4*strobe;
  }
  return col;
}`,
};

// ---------------------------------------------------------------- Dust: the cover breaks into 65,000 particles and reforms
const HDR = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uRes;
${HELPERS}
`;
function pass(e: Engine, p: Program, target: FBO, bind: (u: Program["u"]) => void, textures: [string, WebGLTexture][] = []) {
  const gl = e.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
  gl.viewport(0, 0, target.w, target.h);
  gl.useProgram(p.p);
  textures.forEach(([n, t], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(p.u[n], i); });
  gl.uniform2f(p.u.uRes, target.w, target.h);
  bind(p.u);
  e.draw();
}

class Dust implements Sim {
  state!: Pair;
  stepP!: Program;
  drawP!: Program;
  showP!: Program;
  layer!: FBO;
  n = 256;
  init(e: Engine) {
    const gl = e.gl;
    this.state = new Pair(gl, this.n, this.n, { nearest: true });
    const seed = program(gl, HDR + `uniform float uN; void main(){ vec2 h = (gl_FragCoord.xy/uN - .5); fragColor = vec4(h, 0., 0.); }`);
    for (const t of [this.state.read, this.state.write]) pass(e, seed, t, (u) => gl.uniform1f(u.uN, this.n));
    this.stepP = program(gl, HDR + `uniform sampler2D uS; uniform float uTime, uBass, uMid, uHigh, uKick, uN, uSize, uSpring, uBurst, uSwirl; uniform vec3 uMouse; uniform float uAspect;
      void main(){
        vec4 s = texelFetch(uS, ivec2(gl_FragCoord.xy), 0);
        vec2 p = s.xy, v = s.zw;
        vec2 home = (gl_FragCoord.xy/uN - .5)*uSize*(1. + uBass*.06);
        float a = fbm3(p*2.2 + uTime*.15)*12.566;
        vec2 curl = vec2(cos(a), sin(a));
        float jitter = h21(gl_FragCoord.xy);
        v += (home - p)*uSpring*(.02 + jitter*.02);
        v += curl*(.0004 + uMid*.002)*uSwirl;
        if(uKick > .55) v += normalize(p + (h22(gl_FragCoord.xy) - .5)*.05 + 1e-4)*(uKick - .55)*uBurst*(.004 + jitter*.012);
        if(uMouse.z > .5){ vec2 m = (uMouse.xy - .5)*vec2(uAspect, 1.); vec2 d = p - m; float l = length(d); v += d/(l + .01)*.004*exp(-l*12.); }
        v *= .9;
        p += v;
        fragColor = vec4(p, v);
      }`);
    this.drawP = program(gl, `#version 300 es
      precision highp float;
      in vec3 vCol; in float vSpeed;
      out vec4 fragColor;
      void main(){ vec2 d = gl_PointCoord - .5; if(dot(d, d) > .25) discard; fragColor = vec4(vCol*(1. + min(vSpeed*6., .6)), 1.); }`, `#version 300 es
      precision highp float;
      uniform sampler2D uS, uImg; uniform float uAspect, uPx, uHasImg, uImgAspect; uniform int uN; uniform vec3 uPal[5];
      out vec3 vCol; out float vSpeed;
      ${HELPERS}
      vec3 pal(float t){ t = clamp(t, 0., 1.)*4.; int i = int(min(floor(t), 3.)); return mix(uPal[i], uPal[i+1], smoothstep(0., 1., t - float(i))); }
      ${COVER}
      void main(){
        ivec2 id = ivec2(gl_VertexID % uN, gl_VertexID / uN);
        vec4 s = texelFetch(uS, id, 0);
        vec2 huv = (vec2(id) + .5)/float(uN);
        vCol = cover(huv);
        vSpeed = length(s.zw);
        gl_Position = vec4(s.x*2./uAspect, s.y*2., 0., 1.);
        gl_PointSize = uPx*(1. + min(vSpeed*10., 1.));
      }`);
    this.showP = program(gl, PRELUDE + COVER + `uniform sampler2D uL; vec3 scene(vec2 p, vec2 uv){ vec4 l = texture(uL, uv); vec3 bg = coverL(p*.5 + .5, 6.)*(.05 + S(4)*.25)*smoothstep(1.2, .2, length(p)); return max(bg, l.rgb*(.8 + uLevel*.15)); }` + SCENE_MAIN);
    this.layer = makeFBO(gl, e.width, e.height);
  }
  render(e: Engine, target: FBO) {
    const gl = e.gl, b = e.audio.bands, r = e.react, s = e.curScene.map((v) => v / 100), asp = e.width / e.height;
    const lw = Math.round(e.width * 0.75), lh = Math.round(e.height * 0.75);
    if (this.layer.w !== lw || this.layer.h !== lh) { freeFBO(gl, this.layer); this.layer = makeFBO(gl, lw, lh); }
    const size = 0.55 + s[1] * 0.45;
    pass(e, this.stepP, this.state.write, (u) => {
      gl.uniform1f(u.uTime, e.sceneTime); gl.uniform1f(u.uBass, b.bass * r); gl.uniform1f(u.uMid, b.mid * r); gl.uniform1f(u.uHigh, b.high * r); gl.uniform1f(u.uKick, b.kick * r);
      gl.uniform1f(u.uN, this.n); gl.uniform1f(u.uSize, size); gl.uniform1f(u.uSpring, 0.3 + s[3] * 1.4); gl.uniform1f(u.uBurst, 0.3 + s[2] * 1.7); gl.uniform1f(u.uSwirl, 0.2 + s[5] * 2);
      gl.uniform3f(u.uMouse, e.mouse[0], e.mouse[1], e.mouse[2]); gl.uniform1f(u.uAspect, asp);
    }, [["uS", this.state.read.tex]]);
    this.state.swap();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.layer.fb);
    gl.viewport(0, 0, this.layer.w, this.layer.h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MAX); // particles keep the cover's real colors where they overlap
    gl.useProgram(this.drawP.p);
    const u = this.drawP.u;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.state.read.tex); gl.uniform1i(u.uS, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, e.imgTex); gl.uniform1i(u.uImg, 1);
    gl.uniform1f(u.uAspect, asp); gl.uniform1i(u.uN, this.n);
    gl.uniform1f(u.uHasImg, e.hasImage ? 1 : 0); gl.uniform1f(u.uImgAspect, e.imgAspect);
    gl.uniform3fv(u.uPal, e.palCur.flat());
    gl.uniform1f(u.uPx, Math.max(1.5, (this.layer.h * size) / this.n) * 1.25);
    gl.bindVertexArray(e.vao);
    gl.drawArrays(gl.POINTS, 0, this.n * this.n);
    gl.blendEquation(gl.FUNC_ADD);
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

export const dust: Scene = {
  id: "dust", name: "Dust", group: "Image", blurb: "Your cover as 65,000 particles. Kicks blow it apart, it swirls and pulls itself back together.",
  image: true,
  sliders: [{ label: "speed", def: 50 }, { label: "size", def: 60 }, { label: "burst", def: 50 }, { label: "pull", def: 45 }, { label: "backdrop", def: 40 }, { label: "swirl", def: 40 }],
  sim: () => new Dust(),
};
