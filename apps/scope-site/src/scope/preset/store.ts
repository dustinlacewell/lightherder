/*
 * Preset persistence for a static playground — localStorage first,
 * the bundled default JSON second, hardcoded defaults last. There is
 * no server: Save writes the visitor's tweaks to their browser,
 * Reset throws them away and restores the bundled default.
 */

import { makeDefaultPreset, type ScopePreset } from './preset'
import { presetFromSnap, presetToSnap, type ScopeSnap } from './snap'

const STORAGE_KEY = 'scope-site:preset'
const DEFAULT_URL = `${import.meta.env.BASE_URL}scope-preset.json`

async function fetchDefaultSnap(): Promise<ScopeSnap | undefined> {
  try {
    const res = await fetch(DEFAULT_URL, { cache: 'no-store' })
    if (!res.ok) return undefined
    const snap = (await res.json()) as ScopeSnap
    if (snap && typeof snap === 'object') return snap
  } catch {
    // fall through
  }
  return undefined
}

function storedSnap(): ScopeSnap | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return undefined
    const snap = JSON.parse(raw) as ScopeSnap
    if (snap && typeof snap === 'object') return snap
  } catch {
    // corrupt or unavailable storage — ignore
  }
  return undefined
}

export async function loadPreset(): Promise<ScopePreset> {
  const stored = storedSnap()
  if (stored) return presetFromSnap(stored)
  const bundled = await fetchDefaultSnap()
  if (bundled) return presetFromSnap(bundled)
  return makeDefaultPreset()
}

export function savePreset(preset: ScopePreset): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presetToSnap(preset)))
  } catch {
    // storage full/unavailable — the playground still works, just unsaved
  }
}

export async function resetPreset(): Promise<ScopePreset> {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
  const bundled = await fetchDefaultSnap()
  if (bundled) return presetFromSnap(bundled)
  return makeDefaultPreset()
}
