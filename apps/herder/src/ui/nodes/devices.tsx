/* The processing and control devices: camera, monitor, mixer, switch,
   dial, XY pad. Video ports amber, control ports teal; the video
   faces are placeholder wells the engine blits the live textures
   over. */

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Slot } from '@ldlework/dials';
import { SlotRow, PanelComponentsProvider } from '@ldlework/dials/react';
import { useStore } from '@xyflow/react';
import { DIAL_VAL_UNI, MIXER_MODES, PARAMS, paramHints, polarityOf, rideValue, SWITCH_INS, XYPAD_X_UNI, XYPAD_Y_UNI, type NodeKind, type ParamDef } from '../../patch';
import { dispatch, holdSwitch, mirror, releaseSwitch, watchTick } from '../../runtime';
import { FX } from '../../fx';
import { ArcGauge, XYPad } from '../controls/Knob';
import { SlotNodeProvider, dialFaceComponents, liveOverrideFor, useNodeWriteRepaint } from '../controls/dialsBundle';
import type { DeviceProps } from '../bench/types';
import { CPort, Face, ResetBtn, Shell, useSetParam, VPort, type FixedPort } from './Shell';
import { FlavorBtn, useFlavorHandles } from './modules';

/* what a reset leaves alone — routing and geometry are yours; only
   the electronics get wiped clean */
const CAM_GEOMETRY = new Set(['rot', 'zoom', 'offx', 'offy']);
const MIXER_KEEP = new Set(['mode']);

const CAM_FIXED: FixedPort[] = [
  { kind: 'v', id: 'v:in', label: 'In', desc: 'what the camera looks at — wire a monitor, mixer, switch or media device here' },
];
const MON_FIXED: FixedPort[] = [
  { kind: 'v', id: 'v:in', label: 'In', desc: 'what this monitor shows' },
];
const MIX_FIXED: FixedPort[] = [
  { kind: 'v', id: 'v:a', label: 'A', desc: 'input A — the base (the loop the keyer protects)' },
  { kind: 'v', id: 'v:b', label: 'B', desc: 'input B — the other pane, or the key fill' },
];

export function CameraNode({ id, data }: DeviceProps) {
  return (
    <Shell
      id={id} data={data} kind="camera" fixed={CAM_FIXED}
      headBtns={
        <ResetBtn
          id={id} kind="camera" keep={CAM_GEOMETRY}
          title="Reset the electronics to a mathematically transparent capture — focus, sharpen, exposure, AGC, profile, fringe, bleed, knee, grain all to identity. Rotation, zoom and off-axis (the map) are left alone."
        />
      }
      face={<Face id={id} sparkable={false} />}
    >
      <VPort dir="out" id="v:out" top={95} desc="the camera's picture" />
    </Shell>
  );
}

export function MonitorNode({ id, data }: DeviceProps) {
  return (
    <Shell
      id={id} data={data} kind="monitor" fixed={MON_FIXED}
      headBtns={
        <ResetBtn
          id={id} kind="monitor"
          title="Reset to a transparent pass — bright, contrast, sat, hue and persistence all back to identity."
        />
      }
      face={<Face id={id} sparkable />}
    >
      <VPort dir="out" id="v:out" top={95} desc="this monitor's face — point a camera at it" />
    </Shell>
  );
}

/* the simple 1-in effects share one shell shape: an input, a face
   well, a knob drawer, an output. The words come off the FX def. */
function makeEffectNode(kind: NodeKind) {
  const m = FX[kind as keyof typeof FX];
  const fixed: FixedPort[] = [{ kind: 'v', id: 'v:in', label: 'In', desc: m.face.inp }];
  return function EffectNode({ id, data }: DeviceProps) {
    return (
      <Shell
        id={id} data={data} kind={kind} fixed={fixed}
        headBtns={<ResetBtn id={id} kind={kind} title={m.face.reset} />}
        face={<Face id={id} sparkable={false} />}
      >
        <VPort dir="out" id="v:out" top={95} desc={m.face.out} />
      </Shell>
    );
  };
}

/* the registry entries React Flow gets — one stable component per kind */
export const effectNodes = Object.fromEntries(
  Object.keys(FX).map(k => [k, makeEffectNode(k as NodeKind)]),
);

export function MixerNode({ id, data }: DeviceProps) {
  const setParam = useSetParam(id);
  const mode = Math.round((data.slots.mode as Slot<number>).dial.value);
  return (
    <Shell
      id={id} data={data} kind="mixer" fixed={MIX_FIXED}
      headBtns={
        <ResetBtn
          id={id} kind="mixer" keep={MIXER_KEEP}
          title="Reset the knobs — key level and the monitor knobs back to their defaults. The mode stays."
        />
      }
      face={<Face id={id} sparkable />}
    >
      <div className="moderow nodrag">
        <select
          className="mselect"
          value={mode}
          title={MIXER_MODES[mode]?.desc}
          onChange={e => setParam('mode', Number(e.target.value))}
        >
          {MIXER_MODES.map((m, i) => (
            <option key={m.name} value={i} title={m.desc}>{m.name}</option>
          ))}
        </select>
      </div>
      <VPort dir="out" id="v:out" top={95} desc="the composite — acts like a monitor face" />
    </Shell>
  );
}

export function SwitchNode({ id, data }: DeviceProps) {
  const setSel = (i: number) => dispatch({ kind: 'setSel', scope: { kind: 'doc', path: [] }, node: id, i });
  const [held, setHeld] = useState<number | null>(null);
  const active = held ?? data.sel;
  const release = (): void => { releaseSwitch(id); setHeld(null); };
  const tops = Array.from({ length: SWITCH_INS }, (_, i) => 59 + i * 32);
  /* one selector, two flavors (the header VID/CTL button, like an IN/OUT):
     a video switch cuts between four pictures (amber ports), a control
     switch selects among four dial signals (teal). The `flavor` is the
     only difference — the routing UI is identical. */
  const flavor = data.flavor ?? 'v';
  const ctl = flavor === 'c';
  const Port = ctl ? CPort : VPort;
  useFlavorHandles(id, flavor);
  return (
    <Shell id={id} data={data} kind="switch" headBtns={<FlavorBtn id={id} flavor={flavor} />}>
      <div className="swcol nodrag">
        {tops.map((_, i) => (
          <button
            key={i}
            className={`swbtn${active === i ? ' lit' : ''}${data.momentary && data.sel === i ? ' home' : ''}`}
            title={data.momentary
              ? 'HOLD to route this input — springs back home on release · right-click to set home'
              : 'click to route this input · right-click to HOLD it — springs back on release'}
            onPointerDown={e => { if (data.momentary || e.button === 2) { holdSwitch(id, i); setHeld(i); } }}
            onPointerUp={release}
            onPointerLeave={() => { if (held !== null) release(); }}
            onClick={() => { if (!data.momentary) setSel(i); }}
            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); if (data.momentary) setSel(i); }}
          >{i + 1}</button>
        ))}
      </div>
      {tops.map((top, i) => (
        <Port key={i} dir="in" id={`${flavor}:in${i + 1}`} top={top} desc={`input ${i + 1}`} />
      ))}
      <Port dir="out" id={`${flavor}:out`} top={107} desc={ctl
        ? 'whichever dial signal is routed — a cut is instant'
        : 'whichever input is routed — a cut is instant'} />
    </Shell>
  );
}

/* the params a dial (or one axis of an XY pad) drives: ride its wire
   forward — through module-boundary IN/OUT devices — to the terminal
   param ports, in the COMPILED graph (view ids are compiled ids, so
   wires landing inside modules count). Only wires off the given output
   handle are followed, so an XY pad's two axes are judged
   independently. The destination set shapes the dial's face: all-
   unipolar flips the knob to 0…+1 (rest at the floor, whole throw
   pushes up), and a SINGLE destination lends the face its units. */
function dialDestinations(id: string, sourceHandle: string): ParamDef[] {
  const byId = new Map(mirror.nodes.map(n => [n.id, n]));
  const seen = new Set<string>([`${id}|${sourceHandle}`]);
  const stack = [{ from: id, handle: sourceHandle }];
  const defs: ParamDef[] = [];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const e of mirror.edges) {
      if (e.source !== cur.from || e.sourceHandle !== cur.handle || !e.targetHandle?.startsWith('c:')) continue;
      const tgt = byId.get(e.target);
      if (!tgt) continue;
      if (tgt.type === 'in' || tgt.type === 'out') {
        const key = `${tgt.id}|c:out`;
        if (!seen.has(key)) { seen.add(key); stack.push({ from: tgt.id, handle: 'c:out' }); }
        continue;
      }
      const def = PARAMS[tgt.type]?.[e.targetHandle.slice(2)];
      if (def) defs.push(def);
    }
  }
  return defs;
}

/** all-unipolar destinations flip the throw; a bipolar port, or an
    idle wire, keeps ±1 */
const allUni = (defs: ParamDef[]): boolean =>
  defs.length > 0 && defs.every(d => polarityOf(d) === 'uni');

/* how deep the val's VISIBLE modulation nests: 0 = bare knob (or the
   sub-panel folded away — slot.folded is the SlotRow's fold state,
   carried on the slot precisely so this walk can see it), +1 per
   expanded level. Each level renders as an indented sub-panel
   (phosphor's .pd-row-nested), so the node widens by one indent per
   visible level and shrinks back when a fold hides the rest. */
function visibleModDepth(slot: Slot<unknown>): number {
  const src = slot.attached;
  if (!src || slot.folded) return 0;
  let deepest = 0;
  for (const k in src.params) {
    deepest = Math.max(deepest, visibleModDepth(src.params[k] as Slot<unknown>));
  }
  return 1 + deepest;
}

const DIAL_BASE_W = 110; // .dev-dial base, matches style.css
/* each nesting level is just an indent: .pd-row-nested adds margin-left
   10 + padding-left 10 + 2px border ≈ 22px; the knobs stay the same
   size, only pushed right. So a level costs one indent, not a panel. */
const DIAL_PER_LEVEL = 22;

/* The dial's val is a full dials SlotRow — the same knob, attach picker,
   modulation tree and MIDI chrome as any drawer param — so a dial is a
   general modulation source: attach an LFO to its val, wire c:out to any
   number of control ports, and the modulated (and glided) output rides
   the wire (StampBank.signalOf reads the slot's lastSample). Only the
   node carries no togglePort: a dial doesn't grow control INPUTS. */
export function DialNode({ id, data }: DeviceProps) {
  const [, repaint] = useReducer((x: number) => x + 1, 0);
  const setParam = useSetParam(id);
  const live = useMemo(() => liveOverrideFor(id), [id]);
  const node = useMemo(() => ({ id }), [id]);
  const val = data.slots.val as Slot<number>;
  /* a MIDI CC (or a remote value) writes the val slot behind React —
     follow it so the knob face animates with what the dial emits */
  useNodeWriteRepaint(id, repaint);
  /* view edges are only the invalidation signal — the walk reads the mirror */
  const edges = useStore(s => s.edges);
  const dests = useMemo(() => dialDestinations(id, 'c:out'), [id, edges]);
  const uni = allUni(dests);
  /* the one param this dial drives, when it drives exactly one — the
     knob face reads out in ITS units (the proxy made visible: the
     number under the knob is the destination's value). A fan-out dial
     keeps the normalized face — it's a macro knob. */
  const solo = dests.length === 1 ? dests[0] : null;
  /* face re-tune lives on the slot's META — the knob face, the MIDI
     CC mapping and the modulation depth scaling all read min/max there,
     so one write retunes all three. Display-plus-travel only: the engine's
     wire combine keys off the TARGET port's polarity, not this. NB: a
     module-inner dial's meta is shared with its sibling clones
     (cloneSlot shares meta by reference) — the re-range follows whichever
     instance is mounted, a display blemish only. A stored bipolar value
     has nowhere to live on a unipolar knob, so it clamps to the floor. */
  useEffect(() => {
    const d = uni ? DIAL_VAL_UNI : PARAMS.dial.val;
    const meta = val.dial.meta;
    const hints = solo ? paramHints(solo) : null;
    meta.min = d.min;
    meta.format = solo && hints
      ? (c: number) => solo.fmt(rideValue(solo.min, solo.max, hints, c))
      : d.fmt;
    meta.description = solo
      ? `${d.desc} Driving ${solo.label} — the readout shows the destination's value.`
      : d.desc;
    repaint();
  }, [uni, solo, val]);
  useEffect(() => {
    if (uni && val.dial.value < 0) setParam('val', 0);
  }, [uni, val, val.dial.value]);
  /* widen the node by the val's VISIBLE modulation depth so the expanded
     tree fits and a fold shrinks the node back; the knob keeps its
     left/right position (the body is left-anchored, growth goes right).
     Recomputed each render — attach/detach AND fold toggles repaint via
     the SlotRow's onChange. */
  const width = DIAL_BASE_W + visibleModDepth(val) * DIAL_PER_LEVEL;
  return (
    <Shell id={id} data={data} kind="dial" style={{ width }}>
      <div className="dialbody dials-strip nodrag">
        <SlotNodeProvider node={node}>
          <PanelComponentsProvider value={dialFaceComponents}>
            {/* the val knob shows glide as its own bar and takes the
                glide gesture (shift+right-drag → the dial's lerp param) */}
            <SlotRow label="val" path={['val']} slot={val} liveOverride={live} onChange={repaint} />
          </PanelComponentsProvider>
        </SlotNodeProvider>
      </div>
      <CPort dir="out" id="c:out" top={80} desc="the control signal — wire it to a camera's rot or zoom port" />
    </Shell>
  );
}

export function XyPadNode({ id, data }: DeviceProps) {
  const [, repaint] = useReducer((x: number) => x + 1, 0);
  const setParam = useSetParam(id);
  const live = useMemo(() => liveOverrideFor(id), [id]);
  const edges = useStore(s => s.edges);
  const uniX = useMemo(() => allUni(dialDestinations(id, 'c:x')), [id, edges]);
  const uniY = useMemo(() => allUni(dialDestinations(id, 'c:y')), [id, edges]);
  useEffect(() => {
    if (uniX && (data.slots.x as Slot<number>).dial.value < 0) setParam('x', 0);
  }, [uniX, (data.slots.x as Slot<number>).dial.value]);
  useEffect(() => {
    if (uniY && (data.slots.y as Slot<number>).dial.value < 0) setParam('y', 0);
  }, [uniY, (data.slots.y as Slot<number>).dial.value]);
  /* the glided OUTPUT each axis puts on its wire — the engine's resolved
     truth (liveOverrideFor rides the mirror clone for a module-inner pad;
     at root it declines and we read the view slot's own lastSample). Poll
     it each frame so the lag puck eases smoothly toward the selection. */
  const slotX = data.slots.x as Slot<number>, slotY = data.slots.y as Slot<number>;
  const outX = live(['x'], slotX)?.() ?? slotX.lastSample ?? slotX.dial.value;
  const outY = live(['y'], slotY)?.() ?? slotY.lastSample ?? slotY.dial.value;
  /* follow the glided output on the engine's tick pulse (the only
     moment it can move), repainting only when it actually does — the
     lag puck eases while a slew is set and goes quiet once the output
     has caught the selection */
  const lastOut = useRef({ x: outX, y: outY });
  useEffect(() => watchTick(() => {
    const nx = live(['x'], slotX)?.() ?? slotX.lastSample ?? slotX.dial.value;
    const ny = live(['y'], slotY)?.() ?? slotY.lastSample ?? slotY.dial.value;
    if (nx !== lastOut.current.x || ny !== lastOut.current.y) {
      lastOut.current = { x: nx, y: ny };
      repaint();
    }
  }), [id, slotX, slotY, live]);
  return (
    <Shell id={id} data={data} kind="xypad">
      <div className="xypadbody">
        <XYPad
          defX={uniX ? XYPAD_X_UNI : PARAMS.xypad.x} x={slotX.dial.value} onX={v => setParam('x', v)} midiX={`${id}:x`}
          defY={uniY ? XYPAD_Y_UNI : PARAMS.xypad.y} y={slotY.dial.value} onY={v => setParam('y', v)} midiY={`${id}:y`}
          outX={outX} outY={outY}
        />
        <div className="xypad-lerps">
          <span className="xypad-lerp"><span className="xypad-lerp-tag">X</span>
            <ArcGauge def={PARAMS.xypad.lerpx} value={(data.slots.lerpx as Slot<number>).dial.value} onChange={v => setParam('lerpx', v)} />
          </span>
          <span className="xypad-lerp"><span className="xypad-lerp-tag">Y</span>
            <ArcGauge def={PARAMS.xypad.lerpy} value={(data.slots.lerpy as Slot<number>).dial.value} onChange={v => setParam('lerpy', v)} />
          </span>
        </div>
      </div>
      <CPort dir="out" id="c:x" top={80} desc="the X control signal — wire it to a camera's port" />
      <CPort dir="out" id="c:y" top={100} desc="the Y control signal — wire it to a camera's port" />
    </Shell>
  );
}
