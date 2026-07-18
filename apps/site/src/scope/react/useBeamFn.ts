/*
 * useBeamFn — site-level: turns the scope pumpers into the BeamFn
 * that scope's DepositPass (via the segment pump) expects.
 *
 * Sample budget model:
 *   - `maxPerWave`     each wave gets THIS many samples per frame
 *                      regardless of how many waves exist. Per-wave
 *                      brightness stays constant as waves are added.
 *   - `maxTotalPerFrame`  absolute ceiling on samples per frame so a
 *                      runaway preset (50 waves) can't blow up the GPU.
 *                      When `maxPerWave * waveCount > maxTotalPerFrame`,
 *                      each wave is reduced to its fair share.
 *
 * Per frame, the hook:
 *   - Walks each pumper, calling step() up to perScope times.
 *   - For each step: read the wave's dials → plain Wave → pumper.step.
 *   - Emits a `break: true` BeamSample on every off→on edge and
 *     between waves so the segment shader doesn't draw long jumps.
 */

import { useMemo } from 'react'
import type { BeamFn, BeamSample, BeamPosition } from '@ldlework/scope'
import { readWaveDials } from '../signal/wave-dials'
import type { ScopePumpers } from './useScopePumpers'

export const DEFAULT_BEAM_HZ = 500_000
/** Per-wave sample budget. Single-wave brightness target. */
export const DEFAULT_MAX_PER_WAVE = 16_384
/** Absolute per-frame ceiling. Hit by ~8 waves at default per-wave. */
export const DEFAULT_MAX_TOTAL_PER_FRAME = 131_072

export interface UseBeamFnOptions {
  beamHz?: number
  /** Per-wave sample budget. Default DEFAULT_MAX_PER_WAVE. */
  maxPerWave?: number
  /** Absolute per-frame ceiling. Default DEFAULT_MAX_TOTAL_PER_FRAME. */
  maxTotalPerFrame?: number
}

function buildSample(p: BeamPosition, isBreak: boolean): BeamSample {
  const s: BeamSample = { x: p.x, y: p.y }
  if (isBreak) s.break = true
  if (p.beamI !== undefined) s.beamI = p.beamI
  if (p.beamWidth !== undefined) s.beamWidth = p.beamWidth
  return s
}

export function useBeamFn(
  pumpers: ScopePumpers,
  options: UseBeamFnOptions = {},
): BeamFn {
  const beamHz = options.beamHz ?? DEFAULT_BEAM_HZ
  const maxPerWave = options.maxPerWave ?? DEFAULT_MAX_PER_WAVE
  const maxTotalPerFrame = options.maxTotalPerFrame ?? DEFAULT_MAX_TOTAL_PER_FRAME

  return useMemo<BeamFn>(() => {
    const stepSec = 1 / beamHz
    const out: BeamSample[] = []
    const wasOn: boolean[] = []
    return (t, dt) => {
      const waves = pumpers.getWaves()
      const ps = pumpers.getPumpers()
      if (ps.length === 0) return []

      // Keep wasOn parallel to the pumper array.
      while (wasOn.length < ps.length) wasOn.push(false)
      if (wasOn.length > ps.length) wasOn.length = ps.length

      // Frame-time cap: even at maxPerWave we can't pump more than the
      // beamHz physically supports for the elapsed dt. This protects
      // against unrealistically large dt's (tab refocus, breakpoint).
      const frameCap = Math.max(1, Math.floor(dt / stepSec))

      // Per-wave budget = the smaller of maxPerWave, the frame cap, and
      // (totalCeiling / waveCount). Last clause kicks in only when many
      // waves are present.
      const totalCeiling = Math.min(maxTotalPerFrame, frameCap)
      const perScope = Math.max(
        1,
        Math.min(maxPerWave, Math.floor(totalCeiling / ps.length)),
      )

      out.length = 0
      const ctx = { t, dt }

      for (let si = 0; si < ps.length; si++) {
        const pumper = ps[si]!
        const dials = waves[si]!
        // Muted waves contribute nothing and don't open a beam chain.
        // We don't need to call pumper.step at all — it has internal
        // state but that state advances *deterministically* from wave
        // values, so pausing for a frame is fine. (If freezing internal
        // sweep phase across long mutes feels wrong later, this is the
        // place to revisit.)
        if (dials.mute) {
          wasOn[si] = false
          continue
        }
        let needsBreak = si > 0
        for (let i = 0; i < perScope; i++) {
          const wave = readWaveDials(dials, ctx)
          const p = pumper.step(wave, ctx)
          const on = p.on !== false
          if (!on) {
            wasOn[si] = false
            continue
          }
          if (!wasOn[si] || needsBreak) {
            out.push(buildSample(p, true))
            wasOn[si] = true
            needsBreak = false
            continue
          }
          out.push(buildSample(p, false))
        }
      }
      return out
    }
    // Options are baked at init; pumpers is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
