/*
 * @ldlework/scope — oscilloscope signal modeling.
 *
 * Plain TypeScript. No dials, no React, no DOM, no presets, no
 * persistence. Just:
 *
 *   - Data types for waves (Wave, Beam, Sweep, NoiseFloor,
 *     Fundamental, Burst).
 *   - The runtime: `WavePumper` turns Waves into `BeamPosition`s
 *     at a configured beam rate.
 *   - Noise generators (white / brown / pink / drift + seeded
 *     variants).
 *   - The beam deposit pass + segment pump for feeding
 *     `@ldlework/crt`'s Pipeline.
 *
 * The application composes scope with whatever parameter system
 * (e.g. dials) and persistence it wants.
 */

// ─── Core types ────────────────────────────────────────────────────
export type { BeamPosition, Ctx } from './types'

// ─── Noise ─────────────────────────────────────────────────────────
export {
  mulberry32,
  white,
  brown,
  pink,
  drift,
  seededWhite,
  seededPink,
  type SeededRng,
  type NoiseGen,
  type SeededNoiseGen,
} from './noise'

// ─── Wave model + runtime ──────────────────────────────────────────
export {
  makeBeam,
  makeSweep,
  makeNoiseFloor,
  makeFundamental,
  makeBurst,
  makeWave,
  WavePumper,
  type Beam,
  type Sweep,
  type NoiseFloor,
  type Fundamental,
  type Burst,
  type Wave,
} from './signal'

// ─── Beam pass + segment pump (feed @ldlework/crt's Pipeline) ──────
export {
  DepositPass,
  SegmentPump,
  makeSegmentPump,
  SEGMENT_STRIDE,
  type SegmentBatch,
  type BeamFn,
  type BeamSample,
} from './beam'
