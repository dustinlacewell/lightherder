/*
 * High-level load / save helpers for dials trees.
 *
 * The library has `toJSON` / `fromJSON` for the in-memory conversion;
 * these wrap them with `fetch` against a configurable endpoint, so an
 * app can persist a dials surface to disk (typically via a Vite dev
 * middleware) in one call.
 *
 * The endpoint shape is dial-tree-agnostic — the helpers don't know
 * what your tree represents; they just round-trip its DialsSnap.
 */

import type { Dials } from './core'
import { fromJSON, toJSON, type DialsSnap } from './json'

export interface DialsEndpoint {
  /** Live GET/POST URL. */
  url: string
  /** Optional static fallback URL (used when the live URL 404s). */
  fallbackUrl?: string
}

/**
 * GET the dials snapshot, hydrate `target` in place. Tries `url`
 * first; on miss, tries `fallbackUrl`; on miss again, leaves the
 * target untouched.
 *
 * Returns `true` if a snapshot was loaded, `false` otherwise.
 * Never throws — network or parse errors are swallowed and surface
 * as `false`.
 */
export async function loadDials(
  target: Dials,
  endpoint: DialsEndpoint,
): Promise<boolean> {
  const snap =
    (await fetchSnap(endpoint.url)) ??
    (endpoint.fallbackUrl ? await fetchSnap(endpoint.fallbackUrl) : undefined)
  if (!snap) return false
  fromJSON(target, snap)
  return true
}

/**
 * POST the dials snapshot to the live endpoint. Returns `true` if
 * the request was made successfully; `false` if it threw.
 */
export async function saveDials(
  target: Dials,
  endpoint: DialsEndpoint,
): Promise<boolean> {
  try {
    const snap = toJSON(target)
    await fetch(endpoint.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snap, null, 2),
    })
    return true
  } catch {
    return false
  }
}

async function fetchSnap(url: string): Promise<DialsSnap | undefined> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return undefined
    const snap = (await res.json()) as DialsSnap
    if (snap && typeof snap === 'object') return snap
  } catch {
    // fall through
  }
  return undefined
}
