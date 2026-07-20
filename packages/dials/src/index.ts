/**
 * dials — a parameter machine.
 *
 *   const params = {
 *     freq: dial(600, { min: 50, max: 3000 }),
 *     amp:  dial(0.5, { min: 0,  max: 1    }),
 *   }
 *
 *   const { freq, amp } = read(params, { t: now })
 *
 * Each slot is independently tunable and modulatable. Attaching a
 * source adds its normalized signal, scaled by the attachment's
 * `depth`, onto the slot's base value — the dial stays live, centered
 * under the modulation. A source's own parameters are dials, which
 * can themselves be modulated, recursively.
 *
 * The stdlib of sources (sine, tri, perlin1D, fbm, brown, smooth,
 * etc.) is auto-registered at import time — `import '@ldlework/dials'`
 * is enough to populate the panel's "modulate…" picker.
 */

import { registerStdlib } from './stdlib'

// Auto-register the standard library. Idempotent; re-running is safe.
registerStdlib()

// ─── Core re-exports ───────────────────────────────────────────────────

export type {
  Body,
  BodyFactory,
  Ctx,
  Dial,
  DialMeta,
  Dials,
  DialsOut,
  ModMode,
  Slot,
  SlotOut,
  Source,
  SourceDef,
} from './core'

export { dial, typedDial, setDial, setGlide, rebaseSlot, slotFromDial } from './dial'

export {
  defineSource,
  defineStatefulSource,
  instantiate,
  registerSource,
  getSource,
  sourcesForType,
  clearRegistry,
} from './source'
export type {
  DefineSourceArgs,
  DefineStatefulSourceArgs,
  ParamSpec,
  ParamsSpec,
} from './source'

export {
  attach,
  attachFrom,
  detach,
  setDepth,
  setMode,
  DEFAULT_DEPTH,
} from './attach'

export { toPos, fromPos } from './space'
export type { RangeMeta } from './space'

export { read, sampleSlot, sampleSource } from './sample'

export { toJSON, fromJSON } from './json'
export type { SlotSnap, SourceSnap, DialsSnap } from './json'

export { cloneSlot, cloneDials, adoptBody } from './clone'

export { loadDials, saveDials } from './network'
export type { DialsEndpoint } from './network'

// ─── Standard library re-exports ───────────────────────────────────────
// All sources are also re-exported by name so apps can reference them
// directly (for tests, programmatic attach, custom pickers, etc.).

export {
  sine,
  tri,
  saw,
  square,
  whiteNoise,
  valueNoise,
  perlin1D,
  fbm,
  brown,
  smooth,
  add,
  mul,
  lerp,
  gate,
  phaseGate,
  STDLIB,
  registerStdlib,
} from './stdlib'
