/*
 * ScopePreset ↔ JSON snapshot. Walks every dial tree in the preset
 * using dials' toJSON/fromJSON and bundles the result as one
 * snapshot blob.
 */

import { fromJSON, toJSON, type DialsSnap } from '@ldlework/dials'
import { makeScreenDials } from './screen-dials'
import { makePointerTrailDials } from './pointer-dials'
import { makeBurstDials } from '../signal/burst-dials'
import { makeFundamentalDials } from '../signal/fundamental-dials'
import { makeWaveDials, type WaveDials } from '../signal/wave-dials'
import { makeDefaultPreset, type ScopePreset } from './preset'

export interface WaveSnap {
  mute?: boolean
  beam: DialsSnap
  sweep: DialsSnap
  noiseFloor: DialsSnap
  fundamentals: DialsSnap[]
  bursts: DialsSnap[]
}

export interface ScopeSnap {
  screen: DialsSnap
  waves: WaveSnap[]
  pointer: DialsSnap
}

// ─── To-snap ────────────────────────────────────────────────────────

export function presetToSnap(preset: ScopePreset): ScopeSnap {
  return {
    screen: toJSON(preset.screen),
    waves: preset.waves.map(waveToSnap),
    pointer: toJSON(preset.pointer),
  }
}

export function waveToSnap(wave: WaveDials): WaveSnap {
  return {
    mute: wave.mute,
    beam: toJSON(wave.beam),
    sweep: toJSON(wave.sweep),
    noiseFloor: toJSON(wave.noiseFloor),
    fundamentals: wave.fundamentals.map((f) => toJSON(f)),
    bursts: wave.bursts.map((b) => toJSON(b)),
  }
}

// ─── From-snap ──────────────────────────────────────────────────────

export function presetFromSnap(snap: ScopeSnap): ScopePreset {
  if (!snap || typeof snap !== 'object') return makeDefaultPreset()
  const screen = makeScreenDials()
  fromJSON(screen, snap.screen ?? {})
  const waves = (snap.waves ?? []).map(waveFromSnap)
  if (waves.length === 0) waves.push(makeWaveDials())
  const pointer = makePointerTrailDials()
  fromJSON(pointer, snap.pointer ?? {})
  return { screen, waves, pointer }
}

export function waveFromSnap(snap: WaveSnap): WaveDials {
  const w = makeWaveDials()
  w.mute = snap.mute ?? false
  w.fundamentals = []
  w.bursts = []
  fromJSON(w.beam, snap.beam ?? {})
  fromJSON(w.sweep, snap.sweep ?? {})
  fromJSON(w.noiseFloor, snap.noiseFloor ?? {})
  for (const fs of snap.fundamentals ?? []) {
    const f = makeFundamentalDials()
    fromJSON(f, fs)
    w.fundamentals.push(f)
  }
  for (const bs of snap.bursts ?? []) {
    const b = makeBurstDials()
    fromJSON(b, bs)
    w.bursts.push(b)
  }
  if (w.fundamentals.length === 0) w.fundamentals.push(makeFundamentalDials())
  return w
}
