/** Shared GLSL. Scene shaders get PRELUDE prepended and must define `vec3 scene(vec2 p, vec2 uv)`. */

export const VERT = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); gl_Position = vec4(p*2.-1., 0., 1.); }`;

export const HELPERS = `
#define PI 3.14159265
#define TAU 6.28318531
float h11(float n){ return fract(sin(n*127.1+311.7)*43758.5453); }
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
vec2 h22(vec2 p){ float n = h21(p); return vec2(n, h21(p+n*19.19)); }
vec3 h33(vec3 p){ p = fract(p*vec3(.1031,.1030,.0973)); p += dot(p, p.yxz+33.33); return fract((p.xxy+p.yxx)*p.zyx); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*vnoise(p); p=p*2.03+vec2(17.1,9.3); a*=.5; } return v; }
float fbm3(vec2 p){ float v=0., a=.5; for(int i=0;i<3;i++){ v+=a*vnoise(p); p=p*2.03+vec2(17.1,9.3); a*=.5; } return v; }
mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,s,-s,c); }
float lum(vec3 c){ return dot(c, vec3(.299,.587,.114)); }
vec3 hueRot(vec3 c, float a){ const vec3 k = vec3(.57735); float ca = cos(a); return c*ca + cross(k, c)*sin(a) + k*dot(k, c)*(1. - ca); }
`;

export const PRELUDE = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime, uT, uBass, uMid, uHigh, uLevel, uKick, uAccent, uBeatPhase, uReact, uChaos, uSpecRow, uImgAspect, uHasImg, uDry;
uniform float uImgH; // picture height in pixels (sharp, alias-free sampling)
uniform float uS[6];
uniform int uMode;
uniform vec3 uPal[5];
uniform vec3 uMouse;
uniform sampler2D uFFT, uWave, uSpec, uImg, uPrev;
out vec4 fragColor;
${HELPERS}
vec3 pal(float t){ t = clamp(t, 0., 1.)*4.; int i = int(min(floor(t), 3.)); return mix(uPal[i], uPal[i+1], smoothstep(0., 1., t - float(i))); }
vec3 palC(float t){ return pal(t) * (1. + max(t - 1., 0.)*1.5); }
float fft(float x){ return texture(uFFT, vec2(clamp(x, 0., 1.), .5)).r; }
vec3 wave(float x){ return texture(uWave, vec2(clamp(x, 0., 1.), .5)).rgb*2. - 1.; }
float spec(float x, float rowsAgo){ return texture(uSpec, vec2(x, fract(uSpecRow - rowsAgo/128. + 1.))).r; }
float S(int i){ return uS[i]; }
// image helpers: "cover" maps p (height 1, centered) onto the photo; mirrored repeat outside
vec2 imgUV(vec2 q){ float A = uRes.x/uRes.y; float s = max(1., A/uImgAspect); return vec2(q.x/uImgAspect, q.y)/s + .5; }
vec3 img(vec2 q){ return textureLod(uImg, imgUV(q), 0.).rgb; }
vec3 imgL(vec2 q, float l){ return textureLod(uImg, imgUV(q), l).rgb; }
vec3 imgRaw(vec2 uv){ return textureLod(uImg, uv, 0.).rgb; }
`;

export const SCENE_MAIN = `
void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  vec2 p = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  fragColor = vec4(max(scene(p, uv), 0.), 1.);
}`;

/** Trails / feedback: blends this frame with a warped copy of the last one. */
export const FEEDBACK = `#version 300 es
precision highp float;
uniform sampler2D uScene, uPrevAcc, uEmblem;
uniform vec2 uRes;
uniform float uPhoto; // 1 while a picture is shown on the picture scene: keep it sharp
uniform float uTrails, uChaos, uBass, uKick, uTime, uEmblemOn, uEmblemSize, uEmblemOpacity, uEmblemPulse, uEmblemSpin, uEmblemAspect, uEmblemWhite, uEmblemInvert;
uniform vec3 uPal[5];
uniform vec2 uMouseP, uMouseV;
uniform float uMouseAct, uCurMode, uCurAmt;
out vec4 fragColor;
${HELPERS}
vec4 emblem(vec2 p){
  float s = uEmblemSize*(1. + uKick*uEmblemPulse*.25);
  vec2 q = rot(uTime*uEmblemSpin)*p/s;
  q.x /= uEmblemAspect;
  vec2 euv = q + .5;
  if(any(lessThan(euv, vec2(0.))) || any(greaterThan(euv, vec2(1.)))) return vec4(0.);
  vec4 e = texture(uEmblem, vec2(euv.x, euv.y));
  vec3 c = mix(mix(uPal[3], uPal[4], lum(e.rgb)), vec3(lum(e.rgb)), uEmblemWhite);
  c = mix(e.rgb, c, .7);
  if(uEmblemInvert > .5) c = 1. - c;
  return vec4(c, e.a*uEmblemOpacity);
}
void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  float A = uRes.x/uRes.y;
  vec3 cur = texture(uScene, uv).rgb;
  vec2 p = (uv - .5)*vec2(A, 1.);
  if(uEmblemOn > .5){ vec4 e = emblem(p); cur = mix(cur, e.rgb*1.2, e.a); }
  // feedback warp: gentle zoom on bass, chaos adds turbulent drift and tunnel pull
  // (a shown picture keeps its history aligned, so it stays crisp instead of ghosting)
  vec2 fc = p;
  float drift = 1. - uPhoto;
  fc *= 1. - (.002 + uBass*.014 + uChaos*.012)*drift;
  fc = rot(uChaos*.012*sin(uTime*.31)*drift)*fc;
  fc += (vec2(fbm3(fc*3. + uTime*.4), fbm3(fc*3. - uTime*.37 + 7.)) - .5)*.012*uChaos*drift;
  // cursor: drag or whirl the picture's history around the pointer
  if(uCurMode > .5 && uMouseAct > .001){
    vec2 m = (uMouseP - .5)*vec2(A, 1.);
    vec2 dm = fc - m; float dd = length(dm);
    float fall = exp(-dd*dd/(.012 + uCurAmt*.05));
    if(uCurMode < 1.5) fc -= uMouseV*vec2(A, 1.)*.03*fall*uCurAmt*1.6;
    else if(uCurMode < 2.5) fc = m + rot(uMouseAct*fall*uCurAmt*.5)*dm;
    if(uCurMode < 1.5 || uCurMode > 3.5) cur += mix(uPal[3], uPal[4], .25)*exp(-dd*dd/.002)*uMouseAct*.35*uCurAmt;
  }
  vec3 prev = texture(uPrevAcc, fc/vec2(A, 1.) + .5).rgb;
  float t = uTrails*.95*(1. - uPhoto*.45);
  vec3 col = mix(cur, prev, t);
  col = max(col, cur*(1. - t*.55));
  fragColor = vec4(col, 1.);
}`;

/** Final composite: frame transforms, lens materials, bloom, exposure, color, vignette. */
export const FINAL = `#version 300 es
precision highp float;
uniform sampler2D uAcc, uEmblem, uCap;
uniform vec2 uRes;
uniform float uCapOn, uCapAlpha, uCapPulse, uCapTint;
uniform vec2 uMouseP;
uniform float uMouseAct, uCurMode, uCurAmt;
uniform vec3 uClick; // x, y, seconds since the click
uniform float uTime, uBass, uMid, uHigh, uKick, uAccent, uHeat, uBright, uExposure, uHue, uVig, uChaos;
uniform float uSym, uTiles, uTwist, uSlice, uSpin, uLens, uLensStyle;
uniform float uEmblemOn, uEmblemClean, uEmblemSize, uEmblemOpacity, uEmblemPulse, uEmblemSpin, uEmblemAspect, uEmblemWhite, uEmblemInvert;
uniform vec3 uPal[5];
uniform float uLetter; // 1 = draw frame guides off
uniform float uPhoto; // 1 while a picture is shown: it looks exactly like the file, music adds glow to its highlights
out vec4 fragColor;
${HELPERS}
vec2 mirror(vec2 uv){ return 1. - abs(1. - mod(uv, 2.)); }
vec3 knee(vec3 c, float k){ vec3 o = max(c - k, 0.); return min(c, vec3(k)) + (1. - k)*(1. - exp(-o/(1. - k))); }
void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  float A = uRes.x/uRes.y;
  vec2 p = (uv - .5)*vec2(A, 1.);
  // ---- frame transforms (stack in this order) ----
  if(uSym > .5){
    p = rot(uSpin)*p;
    if(uSym < 1.5) p.x = abs(p.x);
    else if(uSym < 2.5) p = abs(p);
    else { float r = length(p), a = atan(p.y, p.x), seg = TAU/uSym; a = mod(a, seg); a = abs(a - seg*.5); p = r*vec2(cos(a), sin(a)); }
  }
  if(uTiles > .5){ float n = uTiles + 1.; p = (fract(p*n/1. + .5) - .5); }
  if(abs(uTwist) > .001){ float r = length(p); p = rot(uTwist*5.*exp(-r*1.6)*(1. + uBass*.4))*p; }
  if(uSlice > .001){ float band = floor(p.y*(5. + uSlice*28.)); p.x += (h11(band + floor(uTime*2.5)) - .5)*uSlice*.45*(.35 + uBass + uKick); }
  // ---- lens materials ----
  vec2 q = p;
  float shade = 1.;
  vec3 tint = vec3(1.);
  if(uLens > .001){
    float L = uLens;
    int st = int(uLensStyle + .5);
    if(st == 0){ // glass ribs: vertical fluted glass
      float w = .045; float fx = fract(q.x/w) - .5; q.x -= fx*w*L*1.8; shade = 1. + L*(.25*(1. - abs(fx)*4.)*step(abs(fx), .25) - .12*smoothstep(.35, .5, abs(fx)));
    } else if(st == 1){ // glass fan: radial flutes
      float a = atan(q.y, q.x), r = length(q); float n = 36.; float fa = fract(a/TAU*n) - .5; a -= fa*TAU/n*L*1.6; q = r*vec2(cos(a), sin(a)); shade = 1. + L*.18*(1. - abs(fa)*3.);
    } else if(st == 2){ // anamorphic: horizontal squeeze with blue streak flare
      q.x *= 1. - L*.35; q.y *= 1. + L*.08;
    } else if(st == 3){ // melt: drips that run down with the mids
      float d = pow(vnoise(vec2(q.x*9., 1.3)), 2.)*(.2 + uMid*.6); q.y += d*L*.35; q.x += (fbm3(vec2(q.y*4., uTime*.3)) - .5)*L*.06;
    } else if(st == 4){ // glitch: block displacement on accents
      vec2 b = floor(uv*vec2(14., 9.)); float on = step(1. - (.08 + uAccent*.5 + uKick*.2)*L, h21(b + floor(uTime*9.)));
      q += (h22(b + floor(uTime*9.)) - .5)*.25*on*L; tint = mix(vec3(1.), vec3(1.15, .85, 1.2), on);
    } else if(st == 5){ // pixels
      float n = mix(220., 26., L); q = (floor(q*n) + .5)/n;
    } else { // fly eye: hexagonal lenslets
      float n = mix(40., 9., L); vec2 r = vec2(1., 1.732); vec2 g = q*n; vec2 a = mod(g, r) - r*.5, b = mod(g - r*.5, r) - r*.5; vec2 c = dot(a,a) < dot(b,b) ? a : b; vec2 id = g - c;
      q = id/n + c/n*(1. - L*.75); shade = 1. - dot(c, c)*.9*L;
    }
  }
  // cursor lens and click shockwave
  vec2 mp = (uMouseP - .5)*vec2(A, 1.);
  float wave = 0.;
  if(uCurMode > 2.5 && uCurMode < 3.5){
    vec2 d = q - mp; float r = length(d) + 1e-5;
    q += d/r*sin(r*48. - uTime*9.)*.018*exp(-r*5.)*uMouseAct*uCurAmt*2.;
    q = mp + d*(1. - .32*exp(-r*r*35.)*uCurAmt*(.4 + uMouseAct));
  }
  if(uCurMode > .5 && uClick.z < 2.5){
    vec2 d = q - (uClick.xy - .5)*vec2(A, 1.); float r = length(d) + 1e-5;
    float rad = uClick.z*1.1;
    wave = exp(-abs(r - rad)*45.)*exp(-uClick.z*1.8)*uCurAmt;
    q -= d/r*wave*.035;
  }
  q += (vec2(fbm3(q*2.5 + uTime*.15), fbm3(q*2.5 - uTime*.15 + 4.)) - .5)*uChaos*.05*(1. - uPhoto*.85);
  vec2 suv = mirror(q/vec2(A, 1.) + .5);
  vec3 c;
  if(uLens > .001 && int(uLensStyle + .5) == 2){ // anamorphic chromatic spread + streak
    float o = uLens*.006;
    c = vec3(texture(uAcc, suv + vec2(o, 0.)).r, texture(uAcc, suv).g, texture(uAcc, suv - vec2(o, 0.)).b);
    vec3 streak = textureLod(uAcc, vec2(suv.x*.2 + .4, suv.y), 5.).rgb;
    c += streak*streak*vec3(.4, .6, 1.4)*uLens*.8;
  } else c = texture(uAcc, suv).rgb;
  c *= shade*tint;
  // ---- bloom + flash ----
  vec3 g = textureLod(uAcc, suv, 2.5).rgb*.4 + textureLod(uAcc, suv, 4.5).rgb*.6;
  vec3 hl = max(g - .55, 0.);
  c += mix(g*g*uHeat*(1.4 + uBass*1.2), hl*hl*uHeat*(uBass*2.4 + uKick*2. + uHigh*.8), uPhoto);
  c += uKick*uHeat*.08*uPal[4]*(1. - uPhoto);
  if(uCurMode > 3.5) c += mix(uPal[3], uPal[4], .6)*exp(-length(p - mp)*9.)*(.12 + uMouseAct*.6)*uCurAmt;
  c += uPal[4]*wave*.35;
  c *= uExposure*uBright;
  c = hueRot(c, uHue);
  float v = smoothstep(1.3, .2, length((uv - .5)*vec2(A*.9, 1.)));
  c *= mix(1., v, uVig);
  c = knee(max(c, 0.), mix(.74, .96, uPhoto)); // a shown picture keeps its whites white
  if(uEmblemOn > .5 && uEmblemClean > .5){
    vec2 ep = (uv - .5)*vec2(A, 1.);
    float s = uEmblemSize*(1. + uKick*uEmblemPulse*.25);
    vec2 e = rot(uTime*uEmblemSpin)*ep/s; e.x /= uEmblemAspect; e += .5;
    if(all(greaterThan(e, vec2(0.))) && all(lessThan(e, vec2(1.)))){
      vec4 em = texture(uEmblem, e);
      vec3 ec = mix(em.rgb, vec3(lum(em.rgb)), uEmblemWhite);
      if(uEmblemInvert > .5) ec = 1. - ec;
      c = mix(c, ec, em.a*uEmblemOpacity);
    }
  }
  if(uCapOn > .5){ // titles and lyrics, drawn crisp above every effect
    vec2 cuv = (uv - .5)/(1. + uKick*uCapPulse*.035) + .5;
    vec4 t = texture(uCap, cuv);
    vec3 tc = mix(t.rgb, t.rgb*mix(vec3(1.), uPal[4]*1.15 + .1, uCapTint), step(.5, t.r));
    c = mix(c, tc, t.a*uCapAlpha);
  }
  c += (h21(gl_FragCoord.xy + fract(uTime)*91.) - .5)/255.;
  fragColor = vec4(c, 1.);
}`;

export const LUMA = `#version 300 es
precision highp float;
uniform sampler2D uAcc;
out vec4 fragColor;
void main(){
  vec3 c = vec3(0.);
  for(int y=0;y<4;y++) for(int x=0;x<4;x++) c += textureLod(uAcc, (vec2(x,y)+.5)/4., 4.).rgb;
  float l = dot(c/16., vec3(.299,.587,.114));
  fragColor = vec4(l, l, l, 1.);
}`;
