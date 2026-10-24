import type { Engine } from "../engine/engine";
import type { FBO } from "../engine/gl";

export type Slider = { label: string; def: number };

/** A custom multi-pass scene (fluids, reaction-diffusion, particles). It draws into `target`. */
export interface Sim {
  init(e: Engine): void;
  render(e: Engine, target: FBO, dt: number): void;
  dispose(e: Engine): void;
}

export type Scene = {
  id: string;
  name: string;
  group: "Image" | "Fluid" | "Fractal" | "Space" | "Pattern" | "Signal";
  blurb: string;
  modes?: string[];
  sliders: Slider[]; // up to 6, values 0..100 become uS[0..5] in 0..1
  frag?: string; // defines vec3 scene(vec2 p, vec2 uv)
  sim?: () => Sim;
  scale?: number; // render scale for heavy scenes
  image?: boolean; // shows the dropped photo / video / camera
  pro?: boolean;
};
