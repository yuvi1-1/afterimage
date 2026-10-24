import type { Scene } from "./types";

export const signal: Scene = {
  id: "signal", name: "Signal", group: "Signal", blurb: "Technical meters: analyzer, waterfall, scope, stereo vector and Lissajous.",
  modes: ["analyzer", "waterfall", "scope", "vector", "lissajous"],
  scale: 0.85,
  sliders: [{ label: "speed", def: 50 }, { label: "shape", def: 30 }, { label: "bars", def: 50 }, { label: "glow", def: 50 }],
  frag: `
vec2 wpt(float i, float n){ vec3 w = wave(i/n); return w.xy; }
float segd(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba)/max(dot(ba, ba), 1e-6), 0., 1.); return length(pa - ba*h); }
vec3 grid(vec2 p){ vec2 g = abs(fract(p*10.) - .5); return pal(.12)*smoothstep(.02, .0, min(g.x, g.y))*.35; }
vec3 scene(vec2 p, vec2 uv){
  vec3 col = pal(.02);
  float glow = .5 + S(3);
  if(uMode == 0){ // analyzer with peak hold
    float n = 24. + floor(S(2)*104.);
    float x = floor(uv.x*n)/n;
    float v = fft(x + .5/n);
    float peak = 0.;
    for(int i=0;i<36;i++) peak = max(peak, spec(x + .5/n, float(i)));
    float bar = step(uv.y, v*.85 + .02)*step(.12, fract(uv.x*n));
    float cap = smoothstep(.006, .0, abs(uv.y - peak*.85 - .025))*step(.12, fract(uv.x*n));
    col += pal(.3 + uv.y*.7)*bar*glow + pal(1.)*cap;
    col += grid(p)*.5;
  } else if(uMode == 1){ // waterfall terrain
    float rows = uv.y*128.;
    float v = spec(pow(uv.x, 1.2), rows);
    col += pal(v)*v*1.6*glow*(1. - uv.y*.5);
  } else if(uMode == 2){ // triggered scope
    col += grid(p);
    float n = 256.;
    float d = 1e9;
    float x0 = (uv.x)*n;
    for(int k=-2;k<=2;k++){
      float i = clamp(floor(x0) + float(k), 0., n - 2.);
      vec2 a = vec2(i/n, wave(i/n).z*.42 + .5), b = vec2((i + 1.)/n, wave((i + 1.)/n).z*.42 + .5);
      d = min(d, segd(vec2(uv.x, uv.y), a, b));
    }
    col += pal(.85)*smoothstep(.006, .0, d)*glow + pal(.6)*exp(-d*80.)*.4*glow;
  } else { // vector (goniometer) and lissajous (L vs R)
    col += grid(p)*.6;
    float n = 192.;
    float d = 1e9;
    vec2 prev = vec2(0.);
    for(int i=0;i<192;i++){
      vec2 lr = wpt(float(i), n);
      vec2 pt = (uMode == 3 ? rot(PI*.25)*lr : lr)*(1.1 + S(1)*2.2);
      if(uMode == 4){ pt.y += (float(i)/n - .5)*S(1)*.3; }
      if(i > 0) d = min(d, segd(p, prev, pt));
      prev = pt;
    }
    col += pal(.9)*smoothstep(.004, .0, d)*glow + pal(.6)*exp(-d*60.)*.5*glow;
  }
  return col;
}`,
};
