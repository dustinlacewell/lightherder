/* Follow mode — the camera side of "Follow host". While the box is
   checked, this peer's bench rides the host's view: the same drill
   level, its own viewport CENTERED on the same flow-space point, at the
   same zoom (the preview-pin side of the flag lives in usePreviewPin).
   The host's camera arrives on its presence (cam: center + zoom); this
   hook applies each fresh one through setViewport. Any viewport move
   that is NOT the steer's own doing — a pane grab, a wheel zoom, a
   minimap pan — is the user striking out on their own, and breaks
   follow: the Bench's onMoveStart asks isSteering(), the checkbox is
   the way back in. (The flag, not the move's source event, is the
   test — a minimap pan reaches the pane as an eventless programmatic
   transform, indistinguishable from ours by the event alone.) */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useReactFlow, useStoreApi } from '@xyflow/react';
import { hostPresence, presenceStore, sessionStore } from '../../session';

/* up for exactly the synchronous d3 dispatch our own transform causes —
   setViewport without a duration fires start/move/end before resolving */
let steering = false;

/** is the in-flight viewport move the follow steer's own? */
export function isSteering(): boolean { return steering; }

export function useFollow(goTo: (ids: string[]) => boolean): void {
  const rf = useReactFlow();
  const store = useStoreApi();
  const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.state);
  const on = session.follow && session.phase === 'live' && session.role === 'peer';
  /* the cam last applied — an unrelated presence bump (a cursor move)
     must not re-apply the viewport it already set */
  const applied = useRef<{ x: number; y: number; z: number; path: string } | null>(null);

  useEffect(() => {
    if (!on) { applied.current = null; return; }
    const steer = (): void => {
      const host = hostPresence();
      const cam = host?.cam;
      if (!host || !cam) return;
      const a = applied.current;
      if (a && a.x === cam.x && a.y === cam.y && a.z === cam.z && a.path === host.path) return;
      /* land on the host's level first — a path we can't resolve (a sync
         race) holds the camera too, and retries on the next announce */
      if (!goTo(host.path ? host.path.split('/') : [])) return;
      applied.current = { ...cam, path: host.path };
      const { width, height } = store.getState();
      steering = true;
      void rf.setViewport({
        x: width / 2 - cam.x * cam.z,
        y: height / 2 - cam.y * cam.z,
        zoom: cam.z,
      }).finally(() => { steering = false; });
    };
    steer();                                  // snap to where the host already is
    return presenceStore.subscribe(steer);    // then track every announce
  }, [on, goTo, rf, store]);
}
