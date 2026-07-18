/*
 * One fundamental sinusoid. A wave is the sum of N of these:
 *
 *   y = Σᵢ ampᵢ · sin(2π · freqᵢ · t + phaseᵢ)
 *
 * Modulation (e.g. frequency drift) is the caller's job — vary the
 * fields between steps and the pumper picks the changes up.
 */

export interface Fundamental {
  freq: number
  amp: number
  phase: number
}

export function makeFundamental(
  freq = 600,
  amp = 0.4,
  phase = 0,
): Fundamental {
  return { freq, amp, phase }
}
