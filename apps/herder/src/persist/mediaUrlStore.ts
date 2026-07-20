/* Where a media device's remote video URL survives a reload. A URL is
   just a string, so localStorage is enough — no need for mediaStore's
   IndexedDB. One key per media node id, namespaced against collision
   with the app's other localStorage entries. */

const PREFIX = 'herder-media-url:';

/** remember (or, given `null`, forget) the remote URL a media device
    is pointed at. Synchronous — localStorage has no async API — but
    kept promise-shaped like mediaStore's writes so callers don't care
    which backing store they're calling. */
export function storeMediaUrl(nodeId: string, url: string | null): void {
  try {
    if (url === null) localStorage.removeItem(PREFIX + nodeId);
    else localStorage.setItem(PREFIX + nodeId, url);
  } catch { /* storage full / denied — keep running, just don't remember it */ }
}

export async function loadStoredMediaUrl(nodeId: string): Promise<string | null> {
  try {
    return localStorage.getItem(PREFIX + nodeId);
  } catch {
    return null;
  }
}

/** drop the stored URL for exactly `nodeId` — dropNode's cleanup twin
    for dropStoredMedia. */
export function dropStoredMediaUrl(nodeId: string): void {
  storeMediaUrl(nodeId, null);
}
