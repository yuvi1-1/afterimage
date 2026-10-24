// @ts-nocheck
/* ---------- procedural sample covers + sample screenshot (all original artwork) ---------- */
function mkCanvas(w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function seeded(seed){ return () => (seed = (seed*16807) % 2147483647)/2147483647; }

function coverNightDrive(S=1024){
  const c = mkCanvas(S, S), x = c.getContext('2d'), m = S/2;
  const bg = x.createLinearGradient(0, 0, 0, S); bg.addColorStop(0, '#120c22'); bg.addColorStop(1, '#05040a');
  x.fillStyle = bg; x.fillRect(0, 0, S, S);
  // glossy ring
  for(let i=0;i<70;i++){
    const t = i/69, r = S*.27 + Math.sin(t*Math.PI)*S*.01;
    x.strokeStyle = `hsla(${38 + t*12}, 85%, ${30 + Math.sin(t*Math.PI)*50}%, ${.25 + .5*Math.sin(t*Math.PI)})`;
    x.lineWidth = S*.006;
    x.beginPath(); x.ellipse(m, m*1.02, r + i*S*.0012, r*.98 + i*S*.0012, -.3, 0, Math.PI*2); x.stroke();
  }
  const sph = x.createRadialGradient(m - S*.07, m - S*.09, S*.01, m, m, S*.2);
  sph.addColorStop(0, '#fff6dc'); sph.addColorStop(.25, '#e9b75a'); sph.addColorStop(.7, '#7a4a14'); sph.addColorStop(1, '#1a0e05');
  x.fillStyle = sph; x.beginPath(); x.arc(m, m*1.02, S*.19, 0, Math.PI*2); x.fill();
  x.fillStyle = 'rgba(10,8,20,.85)'; x.fillRect(m - S*.19, m*1.02 - S*.012, S*.38, S*.024);
  const rnd = seeded(11);
  for(let i=0;i<220;i++){ x.fillStyle = `rgba(255,240,210,${rnd()*.5})`; x.fillRect(rnd()*S, rnd()*S*.5, 1.5, 1.5); }
  x.fillStyle = '#efe4cf'; x.font = `600 ${S*.034}px Helvetica, Arial, sans-serif`;
  x.fillText('HALCYON STATIC', S*.07, S*.1);
  x.font = `400 ${S*.06}px Helvetica, Arial, sans-serif`; x.fillStyle = '#e9b75a';
  x.fillText('night drive', S*.07, S*.92);
  return c;
}
function coverTidal(S=1024){
  const c = mkCanvas(S, S), x = c.getContext('2d');
  const g = x.createLinearGradient(0,0,0,S); g.addColorStop(0,'#0a1a4a'); g.addColorStop(.6,'#15327a'); g.addColorStop(1,'#0b1638');
  x.fillStyle = g; x.fillRect(0,0,S,S);
  const moons = [[S*.72,S*.26,150],[S*.24,S*.62,110],[S*.55,S*.78,70]];
  const rnd = seeded(7);
  const field = (px,py) => {
    let a = Math.sin(px*.006)*1.4 + Math.cos(py*.005)*1.2;
    for(const [mx,my,mr] of moons){ const dx=px-mx, dy=py-my, dd=Math.hypot(dx,dy); const w=Math.exp(-dd/(mr*1.8)); a = a*(1-w) + (Math.atan2(dy,dx)+Math.PI/2)*w; }
    return a;
  };
  const cols = ['#0d1d52','#1e3d8f','#2d5fba','#5d86d6','#9bbbe8','#e8d469','#f5ecb0'];
  x.lineCap = 'round';
  for(let i=0;i<2600;i++){
    let px = rnd()*S, py = rnd()*S, near = 0;
    for(const [mx,my,mr] of moons) near = Math.max(near, Math.exp(-Math.hypot(px-mx,py-my)/(mr*1.2)));
    const pick = near > .35 ? (rnd() < .7 ? 5 + Math.floor(rnd()*2) : 4) : Math.floor(rnd()*5) + (rnd() < .06 ? 5 : 0);
    x.strokeStyle = cols[Math.min(pick, cols.length-1)]; x.globalAlpha = .55 + rnd()*.4; x.lineWidth = 3 + rnd()*6;
    x.beginPath(); x.moveTo(px,py);
    const steps = 8 + Math.floor(rnd()*18);
    for(let s=0;s<steps;s++){ const a = field(px,py); px += Math.cos(a)*5; py += Math.sin(a)*5; x.lineTo(px,py); }
    x.stroke();
  }
  x.globalAlpha = 1;
  for(const [mx,my,mr] of moons){
    const rg = x.createRadialGradient(mx,my,0,mx,my,mr*.6); rg.addColorStop(0,'rgba(255,247,200,.95)'); rg.addColorStop(.5,'rgba(240,215,100,.5)'); rg.addColorStop(1,'rgba(240,215,100,0)');
    x.fillStyle = rg; x.beginPath(); x.arc(mx,my,mr*.6,0,7); x.fill();
  }
  return c;
}
function coverNeonRun(S=1024){
  const c = mkCanvas(S, S), x = c.getContext('2d');
  const sky = x.createLinearGradient(0,0,0,S*.62); sky.addColorStop(0,'#0b0420'); sky.addColorStop(.55,'#5a1a5c'); sky.addColorStop(1,'#f0743a');
  x.fillStyle = sky; x.fillRect(0,0,S,S);
  const sun = x.createLinearGradient(0,S*.22,0,S*.62); sun.addColorStop(0,'#ffe78a'); sun.addColorStop(1,'#ff5a5f');
  x.fillStyle = sun; x.beginPath(); x.arc(S/2,S*.5,S*.23,0,Math.PI*2); x.fill();
  x.fillStyle = '#5a1a5c'; for(let i=0;i<7;i++){ const y = S*.42 + i*i*4.2 + i*10; x.fillRect(0,y,S,2+i*1.6); }
  const ridge = (base,amp,col,seed)=>{ x.fillStyle = col; x.beginPath(); x.moveTo(0,S); for(let i=0;i<=64;i++){ const px=i/64*S; const py=base - Math.abs(Math.sin(i*.37+seed)*amp + Math.sin(i*.11+seed*2)*amp*.8); x.lineTo(px,py);} x.lineTo(S,S); x.fill(); };
  ridge(S*.66,90,'#2a0d3a',1); ridge(S*.72,60,'#170722',4);
  x.fillStyle = '#07020d'; x.fillRect(0,S*.74,S,S*.26);
  x.strokeStyle = 'rgba(255,90,170,.65)'; x.lineWidth = 2;
  for(let i=0;i<14;i++){ const y = S*.74 + Math.pow(i/13,2)*S*.26; x.beginPath(); x.moveTo(0,y); x.lineTo(S,y); x.stroke(); }
  for(let i=-12;i<=12;i++){ x.beginPath(); x.moveTo(S/2 + i*14, S*.74); x.lineTo(S/2 + i*120, S); x.stroke(); }
  return c;
}
function coverSmall(seed, S=256){
  const c = mkCanvas(S, S), x = c.getContext('2d'), rnd = seeded(seed*97 + 3);
  const h = Math.floor(rnd()*360);
  const g = x.createLinearGradient(0,0,S,S); g.addColorStop(0,`hsl(${h},60%,${20+rnd()*30}%)`); g.addColorStop(1,`hsl(${(h+60)%360},70%,${10+rnd()*20}%)`);
  x.fillStyle = g; x.fillRect(0,0,S,S);
  for(let i=0;i<6;i++){ x.fillStyle = `hsla(${(h+i*40)%360},80%,${50+rnd()*30}%,.5)`; x.beginPath(); x.arc(rnd()*S, rnd()*S, 10+rnd()*S*.3, 0, 7); x.fill(); }
  return c;
}
/* A generic dark "now playing" screen with the cover inside, plus smaller covers as distractors. */
function sampleScreenshot(){
  const W = 1600, H = 1000, c = mkCanvas(W, H), x = c.getContext('2d');
  const bgG = x.createLinearGradient(0, 0, 0, H); bgG.addColorStop(0, '#3b2a12'); bgG.addColorStop(.55, '#17130f'); bgG.addColorStop(1, '#0f0f12');
  x.fillStyle = bgG; x.fillRect(0,0,W,H);
  x.fillStyle = '#0c0c0e'; x.fillRect(0,0,250,H);
  const bar = (bx,by,bw,bh,col) => { x.fillStyle = col; x.beginPath(); x.roundRect(bx,by,bw,bh,bh/2); x.fill(); };
  bar(28,34,120,16,'#3a3a42');
  for(let i=0;i<9;i++) bar(28, 100 + i*44, 90 + (i*37)%90, 11, i===2 ? '#d9d9de' : '#2c2c33');
  bar(290,34,360,34,'#1d1d22'); bar(1430,34,130,34,'#1d1d22');
  const cov = coverNightDrive(560);
  x.save(); x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 24; x.shadowOffsetY = 8;
  x.drawImage(cov, 330, 130, 520, 520); x.restore();
  x.fillStyle = '#8d8d96'; x.font = '500 18px Helvetica, Arial, sans-serif'; x.fillText('NOW PLAYING', 910, 400);
  x.fillStyle = '#f2f2f0'; x.font = '700 64px Helvetica, Arial, sans-serif'; x.fillText('Night Drive', 906, 476);
  x.fillStyle = '#b5b5bc'; x.font = '400 26px Helvetica, Arial, sans-serif'; x.fillText('Halcyon Static', 910, 520);
  bar(910, 580, 560, 6, '#2c2c33'); bar(910, 580, 210, 6, '#e9b44c');
  x.fillStyle = '#e9e9ec'; x.beginPath(); x.arc(1190, 640, 30, 0, 7); x.fill();
  x.fillStyle = '#3a3a42'; [1100, 1280].forEach(cx0 => { x.beginPath(); x.arc(cx0, 640, 14, 0, 7); x.fill(); });
  x.fillStyle = '#d9d9de'; x.font = '600 22px Helvetica, Arial, sans-serif'; x.fillText('More from Halcyon Static', 330, 735);
  for(let i=0;i<7;i++){ const sx = 330 + i*176; x.drawImage(coverSmall(i), sx, 765, 150, 150); bar(sx, 930, 110, 10, '#2c2c33'); }
  return c;
}

export { coverNightDrive, coverTidal, coverNeonRun, sampleScreenshot };
