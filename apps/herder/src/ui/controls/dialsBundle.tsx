/* Herder's dials wiring — how a device's drawer becomes a strip of
   @ldlework/dials `SlotRow`s without herder reimplementing the recursion,
   the attach picker, or the knob.

   Three seams the dials packages grew in Phase 1, filled here:

     · COMPONENTS — the phosphor knob-faced bundle (44px knob), plus
       herder's `SlotChrome` (MIDI dots + context menu + port toggle),
       provided ONCE at the bench root: pure visuals, no per-node state.

     · ACTIONS — the mediated-mutation contract. Dials' Panel mutates
       slots directly; herder must route every mutation through the op
       dispatcher so the session gate, the wire, and persistence all see
       it. The applier does the real slot mutation (in place, aliased
       into the mirror) — these handlers only translate a (path, slot)
       into the op that names it. Bound to a node id, so provided
       PER-NODE (in Shell), not at the root.

     · LIVE OVERRIDE — a control-port wire's engine-side value. The slot's
       own `lastSample` already carries its modulation; the override adds
       the wire ride on top, read off `runtime/live.ts` under the same
       "nodeId:param" key the engine publishes to. A SlotRow prop, so it
       closes over the node id directly in Shell — no context needed. */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Slot } from '@ldlework/dials';
import {
  SlotActionsProvider, type LiveOverride, type SlotActions,
} from '@ldlework/dials/react';
import { makeDialPanelComponents } from '@ldlework/phosphor-dials';
import { dispatch, liveValue } from '../../runtime';
import { SlotChrome } from './SlotChrome';

/* the level-local op target: the shell holds the compiled view id, and
   the bench applier resolves the scope from it (mirrors Shell's `at`) */
const at = (): { kind: 'doc'; path: string[] } => ({ kind: 'doc', path: [] });

/* a slot path is a "/"-joined key ("zoom" | "zoom/freq") — the same
   shape ops.ts and midi/targets.ts speak */
const keyOf = (path: string[]): string => path.join('/');

/* ---- what each drawer SlotRow needs to know about its node ------------- */

/** the node a strip of SlotRows belongs to — the port state a root-slot
    row's chrome needs, threaded down so `SlotChrome` can render (and
    toggle) the control-port dot without every row carrying props. */
export interface SlotNode {
  id: string;
  /** the drawer keys currently exposed as control ports (root only) */
  exposed: string[];
  togglePort: (key: string) => void;
}

const SlotNodeContext = createContext<SlotNode | null>(null);

export function SlotNodeProvider({ node, children }: { node: SlotNode; children: ReactNode }) {
  const actions = useMemo<Partial<SlotActions>>(() => herderActions(node.id), [node.id]);
  return (
    <SlotNodeContext.Provider value={node}>
      <SlotActionsProvider value={fullActions(actions)}>
        {children}
      </SlotActionsProvider>
    </SlotNodeContext.Provider>
  );
}

/** the node a `SlotChrome` is wrapping a control for — null outside a
    device strip (defensive; chrome only mounts under a provider) */
export function useSlotNode(): SlotNode | null {
  return useContext(SlotNodeContext);
}

/* ---- actions: SlotActions -> dispatched ops ---------------------------- */

/* every slot mutation the Panel would make directly becomes the op that
   names it; the applier performs the real dials mutation on the live
   tree (aliased into the mirror, so the engine feels it same-tick).
   `setLerp` is a no-op: a device drawer param has no glide story (its
   slot carries no meta.lerp, so phosphor never renders the control) —
   only dial/xypad axes glide, and those stay bespoke widgets. */
function herderActions(id: string): Partial<SlotActions> {
  return {
    setValue: (path, _slot, v) =>
      dispatch({ kind: 'setParam', scope: at(), node: id, key: keyOf(path), v: v as number }),
    attach: (path, _slot, source) =>
      dispatch({ kind: 'slotAttach', scope: at(), node: id, key: keyOf(path), source }),
    setDepth: (path, _slot, depth) =>
      dispatch({ kind: 'slotDepth', scope: at(), node: id, key: keyOf(path), depth }),
    setMode: (path, _slot, mode) =>
      dispatch({ kind: 'slotMode', scope: at(), node: id, key: keyOf(path), mode }),
    setLerp: () => {},
  };
}

/* Panel merges Partial<SlotActions> over its defaults; herder provides
   the provider itself (per node), so fill the gaps with no-ops rather
   than dials' direct-mutation defaults — herder must NEVER mutate a slot
   outside the applier. */
function fullActions(a: Partial<SlotActions>): SlotActions {
  const noop = () => {};
  return {
    setValue: a.setValue ?? noop,
    attach: a.attach ?? noop,
    setDepth: a.setDepth ?? noop,
    setMode: a.setMode ?? noop,
    setLerp: a.setLerp ?? noop,
  };
}

/* ---- live override: the control-port wire's engine truth --------------- */

/** a SlotRow's live accessor for a given node: an accessor of the
    wire-ridden value the engine published, but ONLY while a wire is
    actually riding the param — a live entry EXISTS in `runtime/live.ts`
    (presence is the signal). When nothing rides, decline (return
    undefined) so the SlotRow falls back to the slot's own `lastSample`
    and its knob doesn't paint the perpetual teal ride state. Root params
    only carry a wire — a sub-slot's path never resolves a live key, so
    it always declines and shows its modulation stash.

    Gating on presence at resolve time means the drawer must re-render
    when a wire starts or stops riding; `Drawer` subscribes each param to
    `watchLive` for exactly that. */
export function liveOverrideFor(id: string): LiveOverride {
  return (path: string[], _slot: Slot<unknown>) => {
    const target = `${id}:${keyOf(path)}`;
    return liveValue(target) === undefined ? undefined : () => liveValue(target);
  };
}

/* ---- the root bundle: phosphor visuals + herder chrome ----------------- */

/** the components every device strip renders through — provided once at
    the bench root (Bench.tsx). Static: no node identity, no ops. */
export const herderPanelComponents = {
  ...makeDialPanelComponents({ knobSize: 44, caption: 'below' }),
  SlotChrome,
};
