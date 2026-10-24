import { anemone, ink, mandala, ridge, rings, sand, spacetime, synapse } from "./fields";
import { citadel, descent, gate, relic } from "./fractals";
import { limitless } from "./limitless";
import { signal } from "./signal";
import { fluid, morphogen, wisp } from "./sims";
import type { Scene } from "./types";

const pro = (s: Scene): Scene => ({ ...s, pro: true });

export const SCENES: Scene[] = [
  limitless, ink, pro(fluid), pro(relic), pro(citadel), mandala, pro(descent), pro(gate), spacetime,
  anemone, pro(wisp), synapse, pro(morphogen), sand, rings, pro(ridge), signal,
];

export const sceneById = (id: string): Scene => SCENES.find((s) => s.id === id) ?? SCENES[0];
