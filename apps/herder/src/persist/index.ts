/* Persistence adapters — everything that outlives a reload lives
   behind this surface: the patch (localStorage), the library shelf
   (localStorage), media blobs (IndexedDB), and UI prefs. Callers never
   touch a storage API directly. */

export { savePatch, loadPatch } from './patchStore';
export { storeMedia, loadStoredMedia, copyStoredMedia, dropStoredMediaUnder, listStoredMedia } from './mediaStore';
export { libStore, saveLibraryNow, reloadLibrary, dropEntryMedia, type LibEntry } from './libraryStore';
export {
  stashDocs, restoreDocs, hasStash, dropStash,
  stashMedia, restoreMedia,
} from './sessionStash';
export { backupPremigration, migrateEmbedded } from './migrate';
export { loadPreviewPrefs, savePreviewPrefs, type PreviewPrefs } from './prefs';
