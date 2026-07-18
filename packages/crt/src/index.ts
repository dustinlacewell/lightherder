/*
 * @ldlework/crt — phosphor effect pipeline + thin React mount.
 *
 * Crt is content-agnostic. It owns the *fixed* effect chain:
 *
 *   decay → caller passes → halation → present
 *
 * The "caller passes" slot is yours. Register a `DepositPass` from
 * `@ldlework/scope` for oscilloscope traces; register a `StampPass`
 * (shipped here, since it's general) for textured deposits; register
 * your own `DrawablePass<DrawCtx>` for anything else. They all
 * additively write into the same HDR accumulator and inherit the
 * phosphor's persistence + halation + tonemap treatment.
 *
 * Two entrypoints:
 *
 *   1. <CrtSurface passes={(gl) => [...]} {...preset} />
 *      Drop-in React mount: canvas, GL context, Pipeline, rAF loop.
 *
 *   2. Construct `Pipeline` directly and drive it from your own loop.
 *      Use this on non-React hosts or when sharing a GL context with
 *      another renderer.
 */

// ─── React mount ───────────────────────────────────────────────────
export { CrtSurface } from './CrtSurface'

// ─── Phosphor coatings (presets) ───────────────────────────────────
export {
  PHOSPHOR_P31,
  PHOSPHOR_P7,
  PHOSPHOR_P39,
  PHOSPHOR_BEAUTY,
} from './presets'

// ─── Pipeline + passes ─────────────────────────────────────────────
export {
  Pipeline,
  type FrameInput,
  type PipelineOptions,
} from './Pipeline'
export {
  StampPass,
  STAMP_STRIDE,
  type Stamp,
  type StampPassOptions,
} from './passes/StampPass'
export { resolvePreset } from './resolve-preset'
export { resolveThemeColor } from './theme-color'

// ─── Types ─────────────────────────────────────────────────────────
export type {
  CrtPreset,
  CrtSurfaceProps,
  DrawCtx,
  ResolvedUniforms,
  PingPongTargets,
  PassFactory,
} from './types'

// ─── Re-exports from @ldlework/gl (so consumers of our types don't ──
// need a direct gl dep).
export type { DrawablePass, ResizablePass, Pass } from '@ldlework/gl'
