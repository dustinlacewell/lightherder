/*
 * Site-side dials tree mirroring scope's `Wave`. `readWaveDials`
 * converts the whole tree to a plain `Wave` once per frame for the
 * pumper to consume.
 *
 * `mute` is a plain boolean on the WaveDials object — not a dial —
 * because automatically gating a wave via modulation is exotic and
 * adding a Slot<number> for a UI toggle would be overkill. It still
 * round-trips through the snap layer alongside the dial sections.
 */

import type { Ctx } from '@ldlework/dials'
import type { Wave } from '@ldlework/scope'
import { makeBeamDials, readBeam, type BeamDials } from './beam-dials'
import { makeSweepDials, readSweep, type SweepDials } from './sweep-dials'
import { makeNoiseFloorDials, readNoiseFloor, type NoiseFloorDials } from './noise-floor-dials'
import { makeFundamentalDials, readFundamental, type FundamentalDials } from './fundamental-dials'
import { readBurst, type BurstDials } from './burst-dials'

export type WaveDials = {
  mute: boolean
  beam: BeamDials
  sweep: SweepDials
  noiseFloor: NoiseFloorDials
  fundamentals: FundamentalDials[]
  bursts: BurstDials[]
}

export function makeWaveDials(): WaveDials {
  return {
    mute: false,
    beam: makeBeamDials(),
    sweep: makeSweepDials(),
    noiseFloor: makeNoiseFloorDials(),
    fundamentals: [makeFundamentalDials()],
    bursts: [],
  }
}

/**
 * Build a fresh plain Wave by reading every leaf in `d`. The pumper
 * consumes the result; the result is a per-tick snapshot — call this
 * once per frame and feed the same Wave to every pumper.step() of
 * that frame (values can't change within a tick).
 */
export function readWaveDials(d: WaveDials, ctx: Ctx): Wave {
  return {
    mute: d.mute,
    beam: readBeam(d.beam, ctx),
    sweep: readSweep(d.sweep, ctx),
    noiseFloor: readNoiseFloor(d.noiseFloor, ctx),
    fundamentals: d.fundamentals.map((f) => readFundamental(f, ctx)),
    bursts: d.bursts.map((b) => readBurst(b, ctx)),
  }
}
