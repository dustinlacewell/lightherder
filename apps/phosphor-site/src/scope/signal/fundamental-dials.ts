import { dial, read, type Ctx, type Slot } from '@ldlework/dials'
import type { Fundamental } from '@ldlework/scope'

export type FundamentalDials = {
  freq: Slot<number>
  amp: Slot<number>
  phase: Slot<number>
}

export function makeFundamentalDials(
  freqHz = 600,
  amp = 0.4,
  phase = 0,
): FundamentalDials {
  return {
    freq: dial(freqHz, {
      min: 1, max: 5000, step: 1, label: 'freq (Hz)', scale: 'log',
      description: 'Sinusoid frequency in Hz. Log-scaled slider — drag through low-end frequencies smoothly. Pair with sweepSec to control how many cycles per sweep you see.',
    }),
    amp: dial(amp, {
      min: 0, max: 1, step: 0.01, label: 'amp',
      description: 'Sinusoid amplitude in NDC y-units. Sum of all fundamental amps + bursts is clamped to [-1, 1] at emit time.',
    }),
    phase: dial(phase, {
      min: 0, max: 6.2832, step: 0.01, label: 'phase',
      description: 'Phase offset in radians (0–2π). Shifts where the sinusoid crosses zero. With phaseLock on, every sweep starts at this phase.',
    }),
  }
}

export function readFundamental(d: FundamentalDials, ctx: Ctx): Fundamental {
  const v = read(d, ctx)
  return { freq: v.freq, amp: v.amp, phase: v.phase }
}
