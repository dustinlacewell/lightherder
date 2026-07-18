/*
 * Beam-specific public types — input shape consumed by DepositPass
 * (via the segment pump).
 */

/** One emission sample in normalized-device coords. */
export interface BeamSample {
  /** Position X in [-1, 1]. */
  x: number
  /** Position Y in [-1, 1]. */
  y: number
  /**
   * Break the segment chain. When true, no segment is drawn from the
   * previous sample to this one; this sample becomes the start of a
   * new chain. Use for retrace blanking, signal-off boundaries, or
   * mode changes — anywhere the beam jumps without painting the path.
   */
  break?: boolean
  /**
   * Per-sample beam character. Optional; missing fields default to 1
   * (neutral, fall back to the pass-level baseline).
   *
   *   beamI       multiplicative deposit gain at this sample.
   *   beamWidth   per-sample Gaussian σ multiplier.
   */
  beamI?: number
  beamWidth?: number
}

/**
 * The beam function. Called once per animation frame with the current
 * frame time `t` (seconds since mount) and `dt` (seconds since last
 * call). Should yield one or more samples — typically heavily
 * oversampled along the trace so accumulation density does the work
 * of velocity-dependent intensity for you.
 *
 * Returning an empty iterable is fine — the rest of the pipeline (decay,
 * halation, present) still runs so persistence fades cleanly when no
 * signal is present.
 */
export type BeamFn = (t: number, dt: number) => Iterable<BeamSample>
