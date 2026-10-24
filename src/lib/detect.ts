// @ts-nocheck
/* Album-cover detection, fully local. Finds the most cover-like square region in a screenshot. */
const DETECT_THRESHOLD = .32;
function detectCover(src, probe?){
  const W0 = src.width, H0 = src.height;
  const sc = Math.min(1, 320/Math.max(W0, H0));
  const w = Math.max(24, Math.round(W0*sc)), h = Math.max(24, Math.round(H0*sc));
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), {width: w, height: h});
  const cx = cv.getContext('2d', {willReadFrequently:true});
  cx.drawImage(src, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h).data;
  const N = w*h, R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
  for(let i=0;i<N;i++){ R[i] = d[i*4]/255; G[i] = d[i*4+1]/255; B[i] = d[i*4+2]/255; }
  const dist = (i, j) => (Math.abs(R[i]-R[j]) + Math.abs(G[i]-G[j]) + Math.abs(B[i]-B[j]))/3;
  const H1 = h + 1, W1 = w + 1;
  // colP: per boundary column x (between x-1 and x), prefix over y of the step across it
  const colP = new Float32Array(W1*H1), rowP = new Float32Array(H1*W1), I = new Float32Array(W1*H1);
  const GX = new Float32Array(W1*h), GY = new Float32Array(H1*w);
  for(let x=0;x<=w;x++){
    let acc = 0;
    for(let y=0;y<h;y++){
      let g = 0;
      if(x >= 2 && x <= w-2){ const i = y*w + x; g = Math.max(dist(i-1, i), .8*dist(i-2, i+1)); }
      GX[x*h + y] = g; acc += g; colP[x*H1 + y + 1] = acc;
    }
  }
  for(let y=0;y<=h;y++){
    let acc = 0;
    for(let x=0;x<w;x++){
      let g = 0;
      if(y >= 2 && y <= h-2){ const i = y*w + x; g = Math.max(dist(i-w, i), .8*dist(i-2*w, i+w)); }
      GY[y*w + x] = g; acc += g; rowP[y*W1 + x + 1] = acc;
    }
  }
  const J = new Float32Array(W1*H1);
  for(let y=0;y<h;y++){
    let acc = 0, accT = 0;
    for(let x=0;x<w;x++){
      const i = y*w + x;
      const b = Math.min(1, ((x < w-1 ? dist(i, i+1) : 0) + (y < h-1 ? dist(i, i+w) : 0))*3);
      acc += b; I[(y+1)*W1 + x + 1] = I[y*W1 + x + 1] + acc;
      const tx = ((x < w-1 ? dist(i, i+1) : 0) + (y < h-1 ? dist(i, i+w) : 0)) > .0035 ? 1 : 0;
      accT += tx; J[(y+1)*W1 + x + 1] = J[y*W1 + x + 1] + accT;
    }
  }
  const colC = new Float32Array(W1*H1), rowC = new Float32Array(H1*W1);
  for(let x=2;x<=w-2;x++){ let acc = 0; for(let y=0;y<h;y++){ const g = GX[x*h+y]; const nb = Math.max(GX[Math.max(2,x-3)*h+y], GX[Math.min(w-2,x+3)*h+y]); acc += (g > .008 && g > nb + .006) ? 1 : 0; colC[x*H1+y+1] = acc; } }
  for(let y=2;y<=h-2;y++){ let acc = 0; for(let x=0;x<w;x++){ const g = GY[y*w+x]; const nb = Math.max(GY[Math.max(2,y-3)*w+x], GY[Math.min(h-2,y+3)*w+x]); acc += (g > .008 && g > nb + .006) ? 1 : 0; rowC[y*W1+x+1] = acc; } }
  const EDGE_DEFAULT = .045;
  const V = (x, y0, y1) => (x < 2 || x > w-2) ? -1 : (colP[x*H1 + y1] - colP[x*H1 + y0])/(y1 - y0);
  const Hs = (y, x0, x1) => (y < 2 || y > h-2) ? -1 : (rowP[y*W1 + x1] - rowP[y*W1 + x0])/(x1 - x0);
  const lineV = (x, y0, y1) => {
    const c = V(x, y0, y1); if(c < 0) return EDGE_DEFAULT;
    const a = V(Math.max(2, x-3), y0, y1), b = V(Math.min(w-2, x+3), y0, y1);
    return Math.max(0, c - .5*(a + b));
  };
  const lineH = (y, x0, x1) => {
    const c = Hs(y, x0, x1); if(c < 0) return EDGE_DEFAULT;
    const a = Hs(Math.max(2, y-3), x0, x1), b = Hs(Math.min(h-2, y+3), x0, x1);
    return Math.max(0, c - .5*(a + b));
  };
  const area = (x0, y0, x1, y1, M = I) => {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(w, x1); y1 = Math.min(h, y1);
    if(x1 <= x0 || y1 <= y0) return [0, 0];
    return [M[y1*W1 + x1] - M[y0*W1 + x1] - M[y1*W1 + x0] + M[y0*W1 + x0], (x1-x0)*(y1-y0)];
  };
  const minSide = Math.min(w, h);
  const side = (c, a, b, cov) => {
    if(c < 0) return EDGE_DEFAULT;
    const line = Math.max(0, c - .5*(a + b));
    return Math.max(.03, Math.min(1, cov*Math.max(line*8, .55)));
  };
  const covV = (x, y0, y1) => (x < 2 || x > w-2) ? 0 : (colC[x*H1+y1] - colC[x*H1+y0])/(y1-y0);
  const covH = (y, x0, x1) => (y < 2 || y > h-2) ? 0 : (rowC[y*W1+x1] - rowC[y*W1+x0])/(x1-x0);
  const sideV = (x, y0, y1) => side(V(x, y0, y1), V(Math.max(2, x-3), y0, y1), V(Math.min(w-2, x+3), y0, y1), Math.max(covV(x, y0, y1), covV(x+1, y0, y1)));
  const sideH = (y, x0, x1) => side(Hs(y, x0, x1), Hs(Math.max(2, y-3), x0, x1), Hs(Math.min(h-2, y+3), x0, x1), Math.max(covH(y, x0, x1), covH(y+1, x0, x1)));
  const score = (x0, y0, x1, y1) => {
    const gm = Math.pow(sideV(x0, y0, y1)*sideV(x1, y0, y1)*sideH(y0, x0, x1)*sideH(y1, x0, x1), .25);
    const s = Math.min(x1-x0, y1-y0);
    const [si, ai] = area(x0+2, y0+2, x1-2, y1-2);
    const content = ai ? si/ai : 0;
    const band = Math.max(3, Math.round(s*.05));
    const [so, ao] = area(x0-band, y0-band, x1+band, y1+band);
    const [sr, ar] = area(x0, y0, x1, y1);
    const hasRing = (ao - ar) > band*s*.8;
    const ring = hasRing ? (so - sr)/(ao - ar) : content;
    const islandT = hasRing ? Math.max(0, content - ring)/(content + .02)*Math.min(1, content*8) : 0;
    return {score: Math.pow(s/minSide, .8)*(gm + .5*islandT), gm, content, ring, islandT};
  };
  if(probe) return score(...probe);
  let best = null;
  const sMin = Math.max(16, Math.round(minSide*.14));
  for(let s = sMin; s <= minSide; s += 2){
    for(let y0 = 0; y0 + s <= h; y0 += 2){
      for(let x0 = 0; x0 + s <= w; x0 += 2){
        const r = score(x0, y0, x0+s, y0+s);
        if(!best || r.score > best.score) best = {...r, x0, y0, x1:x0+s, y1:y0+s};
      }
    }
  }
  // refine each side independently (allows slightly non-square crops)
  for(let pass=0; pass<2; pass++){
    for(const side of ['x0','x1','y0','y1']){
      let bv = best.score, bk = best[side];
      for(let dlt=-3; dlt<=3; dlt++){
        const c = {...best}; c[side] = best[side] + dlt;
        if(c.x0 < 0 || c.y0 < 0 || c.x1 > w || c.y1 > h || c.x1 - c.x0 < 12 || c.y1 - c.y0 < 12) continue;
        const ar = (c.x1-c.x0)/(c.y1-c.y0); if(ar < .75 || ar > 1.33) continue;
        const r = score(c.x0, c.y0, c.x1, c.y1);
        if(r.score > bv){ bv = r.score; bk = c[side]; }
      }
      best[side] = bk; Object.assign(best, score(best.x0, best.y0, best.x1, best.y1));
    }
  }
  const full = score(0, 0, w, h);
  const covers = ((best.x1-best.x0)*(best.y1-best.y0))/(w*h);
  const strong = best.score > DETECT_THRESHOLD && covers < .86;
  const conf = strong ? Math.max(.5, Math.min(.99, .5 + (best.score - DETECT_THRESHOLD)*1.1)) : 0;
  if(!strong) return {found:false, confidence:0, box:{x:0, y:0, w:1, h:1}, debug:{best, full}};
  const inset = .006;
  const bx = best.x0/w + inset, by = best.y0/h + inset, bw = (best.x1-best.x0)/w - 2*inset, bh = (best.y1-best.y0)/h - 2*inset;
  return {found:true, confidence:conf, box:{x:bx, y:by, w:bw, h:bh}, debug:{best, full}};
}

export { detectCover };
