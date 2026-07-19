/* Where the bench survives a reload — the patch tree plus globals,
   in one localStorage entry, speaking the patch JSON dialect. */

import { patchFromJSON, patchToJSON, type Patch } from '../patch';

const KEY = 'herder.patch.v1';

export function savePatch(p: Patch): void {
  try { localStorage.setItem(KEY, JSON.stringify(patchToJSON(p))); } catch { /* storage full / denied — run stateless */ }
}

export function loadPatch(): Patch | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? patchFromJSON(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
