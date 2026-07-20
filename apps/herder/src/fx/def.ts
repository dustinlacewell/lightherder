/* One effect device, whole: its shader, its knobs, how knob values
   become uniforms, and the words its shell wears. Everything else —
   PARAMS, DRAWER, labels, whitelists, renderer passes, the engine
   step, the toolbar — derives from the FX registry (index.ts), so an
   effect is one file plus an icon. */

import type { ParamDef } from '../patch/params';

export interface FxCtx {
  simTime: number;
  /** per-node scratch that survives across ticks (accumulators) */
  state: Record<string, unknown>;
}

export interface FxDef {
  /** device label (node header, KIND_LABEL) */
  label: string;
  /** fragment source — one FullscreenPass over uSrc (uRes, uTime free) */
  frag: string;
  params: Record<string, ParamDef>;
  /** resolved knob values → shader uniforms, once per tick */
  uniforms: (pv: (key: string) => number, ctx: FxCtx) => Record<string, number | number[]>;
  /** the shell's words */
  face: { inp: string; out: string; reset: string };
  /** the toolbar's words */
  hint: string;
}
