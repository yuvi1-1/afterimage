import { aurora, chrome, dust, halo, lasers, monolith, skyline, tunnel, vinyl } from "./cover";
import { anemone, ink, mandala, ridge, rings, sand, spacetime, synapse } from "./fields";
import { citadel, descent, gate, relic } from "./fractals";
import { limitless } from "./limitless";
import { signal } from "./signal";
import { fluid, morphogen, wisp } from "./sims";
import type { Scene } from "./types";

const pro = (s: Scene): Scene => ({ ...s, pro: true });

export const SCENES: Scene[] = [
  // Image: your cover, photo, video or camera
  limitless, halo, pro(vinyl), pro(monolith), pro(dust), tunnel,
  // Fluid
  ink, pro(fluid),
  // Fractal
  pro(relic), pro(citadel), mandala, pro(descent), pro(chrome),
  // Space
  pro(gate), spacetime, pro(wisp), aurora, lasers,
  // Pattern
  anemone, synapse, pro(morphogen), sand,
  // Signal
  rings, pro(ridge), skyline, signal,
];

export const sceneById = (id: string): Scene => SCENES.find((s) => s.id === id) ?? SCENES[0];
