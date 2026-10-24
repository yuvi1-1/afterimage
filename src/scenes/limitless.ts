import type { Scene } from "./types";

export const LIMITLESS_MODES = [
  "none", "flare", "smear", "droste", "infinite", "corridor", "cube", "planet", "windows", "melt", "shatter",
  "prism", "terrain", "breathe", "mosh", "sort", "coral", "scanline", "thresh", "solar", "halftone", "vhs",
];
// modes that tile the picture as an endless mirrored plane instead of framing it
const MIRROR = [2, 3, 4, 8, 9, 10, 11, 12, 14, 16];

const frag = /* glsl */ `
float t, B, M, H, L, K, Sh, C;
bool mirrorMode(){ return ${MIRROR.map((m) => `uMode == ${m}`).join(" || ")}; }
// placeholder art when nothing is dropped: soft palette nebula
vec3 placeholder(vec2 q){
  float n = fbm(q*2.2 + vec2(0., uTime*.03)), m = fbm(q*4. + n*2.);
  vec3 c = pal(clamp(n*1.1 - .1 + m*.25, 0., 1.));
  float r = length(q);
  c += pal(.95)*smoothstep(.22, .0, abs(r - .28 - (m - .5)*.08))*.9;
  return c;
}
vec2 fitUV(vec2 q){
  float r = (uRes.x/uRes.y)/uImgAspect;
  float s = mirrorMode() ? max(1., r) : min(1., r);
  float z = exp2((S(3) - .5)*2.6);
  return vec2(q.x/uImgAspect, q.y)/(s*z) + .5;
}
vec3 samp(vec2 uv, float l){
  if(uHasImg < .5){ return placeholder((uv - .5)*vec2(uImgAspect, 1.)); }
  vec3 c = textureLod(uImg, uv, l).rgb;
  if(mirrorMode()) return c;
  vec2 o = abs(uv - .5) - .5;
  float e = smoothstep(-.002, .003, max(o.x, o.y));
  if(e > 0.) c = mix(c, textureLod(uImg, (uv - .5)*.4 + .5, 6.).rgb*.4, e);
  return c;
}
vec3 im(vec2 q){ return samp(fitUV(q), 0.); }
vec3 imL(vec2 q, float l){ return samp(fitUV(q), l); }
vec3 imUV(vec2 uv, float l){ return uHasImg < .5 ? placeholder(uv - .5) : textureLod(uImg, uv, l).rgb; }

vec3 mFlare(vec2 q){
  float pulse = 1. - B*.07 - K*.035;
  vec2 qs = rot(sin(t*.25)*.04*Sh)*q*pulse;
  vec3 base = im(qs), acc = vec3(0); float w = 0.;
  float len = .05 + .07*Sh + .08*M;
  for(int i=1;i<16;i++){ float f = float(i)/16.; vec2 qq = rot(f*(C - .3)*.5)*qs*(1. - f*len); float wi = 1. - f; acc += max(im(qq) - .4, 0.)*wi; w += wi; }
  return base + acc/w*(1.1 + L*1.5);
}
vec3 mSmear(vec2 q){
  float k = 1.4 + C*4.; vec3 acc = vec3(0); float w = 0.; vec2 pp = q;
  for(int i=0;i<8;i++){ float a = fbm(pp*k + vec2(t*.15, -t*.1))*TAU*2.; pp += vec2(cos(a), sin(a))*(.01 + .03*M + .02*Sh); float wi = 1. - float(i)/9.; acc += im(pp)*wi; w += wi; }
  return acc/w;
}
vec3 mDroste(vec2 q){
  float r = length(q) + 1e-4, a = atan(q.y, q.x), P = log(mix(2., 5., Sh)), n = floor(C*3. + .5);
  float zx = mod(log(r) + a*n*P/TAU - t*.35 - B*.15, P) - P;
  return imL(rot(t*.08)*vec2(cos(a), sin(a))*.95*exp(zx)*1.6, 0.);
}
vec3 mInfinite(vec2 q){
  float f = fract(t*.12); vec2 qr = rot(t*.05 + B*.05)*q;
  float s1 = exp2(-f)*(1. + C), s2 = exp2(1. - f)*(1. + C);
  vec3 a = imL(qr*s1, 0.), b = imL(qr*s2, .6);
  vec3 c = mix(a, b, smoothstep(0., 1., f));
  // neon frames between reflections
  float fr = abs(fract(log2(max(abs(qr.x), abs(qr.y))*2.5) - f) - .5);
  return c + pal(.85)*smoothstep(.03, .0, fr)*(.4 + K);
}
vec3 mCorridor(vec2 q){
  float r = mix(length(q), max(abs(q.x), abs(q.y)), Sh) + 1e-3, a = atan(q.y, q.x), n = 1. + floor(C*4.);
  return imUV(vec2(abs(a)/PI*n, .32/r + t*.45 + B*.05), 0.)*smoothstep(0., .38, r)*(1.1 + L*.4);
}
vec3 mCube(vec2 q){
  vec3 ro = vec3(0., 0., -3.4), rd = normalize(vec3(q, 1.5));
  mat2 r1 = rot(t*.3 + K*.25), r2 = rot(t*.21);
  ro.xz *= r1; rd.xz *= r1; ro.yz *= r2; rd.yz *= r2;
  float sz = .95 + B*.28;
  vec3 m = 1./rd, n = m*ro, k = abs(m)*sz, t1 = -n - k, t2 = -n + k;
  float tN = max(max(t1.x, t1.y), t1.z), tF = min(min(t2.x, t2.y), t2.z);
  vec3 bg = imL(rot(t*.03)*q*(.7 - Sh*.3), 4.)*(.18 + Sh*.3);
  if(tN > tF || tF < 0.) return bg;
  vec3 pos = ro + rd*tN, nor = -sign(rd)*step(t1.yzx, t1.xyz)*step(t1.zxy, t1.xyz);
  vec2 fuv = abs(nor.x) > .5 ? pos.zy : (abs(nor.y) > .5 ? pos.xz : pos.xy);
  vec3 c = imUV(fuv/(2.*sz) + .5, 0.);
  vec3 ap = abs(pos)/sz; float mid = ap.x + ap.y + ap.z - max(ap.x, max(ap.y, ap.z)) - min(ap.x, min(ap.y, ap.z));
  return c*(.35 + .65*max(dot(nor, normalize(vec3(.5, .8, -.6))), 0.)) + smoothstep(.955, 1., mid)*(.35 + K*.9)*pal(.9);
}
vec3 mPlanet(vec2 q){
  float r = length(q), zoom = mix(1.1, 3.2, Sh)*(1. - B*.18);
  float R = .36;
  if(r > R){ float halo = exp(-(r - R)*12.)*(.5 + L); return pal(.75)*halo + pal(.05)*.3; }
  float z = sqrt(R*R - r*r);
  vec3 n = normalize(vec3(q, z));
  float lon = atan(n.x, n.z) + t*.3, lat = asin(n.y);
  vec3 c = imUV(vec2(lon/TAU*(1. + floor(C*3.)), lat/PI + .5), 0.);
  return c*(.3 + .7*max(dot(n, normalize(vec3(-.4, .5, .8))), 0.)) + pal(.9)*pow(1. - n.z, 3.)*.6;
}
vec3 mWindows(vec2 q){
  float n = 2. + floor(C*6.); vec2 g = q*n, id = floor(g), f = fract(g) - .5;
  float band = fft(.04 + h21(id)*.8), gap = .05 + Sh*.3, mask = step(max(abs(f.x), abs(f.y)), .5 - gap*.5);
  vec2 off = (h22(id + floor(t*.2)) - .5)*.25*(1. + M);
  vec3 c = im((id + .5)/n + f/(n*(1. + band*.7)) + off*.3)*(.55 + band*1.1);
  return c*mask + (1. - mask)*pal(.0);
}
vec3 mMelt(vec2 q){
  float drip = pow(vnoise(vec2(q.x*(5. + C*20.), 3.1)), 3.)*(.35 + Sh); vec2 qq = q;
  qq.y += drip*(.25 + M*.7)*(.55 + .45*sin(t*.35)); qq.x += (fbm3(vec2(q.y*3., t*.2)) - .5)*.08*(1. + B);
  vec3 acc = vec3(0); for(int i=0;i<6;i++) acc += im(qq + vec2(0., float(i)*.012*(.3 + drip))); return acc/6.;
}
vec3 mShatter(vec2 q){
  float n = 3. + C*10.; vec2 g = q*n, id = floor(g), f = fract(g); float md = 8., md2 = 8.; vec2 mid = id;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec2 b = vec2(i, j), o = h22(id + b); o = .5 + .4*sin(t*.3 + TAU*o); vec2 r = b + o - f; float d = dot(r, r); if(d < md){ md2 = md; md = d; mid = id + b; } else if(d < md2) md2 = d; }
  vec2 center = (mid + .5)/n; float push = K*.35 + B*.15 + Sh*.3;
  vec2 src = center*(1. - push*.45) + rot((h21(mid) - .5)*push*1.6)*(q - center);
  return im(src) + (1. - smoothstep(0., .07, sqrt(md2) - sqrt(md)))*(.3 + K*.9)*pal(.9);
}
vec3 mPrism(vec2 q){
  vec2 qq = rot(t*.1)*q; int it = 1 + int(C*3.);
  for(int i=0;i<4;i++){ if(i >= it) break; qq = abs(qq) - .18*(.3 + Sh); qq *= rot(.55 + .2*sin(t*.2)); }
  qq *= 1. - B*.2; qq += vec2(t*.03, 0.); float ca = .008 + H*.05 + .02*C;
  return vec3(im(qq*(1. + ca)).r, im(qq).g, im(qq*(1. - ca)).b);
}
vec3 mTerrain(vec2 q){
  float d = abs(q.y - (Sh - .5)*.4) + 1e-3, z = .35/d; vec2 uq = vec2(q.x*z, z + t*.6);
  uq.y += lum(im(uq*.5))*(.2 + B*.6)*(1. + C);
  return mix(pal(.0), im(uq*.5), exp(-z*.08)) + exp(-d*30.)*(.15 + L*.7)*pal(.85);
}
vec3 mBreathe(vec2 q){
  float r = length(q), pulse = B*.35 + K*.15, wob = (fbm(q*3. + t*.2) - .5)*.1*(1. + C*2.);
  // contour crawl: texture slides along iso-lines of the picture's brightness
  vec3 base = im(normalize(q + 1e-5)*pow(max(r*(1. - pulse*exp(-r*2.)) + wob, 0.), 1. + Sh*.6));
  float l = lum(base); vec2 e = vec2(.004, 0.);
  vec2 g = vec2(lum(im(q + e.xy)) - lum(im(q - e.xy)), lum(im(q + e.yx)) - lum(im(q - e.yx)));
  vec2 tang = vec2(-g.y, g.x)*(6. + C*14.);
  vec3 crawl = im(q + tang*sin(t*1.3 + l*12.)*.02);
  return mix(base, crawl, .55);
}
vec3 mMosh(vec2 q, vec2 uv){
  vec2 bs = vec2(16., 9.)*(1. + floor(C*4.)), bid = floor(uv*bs);
  vec2 mv = (h22(bid + floor(t*1.5)) - .5)*(.006 + .03*M + .01*Sh);
  vec3 prev = textureLod(uPrev, uv - mv, 0.).rgb;
  float refresh = step(.965, h21(bid + floor(t*4.))), keep = clamp(.93 - K*1.1, 0., .97);
  return mix(prev, im(q), max(1. - keep, refresh));
}
vec3 mSort(vec2 q){
  vec2 dir = rot(Sh*PI)*vec2(0., -1.); float thr = .72 - B*.35 - C*.3;
  vec3 best = im(q); float bl = lum(best);
  for(int i=1;i<24;i++){ vec3 s = im(q + dir*float(i)*.011*(1. + M)); float l = lum(s); if(l > thr && l > bl){ best = mix(s, best, float(i)/24.); bl = l; } }
  return best;
}
vec3 mCoral(vec2 q){
  float k = 2. + C*4.; vec2 w1 = vec2(fbm(q*k + t*.1), fbm(q*k + vec2(5.2, 1.3) - t*.1));
  vec2 w2 = vec2(fbm(q*k + 4.*w1 + vec2(1.7, 9.2) + t*.15), fbm(q*k + 4.*w1 + vec2(8.3, 2.8)));
  vec3 c = im(q + (w2 - .5)*(.3 + M*.4 + Sh*.5));
  float grow = smoothstep(.55, .9, lum(c) + w2.x*.4 - .2 + B*.2);
  return mix(c*(.7 + .6*w2.x), pal(.9)*1.2, grow*.5);
}
vec3 mScanline(vec2 q, vec2 uv){
  // slit-scan: each row shows the picture from a slightly different moment (via the trail buffer)
  float rows = 60. + C*300., row = floor(uv.y*rows);
  float lag = (h11(row) - .5)*(.05 + Sh*.3)*(.4 + M);
  vec3 now = im(q + vec2(sin(row*.15 + t*2.)*M*.03, 0.));
  vec3 past = textureLod(uPrev, uv + vec2(lag, 0.), 0.).rgb;
  return mix(now, past, .55*step(.5 - H*.3, h11(row*1.7 + floor(t*6.))));
}
vec3 mThresh(vec2 q){
  vec3 c = im(q); float l = lum(c); float n = 3. + floor(C*6.);
  float band = floor(l*n + B*.6)/n;
  vec2 e = vec2(.0025, 0.);
  float edge = abs(lum(im(q + e.xy)) - lum(im(q - e.xy))) + abs(lum(im(q + e.yx)) - lum(im(q - e.yx)));
  vec3 flat_ = mix(pal(band), c*band*1.4, Sh);
  return flat_*(1. - smoothstep(.06, .14, edge)*.9);
}
vec3 mSolar(vec2 q){
  vec3 c = im(q); float th = .45 + .3*sin(t*.5) + (C - .5)*.4 - B*.15;
  vec3 s = mix(c, 1. - c, step(vec3(th), c));
  return mix(s, pal(lum(s))*1.2, Sh*.6);
}
vec3 mHalftone(vec2 q){
  float n = 40. + C*110.; vec2 r = rot(.26)*q*n, id = floor(r) + .5;
  vec3 c = im(rot(-.26)*(id/n)); float l = lum(c), rad = (.12 + sqrt(l)*.62)*(1. + B*.25), dd = length(fract(r) - .5);
  float ink = smoothstep(rad, rad - .09, dd);
  return mix(c*ink*1.25, pal(mix(.0, 1., ink)), Sh);
}
vec3 mVhs(vec2 q, vec2 uv){
  float trk = 1. - smoothstep(0., .05, abs(uv.y - fract(t*.11)));
  float wob = sin(uv.y*12. + t*3.)*.004 + (vnoise(vec2(uv.y*80., t*6.)) - .5)*.012*(1. + H*3.);
  vec2 qq = q + vec2(wob + trk*.05*(1. + M), 0.); float ca = .006 + .012*Sh + K*.02;
  vec3 c = vec3(im(qq + vec2(ca, 0.)).r, im(qq).g, im(qq - vec2(ca, 0.)).b);
  c = mix(c, vec3(lum(c)), .15);
  c += (h21(floor(uv*vec2(320., 240.)) + floor(t*24.)) - .5)*.12*(.4 + C);
  c *= .9 + .1*sin(uv.y*uRes.y*1.6);
  float head = smoothstep(.97, 1., 1. - uv.y)*step(.5, h11(floor(t*30.)));
  return c + trk*.15 + head*.4;
}

vec3 scene(vec2 p, vec2 uv){
  t = uT; B = uBass; M = uMid; H = uHigh; L = uLevel; K = uKick; Sh = S(1); C = S(2);
  p += (vec2(fbm3(p*2. + t*.2), fbm3(p*2. - t*.2 + 7.)) - .5)*uChaos*(.12 + .2*M);
  vec3 c;
  int m = uMode;
  if(m == 0) c = im(p*(1. - B*.06));
  else if(m == 1) c = mFlare(p);
  else if(m == 2) c = mSmear(p);
  else if(m == 3) c = mDroste(p);
  else if(m == 4) c = mInfinite(p);
  else if(m == 5) c = mCorridor(p);
  else if(m == 6) c = mCube(p);
  else if(m == 7) c = mPlanet(p);
  else if(m == 8) c = mWindows(p);
  else if(m == 9) c = mMelt(p);
  else if(m == 10) c = mShatter(p);
  else if(m == 11) c = mPrism(p);
  else if(m == 12) c = mTerrain(p);
  else if(m == 13) c = mBreathe(p);
  else if(m == 14) c = mMosh(p, uv);
  else if(m == 15) c = mSort(p);
  else if(m == 16) c = mCoral(p);
  else if(m == 17) c = mScanline(p, uv);
  else if(m == 18) c = mThresh(p);
  else if(m == 19) c = mSolar(p);
  else if(m == 20) c = mHalftone(p);
  else c = mVhs(p, uv);
  float contrast = .55 + S(4)*1.1;
  c = (c - .5)*contrast + .5;
  if(m != 0 && m != 12) c = mix(im(p), c, S(5));
  return c;
}`;

export const limitless: Scene = {
  id: "limitless",
  name: "Limitless",
  group: "Image",
  blurb: "Your photo, album cover, video or camera, put through 22 image-trip modes.",
  modes: LIMITLESS_MODES,
  image: true,
  sliders: [
    { label: "speed", def: 50 },
    { label: "shape", def: 30 },
    { label: "complexity", def: 30 },
    { label: "fill", def: 50 },
    { label: "contrast", def: 41 },
    { label: "dry/wet", def: 100 },
  ],
  frag,
};
