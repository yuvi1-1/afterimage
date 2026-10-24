import type { Scene } from "./types";

export const ink: Scene = {
  id: "ink", name: "Ink", group: "Fluid", blurb: "Folding smoke. Bass deepens the warp, mids stir it.",
  sliders: [{ label: "speed", def: 45 }, { label: "warp", def: 55 }, { label: "detail", def: 50 }, { label: "density", def: 55 }, { label: "contrast", def: 50 }],
  frag: `
vec3 scene(vec2 p, vec2 uv){
  float t = uT*.25;
  float k = 1.2 + S(2)*2.5;
  vec2 q = p*k;
  float w = .6 + S(1)*2.2 + uBass*1.6;
  vec2 a = vec2(fbm(q + vec2(0., t)), fbm(q + vec2(5.2, 1.3) - t*.7));
  vec2 b = vec2(fbm(q + w*a + vec2(1.7, 9.2) + t*.4 + uMid*.6), fbm(q + w*a + vec2(8.3, 2.8) - t*.3));
  float f = fbm(q + w*b + uKick*.4);
  float dens = .45 + S(3)*.9;
  float v = pow(clamp(f*dens + length(b)*.35 - .15, 0., 1.), .7 + (1. - S(4))*.8);
  vec3 c = pal(v);
  c += pal(1.)*pow(max(b.x - .55, 0.)*2.2, 2.)*(.6 + uHigh);
  return c;
}`,
};

export const sand: Scene = {
  id: "sand", name: "Sand", group: "Pattern", blurb: "Chladni plate figures chosen by the loudest part of the spectrum.",
  sliders: [{ label: "speed", def: 40 }, { label: "shape", def: 0 }, { label: "figure", def: 35 }, { label: "grains", def: 60 }, { label: "glow", def: 50 }],
  frag: `
float chladni(vec2 p, float n, float m, float shape){
  vec2 q = p*2.2;
  float sq = cos(n*PI*q.x)*cos(m*PI*q.y) - cos(m*PI*q.x)*cos(n*PI*q.y);
  float r = length(q), a = atan(q.y, q.x);
  float circ = cos(n*a)*cos(m*PI*r*.9)*sqrt(max(1. - r*.3, 0.));
  return mix(sq, circ, shape);
}
vec3 scene(vec2 p, vec2 uv){
  // the loudest band picks the mode numbers; "figure" offsets them in 12 steps
  float best = 0., bi = 0.;
  for(int i=0;i<16;i++){ float f = fft(float(i)/16.*.6 + .02); if(f > best){ best = f; bi = float(i); } }
  float fig = floor(S(2)*11.99);
  float n = 1. + mod(bi + fig, 7.), m = n + 1. + mod(fig + floor(uT*.05), 4.);
  float f = chladni(p, n, m, S(1));
  float f2 = chladni(p, n + 1., m + 1., S(1));
  f = mix(f, f2, smoothstep(.3, .7, fract(uT*.07)));
  float line = exp(-abs(f)*(14. + uBass*10.));
  float grain = step(1. - (.25 + S(3)*.6)*line, h21(floor(gl_FragCoord.xy*.9) + floor(uTime*20.)*S(3)));
  float v = line*.55 + grain*.6*S(3);
  vec3 c = pal(.06) + pal(clamp(v, 0., 1.))*v;
  c += pal(1.)*line*line*S(4)*(.4 + uLevel);
  return c;
}`,
};

export const spacetime: Scene = {
  id: "spacetime", name: "Spacetime", group: "Space", blurb: "Neon rays converging on a vanishing point.",
  modes: ["forward", "reverse"],
  sliders: [{ label: "speed", def: 50 }, { label: "direction", def: 50 }, { label: "detail", def: 50 }, { label: "rays", def: 50 }, { label: "width", def: 40 }],
  frag: `
vec3 scene(vec2 p, vec2 uv){
  vec2 c0 = vec2((S(1) - .5)*.8, sin(uT*.2)*.05);
  vec2 q = p - c0;
  float r = length(q), a = atan(q.y, q.x);
  float dir = uMode == 1 ? -1. : 1.;
  float n = 24. + floor(S(3)*120.);
  float z = .15/(r + .02);
  vec3 col = pal(.02)*.4;
  for(int L=0; L<3; L++){
    float fl = float(L);
    float id = floor((a/TAU + .5)*n + fl*.37);
    float seed = h11(id + fl*31.);
    float speed = (.6 + seed*1.6)*(1. + uBass*1.5);
    float seg = fract(z*(.2 + S(2)*.4) - uT*speed*dir + seed*9.);
    float len = .2 + seed*.4;
    float on = smoothstep(0., .04, seg)*smoothstep(len, len - .1, seg)*step(.35, seed + fft(seed)*.6);
    float ang = abs(fract((a/TAU + .5)*n + fl*.37) - .5);
    float width = .03 + S(4)*.25;
    float ray = smoothstep(width, 0., ang)*on;
    col += pal(.5 + seed*.5)*ray*(.6 + fft(seed*.7)*1.6)*(1. - fl*.25);
  }
  col *= smoothstep(.0, .12, r)*1.4;
  col += pal(1.)*exp(-r*18.)*(.5 + uKick*1.5);
  return col;
}`,
};

export const anemone: Scene = {
  id: "anemone", name: "Anemone", group: "Space", blurb: "Beaded chains of light from one point. Move the mouse to steer, hold to pull.",
  modes: ["bloom", "vortex", "braid", "veil"],
  scale: 0.75,
  sliders: [{ label: "speed", def: 45 }, { label: "tilt", def: 40 }, { label: "chains", def: 50 }, { label: "beads", def: 55 }, { label: "reach", def: 55 }],
  frag: `
vec3 scene(vec2 p, vec2 uv){
  vec2 src = uMouse.z > .5 ? uMouse.xy : vec2(sin(uT*.21)*.08, -.05 + cos(uT*.17)*.05);
  float tilt = .35 + S(1)*.6;
  int chains = 8 + int(S(2)*20.);
  int beads = 10 + int(S(3)*22.);
  float reach = .25 + S(4)*.5 + uBass*.15;
  vec3 col = pal(.02)*.5;
  for(int c=0; c<28; c++){
    if(c >= chains) break;
    float fc = float(c), ph = fc/float(chains)*TAU;
    float amp = fft(fc/float(chains)*.7 + .03);
    for(int b=0; b<32; b++){
      if(b >= beads) break;
      float fb = float(b)/float(beads);
      float rr = fb*reach*(1. + amp*.5);
      float a = ph;
      vec3 pos;
      if(uMode == 0) { a += sin(uT*.6 + fb*3. + fc)*.4*fb; pos = vec3(cos(a)*rr, sin(a)*rr, 0.); }
      else if(uMode == 1) { a += fb*4. + uT*.8; pos = vec3(cos(a)*rr, sin(a)*rr, fb*.4); }
      else if(uMode == 2) { a = fb*12. + uT + fc*.5; pos = vec3(cos(a)*.08*(1. + fc*.03), fb*reach*2. - reach*.6, sin(a)*.08); }
      else { pos = vec3((fc/float(chains) - .5)*reach*2., -fb*reach*1.4 + reach*.5, sin(fb*6. + uT + fc)*.06); pos.x += sin(fb*4. + uT*.7 + fc)*.04; }
      pos.y *= tilt; pos.y += pos.z*(1. - tilt);
      vec2 d = p - src - pos.xy;
      float size = (.004 + (1. - fb)*.006)*(1. + amp*1.5 + uKick*.6);
      float g = size*size/(dot(d, d) + size*size*.15);
      col += pal(.4 + fb*.6)*g*(.35 + amp*1.2);
    }
  }
  return col;
}`,
};

export const synapse: Scene = {
  id: "synapse", name: "Synapse", group: "Pattern", blurb: "A constellation that wires itself to the music: bass cores, mid nodes, high motes.",
  sliders: [{ label: "speed", def: 40 }, { label: "density", def: 50 }, { label: "reach", def: 55 }, { label: "glow", def: 50 }],
  frag: `
vec2 node(vec2 id){ vec2 h = h22(id); return id + .5 + .38*sin(uT*.4*(.4 + h) + TAU*h); }
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba)/dot(ba, ba), 0., 1.); return length(pa - ba*h); }
vec3 scene(vec2 p, vec2 uv){
  float sc = 5. + S(1)*9.;
  vec2 q = p*sc + vec2(uT*.15, 0.);
  vec2 id = floor(q);
  vec3 col = pal(.02)*.6;
  float reach = .9 + S(2)*.8;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec2 a = node(id + vec2(i, j));
    float ha = h21(id + vec2(i, j));
    float band = ha < .2 ? uBass : ha < .7 ? uMid : uHigh;
    float d = length(q - a);
    float r = (.05 + band*.12)*(ha < .2 ? 1.8 : 1.);
    col += pal(ha < .2 ? .95 : ha < .7 ? .7 : .5)*(r*r/(d*d + r*r*.3))*(.5 + S(3));
    for(int k=0;k<2;k++){
      vec2 nb = id + vec2(i, j) + (k == 0 ? vec2(1, 0) : vec2(0, 1));
      vec2 b = node(nb);
      float L = length(a - b);
      if(L < reach){
        float w = smoothstep(.03, 0., seg(q, a, b))*(1. - L/reach);
        col += pal(.6)*w*(.25 + band*1.2);
      }
    }
  }
  return col;
}`,
};

export const mandala: Scene = {
  id: "mandala", name: "Mandala", group: "Fractal", blurb: "An escape-time kaleidoscope. Kick and sub breathe the zoom.",
  sliders: [{ label: "speed", def: 40 }, { label: "petals", def: 40 }, { label: "detail", def: 55 }, { label: "fill", def: 50 }, { label: "morph", def: 40 }],
  frag: `
vec3 scene(vec2 p, vec2 uv){
  float n = 3. + floor(S(1)*9.);
  float r = length(p), a = atan(p.y, p.x);
  float seg = TAU/n; a = abs(mod(a + uT*.05, seg) - seg*.5);
  vec2 z = r*vec2(cos(a), sin(a));
  z *= (1.6 - S(3)*1.1)*(1. - uBass*.18 - uKick*.08);
  vec2 c = vec2(-.55 + .25*sin(uT*.13 + S(4)*3.), -.4 + .2*cos(uT*.11));
  float acc = 0., mn = 9.;
  int it = 6 + int(S(2)*12.);
  for(int i=0;i<18;i++){
    if(i >= it) break;
    z = abs(z)/dot(z, z) + c;
    float m = length(z);
    acc += exp(-m*1.2);
    mn = min(mn, m);
  }
  float v = acc/float(it);
  v = smoothstep(.15, .85, v);
  vec3 col = pal(clamp(v, 0., 1.))*v*v*.9 + pal(.08)*(1. - v)*.4;
  col += pal(1.)*exp(-mn*9.)*(.25 + uHigh*.6);
  return col*smoothstep(.95, .3, r);
}`,
};

export const rings: Scene = {
  id: "rings", name: "Rings", group: "Signal", blurb: "The spectrum wrapped into concentric rings, low notes at the core.",
  sliders: [{ label: "speed", def: 40 }, { label: "rings", def: 50 }, { label: "spread", def: 50 }, { label: "glow", def: 55 }],
  frag: `
vec3 scene(vec2 p, vec2 uv){
  float r = length(p), a = atan(p.y, p.x);
  float n = 8. + floor(S(1)*40.);
  float ri = floor(r*n*2.)/(n*2.);
  float f = fft(clamp(ri*(1.2 + S(2)), 0., 1.));
  float ring = fract(r*n*2.);
  float wob = sin(a*(3. + floor(f*8.)) + uT*2. + ri*20.)*.15*f;
  float line = smoothstep(.18 + f*.3, 0., abs(ring - .5 + wob));
  float arc = step(fract(a/TAU + uT*.05*(1. + ri*3.)), .2 + f*.8);
  vec3 col = pal(.02);
  col += pal(.3 + f*.7)*line*arc*(.4 + f*1.8);
  col += pal(1.)*exp(-r*9.)*(.4 + uKick*2.)*S(3);
  return col;
}`,
};

export const ridge: Scene = {
  id: "ridge", name: "Ridge", group: "Signal", blurb: "Fly over mountains carved by the last few seconds of spectrum.",
  scale: 0.8,
  sliders: [{ label: "speed", def: 50 }, { label: "height", def: 55 }, { label: "grid", def: 60 }, { label: "sun", def: 60 }],
  frag: `
float hmap(vec2 xz){ float x = abs(xz.x)*.35; float row = mod(xz.y*1.2, 128.); return spec(clamp(x, 0., 1.), row)*(.5 + S(1)*1.6) + fbm3(xz*.7)*.15; }
vec3 scene(vec2 p, vec2 uv){
  vec3 ro = vec3(0., .9, 0.), rd = normalize(vec3(p.x, p.y - .18, 1.));
  vec3 sky = mix(pal(.15), pal(.0), clamp(p.y*2.5, 0., 1.));
  float sun = length(p - vec2(0., .14));
  sky += pal(.95)*smoothstep(.2, .19, sun)*S(3)*step(.5, fract((p.y - .14)*40. - uTime*.5) + .5 - (.14 - p.y)*4.);
  sky += pal(.8)*exp(-sun*6.)*.4*S(3);
  float t = 0.;
  vec3 col = sky;
  for(int i=0;i<80;i++){
    vec3 pos = ro + rd*t;
    float h = hmap(pos.xz);
    float d = pos.y - h;
    if(d < .002*t){
      vec2 g = abs(fract(pos.xz*(1. + S(2)*3.)) - .5);
      float line = smoothstep(.06, .0, min(g.x, g.y));
      vec3 base = pal(.05 + h*.4);
      col = mix(base, pal(.9), line*(.6 + h));
      col = mix(col, sky, 1. - exp(-t*.06));
      break;
    }
    t += max(d*.5, .02);
    if(t > 30.) break;
  }
  return col;
}`,
};
