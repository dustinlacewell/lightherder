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

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { Slot } from '@ldlework/dials';
import {
  SlotActionsProvider, type LiveOverride, type SlotActions,
} from '@ldlework/dials/react';
import { makeDialPanelComponents } from '@ldlework/phosphor-dials';
import { libHead, resolveSlot } from '../../patch';
import { dispatch, dispatchParam, liveValue, mirror, watchNodeWrites } from '../../runtime';
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
    toggle) the control-port dot without every row carrying props.
    `exposed`/`togglePort` are absent on a node whose slots are not
    port-exposable (a dial — it IS a control source, it doesn't grow
    control inputs); the chrome then offers no port affordance. */
export interface SlotNode {
  id: string;
  /** the drawer keys currently exposed as control ports (root only) */
  exposed?: string[];
  togglePort?: (key: string) => void;
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
   The glide gesture (shift+right-drag) sets a dial's `lerp` param; a
   drawer param never glides, so its knob carries no glide gesture at all
   (the Panel only passes onGlide for a `meta.glidable` slot) — the bar
   under the knob just DISPLAYS the amount.

   Doc-level drawer gestures ride the SILENT route, exactly as a MIDI CC
   does: the op writes the tree in place (aliased into the mirror at the
   root, writeParam under a ref) and the SlotRow repaints itself via
   onChange — no React Flow render, no write-back, no recompile per
   pointermove. A shelf-entered entry view (a lib-rooted id) keeps the
   RF route instead: its render-time write-back owns the entry
   persistence (entryDirty → libStore.touch, own-bump accounted), where
   a silent entry write would version-bump the library on every move and
   reproject the whole view. */
function herderActions(id: string): Partial<SlotActions> {
  const opts = { silent: libHead(id.split('/')[0]) === null };
  return {
    /* routed through the wire proxy: while a dial drives this param the
       edit belongs to the dial (the engine bypasses the base cell) —
       dispatchParam inverse-maps and lands it there */
    setValue: (path, slot, v) =>
      dispatchParam(id, keyOf(path), slot, v as number, opts),
    attach: (path, _slot, source) =>
      dispatch({ kind: 'slotAttach', scope: at(), node: id, key: keyOf(path), source }, opts),
    setDepth: (path, _slot, depth) =>
      dispatch({ kind: 'slotDepth', scope: at(), node: id, key: keyOf(path), depth }, opts),
    setMode: (path, _slot, mode) =>
      dispatch({ kind: 'slotMode', scope: at(), node: id, key: keyOf(path), mode }, opts),
    /* glide gesture (shift+right-drag on the val knob). herder stores a
       dial's glide as its sibling `lerp` PARAM, which StampBank mirrors
       onto the val slot's `glide` state — so the gesture writes that
       param, not the slot directly. Only the dial's val is glidable
       (meta.glidable via PARAMS), so this only ever fires there. */
    setGlide: (_path, _slot, seconds) =>
      dispatch({ kind: 'setParam', scope: at(), node: id, key: 'lerp', v: seconds }, opts),
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
    setGlide: a.setGlide ?? noop,
  };
}

/* ---- following writes that land behind React --------------------------- */

/** repaint a node's knob strip whenever a silent op writes its values in
    place (a MIDI CC, a remote peer's value) — the SlotRows read their
    slots at render, so one repaint fans every knob's re-read. Coalesced
    to one repaint per frame: a CC burst outruns the paint rate. */
export function useNodeWriteRepaint(id: string, repaint: () => void): void {
  useEffect(() => {
    let raf = 0;
    const off = watchNodeWrites(id, () => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; repaint(); });
    });
    return () => { off(); if (raf) cancelAnimationFrame(raf); };
  }, [id, repaint]);
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
    `watchLive` for exactly that.

    THE MODULE CASE. The engine samples the MIRROR node's slot tree and
    writes `lastSample` there. At the root level the drawer's slot IS the
    mirror slot (compile shares it by reference), so the SlotRow's own
    `lastSample` stash animates for free. Inside a ref instance, though,
    the drilled VIEW clones its own slot tree (drill's `mergeInto`) and
    the mirror clones its own (compile's `mergedNode`) — two independent
    clones. The engine only ever samples the mirror's, so the view slot's
    `lastSample` stays undefined and a modulated knob looks frozen. So
    when the view slot is NOT the mirror slot, ride the mirror slot's
    `lastSample` — the engine truth for this compiled id + path. */
export function liveOverrideFor(id: string): LiveOverride {
  return (path: string[], viewSlot: Slot<unknown>) => {
    const target = `${id}:${keyOf(path)}`;
    /* a control-port wire's engine value wins when one rides */
    if (liveValue(target) !== undefined) return () => liveValue(target);
    /* module case: the view slot is a clone, so the engine never wrote
       its lastSample — ride the mirror clone's instead. The mirror node
       is REPLACED by every structural recompile (fresh clones), while
       this accessor lives as long as the rendered row, so re-resolve
       whenever mirror.nodes has moved — or the knob would keep riding an
       orphaned clone and freeze. O(1) while the mirror is stable. */
    const m = mirror.nodes.find(n => n.id === id);
    let mirrorSlot = m ? resolveSlot(m.data.slots, keyOf(path)) : null;
    if (mirrorSlot && mirrorSlot !== viewSlot) {
      let compiled = mirror.nodes;
      return () => {
        if (mirror.nodes !== compiled) {
          compiled = mirror.nodes;
          const m2 = compiled.find(n => n.id === id);
          mirrorSlot = m2 ? resolveSlot(m2.data.slots, keyOf(path)) : null;
        }
        return mirrorSlot?.lastSample as number | undefined;
      };
    }
    /* root case: view slot IS the mirror slot — the SlotRow's own
       lastSample stash already animates, so decline */
    return undefined;
  };
}

/* ---- the root bundle: phosphor visuals + herder chrome ----------------- */

/* glide seconds that read as a full glide bar — herder's dial/xypad lerp
   param tops out at 3s (PARAMS.dial.lerp.max), so a fully-glided dial
   fills the bar. An app setting later. */
const GLIDE_MAX = 3;

/** the components every device strip renders through — provided once at
    the bench root (Bench.tsx). Static: no node identity, no ops. */
export const herderPanelComponents = {
  ...makeDialPanelComponents({ knobSize: 44, caption: 'below', glideMax: GLIDE_MAX }),
  SlotChrome,
};

/** the bundle for a slot that IS a node's face (the dial's val) — the
    same chrome at the bespoke knob's 64px, provided locally over the
    bench bundle where such a control renders. The dial's glide shows as
    the knob's own glide bar (the engine mirrors the dial's `lerp` param
    onto the val slot's `glide` state every tick — StampBank.step),
    edited by shift+right-drag on the knob. */
export const dialFaceComponents = {
  ...makeDialPanelComponents({ knobSize: 64, caption: 'below', glideMax: GLIDE_MAX }),
  SlotChrome,
};
