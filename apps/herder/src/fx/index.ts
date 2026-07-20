/* The FX registry — every simple 1-in effect device, one file each.
   Import order here is toolbar order. PARAMS, DRAWER, KIND_LABEL,
   serialization whitelists, FACED sets, renderer passes and the
   engine's effect step all derive from this record: an effect is one
   file here plus a glyph in icons.tsx. */

import { wobbulate } from './wobbulate';
import { kaleido } from './kaleido';
import { polar } from './polar';
import { droste } from './droste';
import { conformal } from './conformal';
import { turbwarp } from './turbwarp';
import { morph } from './morph';
import { mosaic } from './mosaic';
import { paint } from './paint';
import { convolve } from './convolve';
import { glow } from './glow';
import { relight } from './relight';
import { halftone } from './halftone';
import { dither } from './dither';
import { contour } from './contour';
import { colorize } from './colorize';
import { solarize } from './solarize';
import { polarize } from './polarize';
import { timebase } from './timebase';
import { noise } from './noise';
import { moire } from './moire';
import { julia } from './julia';

export type { FxCtx, FxDef } from './def';

export const FX = {
  wobbulate,
  kaleido,
  polar,
  droste,
  conformal,
  turbwarp,
  morph,
  mosaic,
  paint,
  convolve,
  glow,
  relight,
  halftone,
  dither,
  contour,
  colorize,
  solarize,
  polarize,
  timebase,
  noise,
  moire,
  julia,
} as const;

export const FX_KINDS: ReadonlySet<string> = new Set(Object.keys(FX));
