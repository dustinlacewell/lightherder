/* Which screen the preview monitor shows. It pins the last selected
   face-bearing node and holds it through deselection — it only lets
   go when the node dies or another screen is picked. Its settings
   (width, lock, pin) persist apart from the patch; restoring the pin
   is what lets the lock hold across a reload. */

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { PatchNode, SubPatch } from '../../patch';
import { loadPreviewPrefs, savePreviewPrefs } from '../../persist';
import { emitEph, stage } from '../../runtime';
import { sessionStore } from '../../session';
import type { BenchNode } from '../bench/types';

import { FX_KINDS } from '../../fx';

/* the kinds with a face the preview monitor can mirror */
const FACED = new Set<string>(['camera', 'monitor', 'mixer', 'delay', 'media', 'draw', 'webcam', ...FX_KINDS]);

export interface PreviewPin {
  /** the node whose face the preview mirrors right now, if any */
  shown: PatchNode | null;
  locked: boolean;
  setLocked: (l: boolean) => void;
  w: number;
  setW: (w: number | ((w: number) => number)) => void;
}

export function usePreviewPin(nodes: BenchNode[], flat: SubPatch): PreviewPin {
  const selected = nodes.filter(n => n.selected && FACED.has(n.type ?? '')).at(-1) ?? null;

  const [prefs] = useState(loadPreviewPrefs);
  const [pinnedId, setPinnedId] = useState<string | null>(prefs.pinnedId);
  const [locked, setLocked] = useState(prefs.locked);
  const [w, setW] = useState(prefs.w);
  useEffect(() => { savePreviewPrefs({ w, locked, pinnedId }); }, [w, locked, pinnedId]);

  const selectedId = selected?.id;
  useEffect(() => { if (selectedId && !locked) setPinnedId(selectedId); }, [selectedId, locked]);

  /* the LOCAL intent — lock wins, else the last selected face, else the
     held pin. This is what the host relays and what a non-following peer
     shows; a following peer overrides it below. */
  const localId = locked ? pinnedId : (selectedId ?? pinnedId);

  /* follow (H7, default OFF): a peer with follow on mirrors the host's pin
     — but only when that pin names a node that EXISTS locally (a race, or a
     host pin inside a module the peer's graph differs on, falls back to the
     local pin rather than blanking the monitor). Lock still wins locally,
     and turning follow off is the escape hatch back to the local pin. */
  const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.state);
  const remoteResolves = session.remotePin != null
    && flat.nodes.some(n => n.id === session.remotePin && FACED.has(n.type ?? ''));
  const following = session.follow && !locked && remoteResolves;
  const shownId = following ? session.remotePin : localId;

  /* resolve the pin against the COMPILED graph, not the current view —
     a preview pinned at one level must survive drilling into (or out
     of) a module; compiled ids are the view ids, so the pin matches at
     any depth and only dies when the node truly leaves the bench */
  const shown = (shownId && flat.nodes.find(n => n.id === shownId && FACED.has(n.type))) || null;
  useEffect(() => { if (locked && !shown) setLocked(false); }, [locked, shown]);
  stage.preview.nodeId = shown ? shown.id : null;

  /* relay the LOCAL pin (not the followed one) so a following peer mirrors
     what the host is watching, and a follower doesn't echo the host's pin
     back — a no-op with no session */
  useEffect(() => { emitEph({ t: 'pin', id: localId ?? null }); }, [localId]);

  return { shown, locked, setLocked, w, setW };
}
