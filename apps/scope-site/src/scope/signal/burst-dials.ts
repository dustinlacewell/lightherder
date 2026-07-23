import { dial, read, type Ctx, type Slot } from '@ldlework/dials'
import type { Burst } from '@ldlework/scope'

export type BurstDials = {
  phase: Slot<number>
  width: Slot<number>
  seed: Slot<number>
  occurrence: Slot<number>
  beamI: Slot<number>
  ampCenter: Slot<number>
  ampDepth: Slot<number>
  ampFreq: Slot<number>
  ampPhase: Slot<number>
  densityCenter: Slot<number>
  densityDepth: Slot<number>
  densityFreq: Slot<number>
  densityPhase: Slot<number>
  lowpassCenter: Slot<number>
  lowpassDepth: Slot<number>
  lowpassFreq: Slot<number>
  lowpassPhase: Slot<number>
}

export function makeBurstDials(seed = 1, phase = 0.2, width = 0.15): BurstDials {
  return {
    phase: dial(phase, {
      min: 0, max: 1, step: 0.001, label: 'phase',
      description: 'Where in the sweep this burst starts firing, in normalized sweep phase [0, 1]. 0 = sweep start, 1 = sweep end.',
    }),
    width: dial(width, {
      min: 0, max: 1, step: 0.001, label: 'width',
      description: 'Burst window width, in normalized sweep phase. 0.1 = burst covers 10% of the sweep.',
    }),
    seed: dial(seed, {
      min: 1, max: 9999, step: 1, label: 'seed',
      description: 'Seed for this burst\'s deterministic noise. Same seed → identical noise on every sweep, so persistence stacks coherent copies (the "haunted hair" effect).',
    }),
    occurrence: dial(1, {
      min: 0, max: 1, step: 0.01, label: 'occurrence',
      description: 'Probability per sweep that the burst actually fires. 1 = every sweep, 0 = never, 0.5 = coin flip each sweep.',
    }),
    beamI: dial(0.3, {
      min: 0.01, max: 4, step: 0.01, label: 'beamI', scale: 'log',
      description: 'Beam intensity multiplier *inside* this burst\'s window. <1 = ghostlier than the carrier, >1 = highlight burst. Log-scaled.',
    }),
    ampCenter: dial(0.4, {
      min: 0, max: 1, step: 0.001, label: 'ampCenter',
      description: 'Baseline amplitude of the burst\'s noise envelope. ampDepth modulates around this center over the burst window.',
    }),
    ampDepth: dial(0, {
      min: 0, max: 1, step: 0.001, label: 'ampDepth',
      description: 'How far the noise amplitude swings around ampCenter (driven by ampFreq sinusoid across the burst window).',
    }),
    ampFreq: dial(1, {
      min: 0, max: 8, step: 0.01, label: 'ampFreq (cyc/sweep)',
      description: 'Speed of the amplitude modulation, in cycles across the burst window. 1 = one swell from start to end.',
    }),
    ampPhase: dial(0, {
      min: 0, max: 6.2832, step: 0.01, label: 'ampPhase',
      description: 'Starting phase of the amp modulator, in radians (0–2π).',
    }),
    densityCenter: dial(1, {
      min: 0, max: 1, step: 0.001, label: 'densityCenter',
      description: 'Baseline probability a noise sample actually fires (vs being gated to 0). 1 = always fire, 0 = never.',
    }),
    densityDepth: dial(0, {
      min: 0, max: 1, step: 0.001, label: 'densityDepth',
      description: 'How far the density swings around densityCenter. With density modulation you get bursts that thin and thicken across the window.',
    }),
    densityFreq: dial(0, {
      min: 0, max: 8, step: 0.01, label: 'densityFreq',
      description: 'Speed of density modulation, in cycles across the burst window.',
    }),
    densityPhase: dial(0, {
      min: 0, max: 6.2832, step: 0.01, label: 'densityPhase',
      description: 'Starting phase of the density modulator, in radians (0–2π).',
    }),
    lowpassCenter: dial(1, {
      min: 0, max: 1, step: 0.001, label: 'lowpassCenter',
      description: 'Baseline lowpass blend (0 = held flat, 1 = passes noise through unchanged). Controls how much high-frequency content survives.',
    }),
    lowpassDepth: dial(0, {
      min: 0, max: 1, step: 0.001, label: 'lowpassDepth',
      description: 'How far the lowpass swings around lowpassCenter. Bursts can wash from bright to muffled across the window.',
    }),
    lowpassFreq: dial(0, {
      min: 0, max: 8, step: 0.01, label: 'lowpassFreq',
      description: 'Speed of lowpass modulation, in cycles across the burst window.',
    }),
    lowpassPhase: dial(0, {
      min: 0, max: 6.2832, step: 0.01, label: 'lowpassPhase',
      description: 'Starting phase of the lowpass modulator, in radians (0–2π).',
    }),
  }
}

export function readBurst(d: BurstDials, ctx: Ctx): Burst {
  const v = read(d, ctx)
  return {
    phase: v.phase, width: v.width, seed: v.seed,
    occurrence: v.occurrence, beamI: v.beamI,
    ampCenter: v.ampCenter, ampDepth: v.ampDepth, ampFreq: v.ampFreq, ampPhase: v.ampPhase,
    densityCenter: v.densityCenter, densityDepth: v.densityDepth, densityFreq: v.densityFreq, densityPhase: v.densityPhase,
    lowpassCenter: v.lowpassCenter, lowpassDepth: v.lowpassDepth, lowpassFreq: v.lowpassFreq, lowpassPhase: v.lowpassPhase,
  }
}
