/**
 * Knob-travel space — the shared normalized [0, 1] coordinate system
 * the combine step and every slider UI agree on.
 *
 * A slot's range metadata (`min`/`max`/`scale`) defines a mapping
 * between *values* (user units) and *positions* (fraction of knob
 * travel). Modulation depth is expressed in position space, so a given
 * depth sweeps the same arc on every dial regardless of scale —
 * symmetric on linear dials, geometric on log dials. The sampler
 * combines `fromPos(toPos(base) + depth·signal)` through this exact
 * mapping, and the Knob's own drag math mirrors it, so what the band
 * shows is what the sampler does.
 */

export interface RangeMeta {
  min?: number
  max?: number
  scale?: 'linear' | 'log'
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v))

function validRange(meta: RangeMeta): meta is { min: number; max: number; scale?: 'linear' | 'log' } {
  return (
    typeof meta.min === 'number' &&
    typeof meta.max === 'number' &&
    Number.isFinite(meta.min) &&
    Number.isFinite(meta.max) &&
    meta.max > meta.min
  )
}

/**
 * Value → position in [0, 1]. Linear: affine map over [min, max].
 * Log (`scale: 'log'`, requires `min > 0`):
 * `pos = ln(v/min) / ln(max/min)`. The input value is clamped into
 * range first. Returns `NaN` when `min`/`max` are not both finite
 * numbers with `max > min` — callers guard.
 */
export function toPos(meta: RangeMeta, value: number): number {
  if (!validRange(meta)) return NaN
  const { min, max } = meta
  if (meta.scale === 'log' && min > 0) {
    return Math.log(clamp(value, min, max) / min) / Math.log(max / min)
  }
  return (clamp(value, min, max) - min) / (max - min)
}

/**
 * Position → value. Inverse of `toPos`: linear is the affine map back,
 * log is `v = min · (max/min)^pos`. The input position is clamped into
 * [0, 1]. Returns `NaN` when `min`/`max` are not both finite numbers
 * with `max > min` — callers guard.
 */
export function fromPos(meta: RangeMeta, pos: number): number {
  if (!validRange(meta)) return NaN
  const { min, max } = meta
  const p = clamp(pos, 0, 1)
  if (meta.scale === 'log' && min > 0) {
    return min * Math.pow(max / min, p)
  }
  return min + p * (max - min)
}
