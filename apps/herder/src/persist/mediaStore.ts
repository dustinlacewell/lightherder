/* Where a media device's dropped file survives a reload. localStorage
   can't hold a video blob (string-only, ~5MB); IndexedDB can — one
   object store, keyed by the media node's id, holding the raw Blob
   plus its MIME type. */

const DB_NAME = 'herder-media';
const STORE = 'files';
/* v2: v1 briefly shipped with a store named 'blobs'; against such a DB,
   open(name, 1) succeeds without upgrading and every 'files' transaction
   throws NotFoundError — silently, into the catch-alls below. The bump
   forces one upgrade that drops the dead store and creates the real one. */
const VERSION = 2;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (db.objectStoreNames.contains('blobs')) db.deleteObjectStore('blobs');
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function storeMedia(nodeId: string, file: Blob): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ type: file.type, blob: file }, nodeId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadStoredMedia(nodeId: string): Promise<File | null> {
  try {
    const db = await openDB();
    const rec = await new Promise<{ type: string; blob: Blob } | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(nodeId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!rec) return null;
    return new File([rec.blob], nodeId, { type: rec.type });
  } catch {
    return null;
  }
}

/** drop the blob at exactly `nodeId` — the single-key twin of
    dropStoredMediaUnder, used when a media device switches from a
    dropped file to a remote URL (the two are mutually exclusive, so
    the stale blob shouldn't linger and win the boot-time race). */
export async function dropStoredMedia(nodeId: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(nodeId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* nothing to clean up, or storage unavailable */ }
}

/** copy one stored blob to a new key — how a library snapshot or a
    module instance takes its own copy of a picture. A missing source
    is a quiet no-op (the media device is still on its stained glass). */
export async function copyStoredMedia(fromKey: string, toKey: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.get(fromKey);
      req.onsuccess = () => { if (req.result) store.put(req.result, toKey); };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* storage unavailable — the copy just doesn't persist */ }
}

/** every stored key at or under `prefix` — the range-scan twin of
    dropStoredMediaUnder, reading the keys instead of deleting them. The
    session-stash restore uses it to enumerate the `stash/…` shadows
    directly from IndexedDB rather than recomputing them from a document
    whose library may have already shifted: whatever stashMedia wrote is
    exactly what the scan returns, robust against any library state. The
    same bounded range as the drop (`prefix` itself, plus `prefix/…` up to
    the 0xffff sentinel) so the two stay in lockstep. */
export async function listStoredMedia(prefix: string): Promise<string[]> {
  try {
    const db = await openDB();
    const keys = await new Promise<string[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const out: string[] = [];
      const exact = store.getKey(prefix);
      exact.onsuccess = () => { if (exact.result !== undefined) out.push(String(exact.result)); };
      const req = store.getAllKeys(IDBKeyRange.bound(prefix + '/', prefix + '/' + String.fromCharCode(0xffff)));
      req.onsuccess = () => { for (const k of req.result) out.push(String(k)); resolve(out); };
      req.onerror = () => reject(req.error);
    });
    db.close();
    return keys;
  } catch { return []; }
}

/** drop the blob at `base` and every blob under `base/…` — a module
    instance or library entry taking its nested media with it */
export async function dropStoredMediaUnder(base: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.delete(base);
      store.delete(IDBKeyRange.bound(base + '/', base + '/' + String.fromCharCode(0xffff)));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* nothing to clean up, or storage unavailable */ }
}
