/* The session store — the one place the current session state lives, so
   React (the panel, the read-only cue) and the room wiring read the same
   truth. Same useSyncExternalStore shape as libStore: a state snapshot, a
   monotonic version, a subscribe.

   The state object is replaced wholesale on every change (never mutated
   in place) so `useSyncExternalStore` sees a fresh reference and React
   re-renders — the store's `set` merges a patch over the previous state
   and bumps the version. The room owns the room handle; this store owns
   only what the UI must see. */

import { idleState, type SessionState } from './protocol';
import { selfId } from 'trystero/nostr';

interface SessionStore {
  state(): SessionState;
  version(): number;
  subscribe(fn: () => void): () => void;
  /** merge a partial over the current state, bump the version, notify */
  set(patch: Partial<SessionState>): void;
  /** back to idle — a fresh state carrying only our own id */
  reset(): void;
}

function makeStore(): SessionStore {
  let state = idleState(selfId);
  const subs = new Set<() => void>();
  let ver = 0;

  const notify = () => { for (const fn of subs) fn(); };

  return {
    state: () => state,
    version: () => ver,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    set(patch) {
      state = { ...state, ...patch };
      ver++;
      notify();
    },
    reset() {
      state = idleState(selfId);
      ver++;
      notify();
    },
  };
}

export const sessionStore = makeStore();
