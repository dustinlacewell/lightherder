/*
 * Noise generators — three flavours, each as a stateful generator
 * that yields one sample per call:
 *
 *   white()  uniform random in [-1, 1]   — uncorrelated buzz
 *   brown()  integrated white            — momentum, slow drift
 *   pink()   1/f-shaped                  — natural-feeling texture
 *
 * Brown is the interesting one for slow modulation (wandering
 * frequency drift); pink is the one for high-frequency content
 * that, fed through a persistent phosphor, reads as ghost fuzz
 * around the trace.
 *
 * All three are sample-rate agnostic — they yield a sequence of
 * samples; what those samples represent in time is the caller's
 * problem. The brown generator carries a leak factor so it doesn't
 * drift to infinity over long runs; the default constants assume
 * tens-of-kHz sample rates.
 */

import { mulberry32, type SeededRng } from './rng'

export interface NoiseGen {
  next(): number
}

/** Uniform white noise in [-amp, amp]. */
export function white(amp = 1): NoiseGen {
  return {
    next: () => (Math.random() - 0.5) * 2 * amp,
  }
}

/**
 * Brown (Brownian / red) noise — integrated white with a small leak
 * so it stays bounded. Spectrum is 1/f². Output is roughly in
 * [-amp, amp] but excursions past that are possible; clamp at the
 * call site if you need a hard bound.
 *
 * The leak constant of 0.997 corresponds to a ~330-sample relaxation
 * time, which at ~tens-of-kHz sample rates is a few ms — fast enough
 * to stay centered, slow enough to feel like drift.
 */
export function brown(amp = 1, leak = 0.997): NoiseGen {
  let v = 0
  const step = amp * 0.05
  return {
    next() {
      v = v * leak + (Math.random() - 0.5) * step
      return v
    },
  }
}

/**
 * Pink noise via the Voss-McCartney algorithm. Five octave-spaced
 * random sources summed; one source updates each call, the slowest
 * source updates rarely. Gives ~1/f power spectrum cheaply.
 *
 * Pink has equal energy per octave — exactly what makes it feel
 * "natural" compared to white. Good for the high-freq signal-noise
 * layer that produces ghost frizz on the phosphor.
 */
export function pink(amp = 1): NoiseGen {
  const rows = [0, 0, 0, 0, 0]
  let counter = 0
  return {
    next() {
      counter++
      // The index of the lowest set bit of counter tells us which
      // row to refresh: row 0 every call, row 1 every 2, row 2
      // every 4, etc.
      let row = 0
      let c = counter
      while ((c & 1) === 0 && row < rows.length - 1) {
        c >>= 1
        row++
      }
      rows[row] = Math.random() - 0.5
      let sum = 0
      for (let i = 0; i < rows.length; i++) sum += rows[i]!
      return (sum / 2.5) * amp
    },
  }
}

/**
 * Convenience: a "smooth random" generator built on brown noise but
 * pre-scaled so a `next()` call returns values bounded around `amp`.
 * Useful for slow-drift modulation of carrier parameters (amplitude
 * breathing, frequency drift).
 *
 * `seconds` is the approximate time-constant the drift should cover;
 * `sampleHz` is the rate `next()` will be called at. The leak factor
 * is computed so the autocorrelation length matches.
 */
export function drift(amp: number, seconds: number, sampleHz: number): NoiseGen {
  // 1 - 1/(tau · fs) is the standard EWMA pole for time-constant tau.
  const tau = Math.max(1e-6, seconds)
  const leak = Math.max(0, 1 - 1 / (tau * sampleHz))
  return brown(amp, leak)
}

// ─── Seeded variants ──────────────────────────────────────────────────

/** Seeded white noise in [-amp, amp]. `reset()` re-rolls the sequence. */
export interface SeededNoiseGen extends NoiseGen {
  reset(): void
}

export function seededWhite(amp: number, seed: number): SeededNoiseGen {
  const rng = mulberry32(seed)
  const initial = seed
  return {
    next: () => (rng.next() - 0.5) * 2 * amp,
    reset: () => rng.reset(initial),
  }
}

/**
 * Seeded pink noise — same Voss-McCartney structure as `pink()` but
 * driven by a seedable RNG, with a `reset()` that re-seeds AND clears
 * the row state so two reset calls produce identical output sequences.
 * That's what makes a burst at the same sweep-phase render identically
 * every sweep.
 */
export function seededPink(amp: number, seed: number): SeededNoiseGen {
  const rng: SeededRng = mulberry32(seed)
  const initial = seed
  const rows = [0, 0, 0, 0, 0]
  let counter = 0
  const reset = () => {
    rng.reset(initial)
    rows.fill(0)
    counter = 0
  }
  const next = () => {
    counter++
    let row = 0
    let c = counter
    while ((c & 1) === 0 && row < rows.length - 1) {
      c >>= 1
      row++
    }
    rows[row] = rng.next() - 0.5
    let sum = 0
    for (let i = 0; i < rows.length; i++) sum += rows[i]!
    return (sum / 2.5) * amp
  }
  return { next, reset }
}
