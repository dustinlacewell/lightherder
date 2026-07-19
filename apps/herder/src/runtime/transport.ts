/* The transport's hold-still switch. The engine skips ticks while
   it's down; the UI flips it, and the step-debugger rides it (Step
   freezes first, then advances one frame at a time).

   The setters here are the relay seam: flipping freeze, stepping one
   frame, or blanking every screen are performance acts a session mirrors,
   so each is a runtime function that touches the switch/engine AND emits
   the matching ephemeron. With no session the emit is a no-op, so the
   call sites behave exactly as the bare `transport.frozen = …` did. */

import { emitEph } from './ephemera';
import { engineRef } from './engineRef';

export const transport = { frozen: false };

/** flip the freeze switch and relay it */
export function setFrozen(on: boolean): void {
  transport.frozen = on;
  emitEph({ t: 'frozen', on });
}

/** advance exactly one video frame and relay it (the step-debugger's
    probe — a peer steps in lockstep) */
export function stepOnce(): void {
  engineRef.current?.tickOnce();
  emitEph({ t: 'tick' });
}

/** blank every screen and relay it */
export function clearAllScreens(): void {
  engineRef.current?.clearAll();
  emitEph({ t: 'clearAll' });
}
