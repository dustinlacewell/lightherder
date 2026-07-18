/*
 * WavePumper — the runtime that turns a `Wave` (numeric snapshot) into
 * a stream of `BeamPosition` samples at a configured beam rate.
 *
 * Caller responsibility: the wave object handed to each step() call
 * should reflect the *current* per-frame values. If you're driving
 * the wave from dials, read the dials before each step. If from
 * static config, pass the same object every frame.
 *
 * Per sample, the pumper:
 *   1. Reads the wave's current field values.
 *   2. Advances each fundamental's phase by `2π·freq·dt` and sums them
 *      → the *trigger* sample (carrier-only).
 *   3. Mixes in noise floor + actively-firing burst output.
 *   4. Runs the sweep state machine (hunting → sweeping → hunting).
 *   5. Applies x-jitter and emits one beam position.
 *
 * Bursts retain deterministic-reset-on-window-entry: seeded RNGs
 * reset every time the sweep crosses into the burst's window so
 * persistence stacks identical noise sequences (the haunted-hair
 * effect).
 *
 * Pure TypeScript — no React, no DOM, no WebGL, no dials.
 */

import { mulberry32, seededPink, type SeededNoiseGen, type SeededRng } from '../noise'
import type { BeamPosition, Ctx } from '../types'
import type { Burst } from './burst'
import type { Wave } from './wave'

/** Per-fundamental phase integrator. */
interface FundState {
  phase: number
}

/** Per-burst RNG / window state. */
interface BurstState {
  noiseGen: SeededNoiseGen
  gateRng: SeededRng
  wasInside: boolean
  fireThisSweep: boolean
  lpState: number
  /** Last seed value we materialised generators against. */
  lastSeed: number
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export class WavePumper {
  // ── Sweep state machine ──────────────────────────────────────────
  private state: 'sweeping' | 'hunting' = 'hunting'
  private phase = 1
  private armed = false
  private huntSamples = 0

  // ── Per-fundamental / per-burst state ────────────────────────────
  private funds: FundState[] = []
  private burstStates: BurstState[] = []
  private noiseGen: SeededNoiseGen
  private lastNoiseSeed = NaN

  /**
   * Per-sample accumulator: starts at 1 each step, multiplied by every
   * firing burst's beamI. Lives on the instance so we don't allocate
   * a closure each frame.
   */
  private _burstAcc = 1

  constructor(private readonly beamHz: number) {
    this.noiseGen = seededPink(1, 1)
  }

  /**
   * Advance internal lists to match the structural shape of `wave`.
   * Called automatically by step() — exposed so callers can resync
   * after large structural changes if they want explicit control.
   */
  resync(wave: Wave): void {
    while (this.funds.length < wave.fundamentals.length) {
      this.funds.push({ phase: 0 })
    }
    if (this.funds.length > wave.fundamentals.length) {
      this.funds.length = wave.fundamentals.length
    }
    while (this.burstStates.length < wave.bursts.length) {
      const b = wave.bursts[this.burstStates.length]!
      this.burstStates.push(this.makeBurstState(b))
    }
    if (this.burstStates.length > wave.bursts.length) {
      this.burstStates.length = wave.bursts.length
    }
  }

  step(wave: Wave, ctx: Ctx): BeamPosition {
    // Reconcile structural shape lazily — cheap when nothing changed.
    if (
      this.funds.length !== wave.fundamentals.length ||
      this.burstStates.length !== wave.bursts.length
    ) {
      this.resync(wave)
    }
    const dt = 1 / this.beamHz

    const trigger = this.advanceTrigger(wave, dt)
    const noiseSample = this.sampleNoiseFloor(wave.noiseFloor.amp, asInt(wave.noiseFloor.seed))

    this._burstAcc = 1
    const burstSum = this.sumBursts(wave, ctx)
    const burstBeamMul = this._burstAcc

    const ySum = trigger + noiseSample + burstSum
    const yClamped = ySum > 1 ? 1 : ySum < -1 ? -1 : ySum

    this.tickSweep(trigger, wave.sweep)

    const x = this.computeX(wave.sweep.xJitter)

    return {
      x,
      y: yClamped,
      on: this.state === 'sweeping',
      beamI: wave.beam.intensity * burstBeamMul,
      beamWidth: wave.beam.width,
    }
  }

  // ─── Step internals ──────────────────────────────────────────────

  /** Sum of fundamentals only — bursts + noise excluded so the
   *  trigger doesn't false-fire on noise excursions. Side effect:
   *  integrates each fundamental's phase by `2π·freq·dt`. */
  private advanceTrigger(wave: Wave, dt: number): number {
    let trigger = 0
    for (let i = 0; i < wave.fundamentals.length; i++) {
      const f = wave.fundamentals[i]!
      const st = this.funds[i]!
      const w = 2 * Math.PI * f.freq
      st.phase += w * dt
      trigger += f.amp * Math.sin(st.phase + f.phase)
    }
    return trigger
  }

  /** One noise-floor sample. Rebuilds the generator if `seed` changed. */
  private sampleNoiseFloor(amp: number, seedNow: number): number {
    if (seedNow !== this.lastNoiseSeed) {
      this.noiseGen = seededPink(1, seedNow)
      this.lastNoiseSeed = seedNow
    }
    return amp * this.noiseGen.next()
  }

  /** Walk bursts, mutate `_burstAcc` for each firing burst, return
   *  summed y contribution. */
  private sumBursts(wave: Wave, ctx: Ctx): number {
    let burstSum = 0
    for (let i = 0; i < wave.bursts.length; i++) {
      burstSum += this.stepBurst(wave.bursts[i]!, this.burstStates[i]!, ctx)
    }
    return burstSum
  }

  /** Advance the sweep state machine. `fired` triggers phase-lock if on. */
  private tickSweep(trigger: number, sweep: Wave['sweep']): void {
    if (this.state === 'sweeping') {
      const dPhase = 1 / Math.max(sweep.sweepSec * this.beamHz, 1)
      this.phase += dPhase
      if (this.phase >= 1) {
        this.phase = 1
        this.state = 'hunting'
        this.armed = false
        this.huntSamples = 0
      }
      return
    }

    this.huntSamples++
    let fired = false
    if (!this.armed) {
      if (trigger < sweep.armLevel) this.armed = true
    } else if (trigger > sweep.fireLevel) {
      fired = true
    }
    const maxHunt = Math.max(1, Math.round(sweep.sweepSec * 8 * this.beamHz))
    if (!fired && this.huntSamples >= maxHunt) fired = true

    if (fired) {
      this.phase = 0
      this.state = 'sweeping'
      if (sweep.phaseLock) {
        for (let i = 0; i < this.funds.length; i++) this.funds[i]!.phase = 0
      }
    }
  }

  /** Map sweep phase to NDC x with live jitter. */
  private computeX(xJitterAmp: number): number {
    const jitter = (Math.random() * 2 - 1) * xJitterAmp
    return this.phase * 2 - 1 + jitter
  }

  // ─── Bursts ──────────────────────────────────────────────────────

  private makeBurstState(b: Burst): BurstState {
    const seed = asInt(b.seed)
    return {
      noiseGen: seededPink(1, seed),
      gateRng: mulberry32((seed ^ 0x9e3779b9) >>> 0),
      wasInside: false,
      fireThisSweep: false,
      lpState: 0,
      lastSeed: seed,
    }
  }

  /** One burst's contribution this sample. Side effect: multiplies
   *  the firing burst's `beamI` into `this._burstAcc`. */
  private stepBurst(b: Burst, st: BurstState, _ctx: Ctx): number {
    void _ctx
    const sweepPhase = this.phase

    // Re-seed if the burst's seed changed.
    const seedNow = asInt(b.seed)
    if (seedNow !== st.lastSeed) {
      st.noiseGen = seededPink(1, seedNow)
      st.gateRng = mulberry32((seedNow ^ 0x9e3779b9) >>> 0)
      st.lastSeed = seedNow
    }

    const inside = sweepPhase >= b.phase && sweepPhase < b.phase + b.width
    if (!inside) {
      if (st.wasInside) this.resetBurst(st)
      return 0
    }
    if (!st.wasInside) {
      this.resetBurst(st)
      st.wasInside = true
      st.fireThisSweep = Math.random() < clamp01(b.occurrence)
    }
    if (!st.fireThisSweep) return 0

    this._burstAcc *= b.beamI

    const intra = (sweepPhase - b.phase) / Math.max(b.width, 1e-6)

    const amp = b.ampCenter + b.ampDepth *
      Math.sin(2 * Math.PI * b.ampFreq * intra + b.ampPhase)
    const density = clamp01(b.densityCenter + b.densityDepth *
      Math.sin(2 * Math.PI * b.densityFreq * intra + b.densityPhase))
    const lpAlpha = clamp01(b.lowpassCenter + b.lowpassDepth *
      Math.sin(2 * Math.PI * b.lowpassFreq * intra + b.lowpassPhase))

    const raw = st.noiseGen.next()
    st.lpState = lpAlpha * raw + (1 - lpAlpha) * st.lpState
    const passed = st.gateRng.next() < density ? st.lpState : 0
    return amp * passed
  }

  private resetBurst(st: BurstState): void {
    st.noiseGen.reset()
    st.gateRng.reset((st.lastSeed ^ 0x9e3779b9) >>> 0)
    st.lpState = 0
    st.wasInside = false
  }
}

function asInt(v: number): number {
  return Math.max(1, Math.floor(v))
}
