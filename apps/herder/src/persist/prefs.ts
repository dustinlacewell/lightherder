/* The preview monitor's UI settings — its width, whether it's locked,
   and which screen it's pinned to — survive a reload in their own
   localStorage entry, apart from the patch. Read once at boot, written
   whenever they change. Pinning the node id is what lets the lock hold:
   without a screen to show on the first render, the monitor would let go. */

const KEY = 'herder:preview';

/* the resize grip clamps width to this range; keep the two in sync */
const MIN_W = 180;
const MAX_W = 760;

export type PreviewPrefs = { w: number; locked: boolean; pinnedId: string | null };

const DEFAULTS: PreviewPrefs = { w: 300, locked: false, pinnedId: null };

export function loadPreviewPrefs(): PreviewPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<PreviewPrefs>;
    const w = typeof p.w === 'number' && isFinite(p.w) ? Math.min(MAX_W, Math.max(MIN_W, p.w)) : DEFAULTS.w;
    return { w, locked: p.locked === true, pinnedId: typeof p.pinnedId === 'string' ? p.pinnedId : null };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePreviewPrefs(p: PreviewPrefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage full / denied */ }
}
