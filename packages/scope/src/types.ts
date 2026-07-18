/*
 * Top-level scope types — the public contract a pumper consumes.
 */

/**
 * Per-step animation context. Just wall-clock time and time-since-
 * last-step in seconds. Mirrors the shape dials uses but is owned
 * here so scope doesn't depend on dials.
 */
export interface Ctx {
  t: number
  dt: number
}

/**
 * One beam position in NDC, in [-1, 1] on both axes, plus the per-
 * sample beam character that the CRT deposit pass reads.
 *
 * `on=false` means the beam is blanked (retrace, hunt). The frame
 * loop skips depositing those samples but emits a `break: true`
 * BeamSample to the renderer on each off→on edge so the segment
 * shader doesn't draw a long jump.
 */
export interface BeamPosition {
  x: number
  y: number
  on?: boolean
  /** Per-sample beam intensity multiplier (1 = neutral). */
  beamI?: number
  /** Per-sample beam width multiplier (1 = neutral). */
  beamWidth?: number
}
