/*
 * HeroPreset persistence — load + save the bundled JSON snapshot
 * via a configurable endpoint. Built on top of plain `fetch` rather
 * than dials' load/save helpers because HeroPreset isn't a single
 * Dials tree — it's a composite shape that wraps multiple trees.
 */

import { makeDefaultPreset, type HeroPreset } from './hero-preset'
import { presetFromSnap, presetToSnap, type HeroSnap } from './snap'

export interface PresetEndpoint {
  endpoint: string
  fallbackUrl?: string
}

async function fetchSnap(url: string): Promise<HeroSnap | undefined> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return undefined
    const snap = (await res.json()) as HeroSnap
    if (snap && typeof snap === 'object') return snap
  } catch {
    // fall through
  }
  return undefined
}

export async function loadHeroPreset(endpoint: PresetEndpoint): Promise<HeroPreset> {
  const live = await fetchSnap(endpoint.endpoint)
  if (live) return presetFromSnap(live)
  if (endpoint.fallbackUrl) {
    const fb = await fetchSnap(endpoint.fallbackUrl)
    if (fb) return presetFromSnap(fb)
  }
  return makeDefaultPreset()
}

export async function saveHeroPreset(
  preset: HeroPreset,
  endpoint: PresetEndpoint,
): Promise<void> {
  const snap = presetToSnap(preset)
  await fetch(endpoint.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snap, null, 2),
  })
}
