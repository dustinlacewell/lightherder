/*
 * Scope preset — the dials tree the playground edits and persists.
 * Owned entirely by the site; scope and crt know nothing about it.
 */

import { makeScreenDials, type ScreenDials } from './screen-dials'
import { makeWaveDials, type WaveDials } from '../signal/wave-dials'
import { makePointerTrailDials, type PointerTrailDials } from './pointer-dials'

export interface ScopePreset {
  screen: ScreenDials
  waves: WaveDials[]
  pointer: PointerTrailDials
}

export function makeDefaultPreset(): ScopePreset {
  return {
    screen: makeScreenDials(),
    waves: [makeWaveDials()],
    pointer: makePointerTrailDials(),
  }
}

function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo)
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * Roll a fresh wave with one fundamental, mid-range params, sweep
 * matched to ~1–3 cycles per sweep.
 */
export function randomWave(): WaveDials {
  const w = makeWaveDials()
  const f = w.fundamentals[0]!
  const freqHz = rand(100, 1200)
  const amp = rand(0.15, 0.55)
  const cyclesPerSweep = rand(1, 3)
  const sweepSec = clamp(cyclesPerSweep / freqHz, 0.0005, 0.02)
  f.freq.dial.value = freqHz
  f.amp.dial.value = amp
  w.sweep.sweepSec.dial.value = sweepSec
  w.sweep.fireLevel.dial.value = amp * 0.1
  w.sweep.armLevel.dial.value = -amp * 0.1
  return w
}
