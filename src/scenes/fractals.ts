import type { Scene } from "./types";

const RAY = `
vec3 calcNormal(vec3 p, float e){ vec2 k = vec2(1., -1.); return normalize(k.xyy*map(p + k.xyy*e).x + k.yyx*map(p + k.yyx*e).x + k.yxy*map(p + k.yxy*e).x + k.xxx*map(p + k.xxx*e).x); }
`;

export const relic: Scene = {
  id: "relic", name: "Relic", group: "Fractal", blurb: "A raymarched Mandelbulb. Kicks morph its power; accents regrow it.",
  scale: 0.55,
  sliders: [{ label: "speed", def: 40 }, { label: "power", def: 50 }, { label: "detail", def: 55 }, { label: "fill", def: 50 }, { label: "tilt", def: 40 }],
  frag: `
float POW;
vec2 map(vec3 p){
  vec3 z = p; float dr = 1., r = 0., trap = 1e9;
  int it = 4 + int(S(2)*5.);
  for(int i=0;i<9;i++){
    if(i >= it) break;
    r = length(z); if(r > 2.) break;
    float th = acos(clamp(z.z/r, -1., 1.)), ph = atan(z.y, z.x);
    dr = pow(r, POW - 1.)*POW*dr + 1.;
    float zr = pow(r, POW);
    th *= POW; ph *= POW;
    z = zr*vec3(sin(th)*cos(ph), sin(ph)*sin(th), cos(th)) + p;
    trap = min(trap, dot(z, z));
  }
  return vec2(.5*log(r)*r/dr, trap);
}
${RAY}
vec3 scene(vec2 p, vec2 uv){
  POW = 6. + S(1)*4. + sin(uT*.2)*1.2 + uKick*1.6;
  float dist = 3.4 - S(3)*1.4;
  float a = uT*.3, tilt = (S(4) - .5)*1.6;
  vec3 ro = vec3(sin(a)*cos(tilt), sin(tilt), cos(a)*cos(tilt))*dist;
  vec3 fw = normalize(-ro), rt = normalize(cross(vec3(0., 1., 0.), fw)), up = cross(fw, rt);
  vec3 rd = normalize(fw*1.8 + rt*p.x + up*p.y);
  float t = 0.; vec2 h = vec2(1.); float steps = 0.;
  for(int i=0;i<90;i++){ h = map(ro + rd*t); if(h.x < .0015*t || t > 8.) break; t += h.x; steps += 1.; }
  vec3 bg = pal(.02) + pal(.25)*exp(-length(p)*3.)*.3;
  if(t > 8.) return bg + pal(.7)*steps/90.*.5;
  vec3 pos = ro + rd*t, n = calcNormal(pos, .001*t);
  float dif = max(dot(n, normalize(vec3(.6, .7, -.4))), 0.);
  float ao = 1. - steps/90.;
  vec3 col = pal(clamp(sqrt(h.y)*.55 + .1, 0., 1.))*(.25 + dif*.9)*ao;
  col += pal(1.)*pow(max(dot(reflect(rd, n), normalize(vec3(.6, .7, -.4))), 0.), 24.)*(.4 + uHigh);
  col += pal(.95)*uAccent*.25*ao;
  return col;
}`,
};

export const citadel: Scene = {
  id: "citadel", name: "Citadel", group: "Fractal", blurb: "A Mandelbox lattice. Kicks morph the fold scale; tilt goes from under to over.",
  scale: 0.55,
  sliders: [{ label: "speed", def: 35 }, { label: "scale", def: 50 }, { label: "detail", def: 55 }, { label: "fill", def: 50 }, { label: "tilt", def: 50 }],
  frag: `
float SC;
vec2 map(vec3 p){
  vec4 z = vec4(p, 1.), c = z; float trap = 1e9;
  int it = 6 + int(S(2)*8.);
  vec4 sv = vec4(SC, SC, SC, abs(SC))/.25;
  for(int i=0;i<14;i++){
    if(i >= it) break;
    z.xyz = clamp(z.xyz, -1., 1.)*2. - z.xyz;
    float r2 = dot(z.xyz, z.xyz);
    z *= clamp(max(.25/r2, .25), 0., 1.);
    z = z*sv + c;
    trap = min(trap, r2);
  }
  return vec2((length(z.xyz) - abs(SC - 1.))/z.w - pow(abs(SC), float(1 - it)), trap);
}
${RAY}
vec3 scene(vec2 p, vec2 uv){
  SC = -1.8 - S(1)*.8 + sin(uT*.1)*.15 - uKick*.15;
  float a = uT*.12, tilt = (S(4) - .5)*1.4, dist = 5.2 - S(3)*2.6;
  vec3 ro = vec3(sin(a)*cos(tilt), sin(tilt), cos(a)*cos(tilt))*dist;
  vec3 fw = normalize(-ro), rt = normalize(cross(vec3(0., 1., 0.), fw)), up = cross(fw, rt);
  vec3 rd = normalize(fw*1.6 + rt*p.x + up*p.y);
  float t = 0.; vec2 h = vec2(1.); float steps = 0.;
  for(int i=0;i<100;i++){ h = map(ro + rd*t); if(abs(h.x) < .001*t || t > 16.) break; t += h.x*.9; steps += 1.; }
  vec3 bg = pal(.02);
  if(t > 16.) return bg + pal(.6)*steps/100.*.6;
  vec3 pos = ro + rd*t, n = calcNormal(pos, .001*t);
  float dif = max(dot(n, normalize(vec3(-.5, .8, -.3))), 0.), ao = pow(1. - steps/100., 1.5);
  vec3 col = pal(clamp(.25 + sqrt(h.y)*.35, 0., 1.))*(.3 + dif)*ao;
  col += pal(1.)*pow(max(dot(reflect(rd, n), normalize(vec3(-.5, .8, -.3))), 0.), 20.)*.5;
  col = mix(col, bg, 1. - exp(-max(t - 2., 0.)*.12));
  return col + pal(1.)*ao*uHigh*.15;
}`,
};

export const gate: Scene = {
  id: "gate", name: "Gate", group: "Space", blurb: "A machined hall of arches. Kicks re-tune the openings.",
  scale: 0.6,
  sliders: [{ label: "speed", def: 50 }, { label: "shape", def: 40 }, { label: "complexity", def: 50 }, { label: "arches", def: 50 }, { label: "tilt", def: 50 }],
  frag: `
float sdBox(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.); }
vec2 map(vec3 p){
  float sp = 1.2 + S(3)*1.6;
  float id = floor(p.z/sp);
  vec3 q = p; q.z = mod(q.z, sp) - sp*.5;
  float open = .9 + S(1)*.6 + fft(fract(id*.13))*.3 + uKick*.1;
  float arch = sdBox(q, vec3(1.6, 1.4, .12));
  vec2 a = vec2(abs(q.x), q.y + .2);
  float hole = max(length(vec2(a.x, max(a.y - .3, 0.))) - open*.75, -q.y - 1.3);
  arch = max(arch, -hole);
  // machined grooves
  float k = 6. + S(2)*20.;
  arch += sin(q.y*k)*sin(q.x*k)*.006;
  float walls = 1.75 - abs(p.x);
  float floor_ = p.y + 1.3, ceil_ = 1.6 - p.y;
  float d = min(min(arch, walls), min(floor_, ceil_));
  return vec2(d, id);
}
${RAY}
vec3 scene(vec2 p, vec2 uv){
  vec3 ro = vec3(sin(uT*.3)*.2, -.2 + (S(4) - .5)*.8, uT*1.5);
  vec3 rd = normalize(vec3(p, 1.1));
  rd.xy *= rot(sin(uT*.2)*.05);
  float t = 0.; vec2 h; float steps = 0.;
  for(int i=0;i<90;i++){ h = map(ro + rd*t); if(h.x < .001 || t > 30.) break; t += h.x; steps += 1.; }
  vec3 pos = ro + rd*t, n = calcNormal(pos, .002);
  vec3 lp = ro + vec3(0., .5, 2.5);
  vec3 l = normalize(lp - pos);
  float dif = max(dot(n, l), 0.), ao = 1. - steps/90.;
  float band = fft(fract(h.y*.13));
  vec3 col = pal(.15 + band*.5)*(.1 + dif)*ao/(1. + length(lp - pos)*.15);
  col += pal(1.)*smoothstep(.02, .0, abs(fract(pos.z*.8) - .5) - .47)*band*1.5;
  return mix(col, pal(.02), 1. - exp(-t*.12));
}`,
};

export const descent: Scene = {
  id: "descent", name: "Descent", group: "Fractal", blurb: "An endless dive through a recursively carved stone vault.",
  scale: 0.55,
  modes: ["palette", "tonal", "gilded", "neon"],
  sliders: [{ label: "speed", def: 45 }, { label: "carve", def: 50 }, { label: "framing", def: 50 }, { label: "tilt", def: 50 }, { label: "complexity", def: 55 }],
  frag: `
float sdBox(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.); }
vec2 map(vec3 p){
  float R = 1.5 + S(2)*.8;
  vec3 q = p;
  q.xy *= rot(p.z*.08);
  float d = R - max(abs(q.x), abs(q.y))*.7 - length(q.xy)*.3;
  float s = 1., trap = 0.;
  int it = 2 + int(S(4)*3.);
  float carve = .55 + S(1)*.35;
  for(int i=0;i<5;i++){
    if(i >= it) break;
    vec3 r = mod(q*s + vec3(0., 0., float(i)*.7), 2.) - 1.;
    float c = min(min(max(abs(r.x), abs(r.y)), max(abs(r.y), abs(r.z))), max(abs(r.z), abs(r.x))) - carve*(1. + uKick*.06);
    c /= s;
    if(-c > d){ d = -c; trap = float(i); }
    s *= 2.6;
  }
  return vec2(d, trap);
}
${RAY}
vec3 scene(vec2 p, vec2 uv){
  vec3 ro = vec3(0., 0., uT*1.1);
  vec3 rd = normalize(vec3(p, 1.));
  rd.xy *= rot(uT*.05); rd.yz *= rot((S(3) - .5)*.6);
  float t = 0.; vec2 h = vec2(0.); float steps = 0.;
  for(int i=0;i<90;i++){ h = map(ro + rd*t); if(abs(h.x) < .0015*(1. + t) || t > 18.) break; t += h.x*.7; steps += 1.; }
  vec3 pos = ro + rd*t, n = calcNormal(pos, .002*(1. + t*.5));
  vec3 l = normalize(vec3(.3, .6, -.4));
  float dif = max(dot(n, -rd)*.6 + dot(n, l)*.4, 0.), ao = pow(1. - steps/90., 1.6);
  float v = clamp(h.y/4. + fbm3(pos.xy*2. + pos.z)*.3, 0., 1.);
  vec3 col;
  if(uMode == 1) col = vec3(lum(pal(.3 + v*.6)))*(.2 + dif)*ao;
  else if(uMode == 2) col = mix(vec3(.12, .09, .06), vec3(1., .78, .4), v)*(.2 + dif)*ao + vec3(1., .8, .5)*pow(max(dot(reflect(rd, n), l), 0.), 18.)*.5*ao;
  else if(uMode == 3) col = pal(.04)*ao + pal(.65 + v*.35)*smoothstep(.03, .0, abs(fract(pos.z*.5 + h.y*.3) - .5) - .46)*(1. + uLevel*2.);
  else col = pal(.2 + v*.75)*(.2 + dif)*ao;
  return mix(col, pal(.02), 1. - exp(-t*.12)) + pal(1.)*uAccent*.08;
}`,
};
