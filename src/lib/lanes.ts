/** Automation lanes: control moves recorded against the track's timeline and replayed on every pass. */
export type Lane = { target: string; pts: [number, number][] };
export type LaneSet = Record<string, Lane>; // by target

const KEY = "afterimage.lanes.v1";

export function loadLanes(track: string): LaneSet {
  try { return (JSON.parse(localStorage.getItem(KEY) || "{}")[track] as LaneSet) || {}; } catch { return {}; }
}
export function saveLanes(track: string, lanes: LaneSet) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (Object.keys(lanes).length) all[track] = lanes; else delete all[track];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

/** Write a point, overwriting anything recorded in the last moment of this pass. */
export function writePoint(lanes: LaneSet, target: string, t: number, v: number, lastT: number | null): LaneSet {
  const lane = lanes[target] ?? { target, pts: [] };
  const from = lastT != null && lastT < t ? lastT : t - 0.05;
  const pts = lane.pts.filter(([pt]) => pt < from || pt > t + 0.001);
  pts.push([t, v]);
  pts.sort((a, b) => a[0] - b[0]);
  return { ...lanes, [target]: { target, pts } };
}

export function sample(l: Lane, t: number): number | null {
  const p = l.pts;
  if (!p.length) return null;
  if (t <= p[0][0]) return p[0][1];
  if (t >= p[p.length - 1][0]) return p[p.length - 1][1];
  let lo = 0, hi = p.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m][0] <= t) lo = m; else hi = m; }
  const [t0, v0] = p[lo], [t1, v1] = p[hi];
  return v0 + (v1 - v0) * ((t - t0) / Math.max(1e-6, t1 - t0));
}
