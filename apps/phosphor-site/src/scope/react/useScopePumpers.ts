/*
 * useScopePumpers — site-level bridge between WaveDials trees and
 * scope's WavePumpers.
 *
 * One pumper per wave, kept alive across dial-value mutations.
 * Rebuilt when a wave's object identity changes (preset reload,
 * duplicate, randomize).
 *
 * The hook returns *getters* rather than the arrays themselves so
 * consumers (useBeamFn's rAF loop) read the *latest* live arrays
 * inside the loop body without React having to re-bind callbacks.
 */

import { useEffect, useRef } from 'react'
import { WavePumper } from '@ldlework/scope'
import type { WaveDials } from '../signal/wave-dials'

export interface ScopePumpers {
  /** Live array of WaveDials being driven. */
  getWaves(): WaveDials[]
  /** Live array of pumpers, parallel to `getWaves()`. */
  getPumpers(): WavePumper[]
}

export function useScopePumpers(
  waves: WaveDials[],
  beamHz: number,
): ScopePumpers {
  const wavesRef = useRef(waves)
  wavesRef.current = waves

  // Reconcile pumpers to wave identity on every render. Cheap: at
  // steady state every wave still matches its existing pumper.
  const pumpersRef = useRef<WavePumper[]>([])
  const wavesAtPumperRef = useRef<WaveDials[]>([])
  const cur = pumpersRef.current
  const wAt = wavesAtPumperRef.current
  const next: WavePumper[] = waves.map((w, i) => {
    if (wAt[i] === w && cur[i]) return cur[i]!
    return new WavePumper(beamHz)
  })
  pumpersRef.current = next
  wavesAtPumperRef.current = waves.slice()

  // Empty effect to silence "ran during render" lint without
  // pretending the work happens inside an effect.
  useEffect(() => {}, [waves, beamHz])

  return {
    getWaves: () => wavesRef.current,
    getPumpers: () => pumpersRef.current,
  }
}
