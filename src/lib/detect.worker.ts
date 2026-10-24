import { detectCover } from "./detect";

self.onmessage = (e: MessageEvent<ImageBitmap>) => {
  try {
    const r = detectCover(e.data) as { found: boolean; confidence: number; box: unknown };
    (self as unknown as Worker).postMessage({ found: r.found, confidence: r.confidence, box: r.box });
  } catch (err) {
    (self as unknown as Worker).postMessage({ found: false, confidence: 0, box: { x: 0, y: 0, w: 1, h: 1 }, error: String(err) });
  }
};
