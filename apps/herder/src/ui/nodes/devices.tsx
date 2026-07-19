/* The processing and control devices: camera, monitor, mixer, switch,
   dial, XY pad. Video ports amber, control ports teal; the video
   faces are placeholder wells the engine blits the live textures
   over. */

import { useEffect, useMemo, useState } from 'react';
import type { Slot } from '@ldlework/dials';
import { useStore } from '@xyflow/react';
import { DIAL_VAL_UNI, MIXER_MODES, PARAMS, polarityOf, SWITCH_INS, XYPAD_X_UNI, XYPAD_Y_UNI } from '../../patch';
import { dispatch, holdSwitch, mirror, releaseSwitch } from '../../runtime';
import { ArcGauge, Knob, XYPad } from '../controls/Knob';
import type { DeviceProps } from '../bench/types';
import { CPort, Face, ResetBtn, Shell, useSetParam, VPort, type FixedPort } from './Shell';

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
          title="Reset to a transparent pass — bright, contrast, sat, hue, delay and persistence all back to identity."
        />
      }
      face={<Face id={id} sparkable />}
    >
      <VPort dir="out" id="v:out" top={95} desc="this monitor's face — point a camera at it" />
    </Shell>
  );
}

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
  return (
    <Shell id={id} data={data} kind="switch">
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
        <VPort key={i} dir="in" id={`v:in${i + 1}`} top={top} desc={`input ${i + 1}`} />
      ))}
      <VPort dir="out" id="v:out" top={107} desc="whichever input is routed — a cut is instant" />
    </Shell>
  );
}

/* which way a dial (or one axis of an XY pad) should throw: ride its
   wire forward — through module-boundary IN/OUT devices — to the
   terminal param ports, in the COMPILED graph (view ids are compiled
   ids, so wires landing inside modules count). All-unipolar
   destinations flip the knob to 0…+1 (rest at the floor, whole throw
   pushes up); any bipolar port, or an idle wire, keeps ±1. Only wires
   off the given output handle are followed, so an XY pad's two axes
   are judged independently. */
function dialPolarity(id: string, sourceHandle: string): 'uni' | 'bi' {
  const byId = new Map(mirror.nodes.map(n => [n.id, n]));
  const seen = new Set<string>([`${id}|${sourceHandle}`]);
  const stack = [{ from: id, handle: sourceHandle }];
  let uni = false;
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
      if (!def) continue;
      if (polarityOf(def) === 'bi') return 'bi';
      uni = true;
    }
  }
  return uni ? 'uni' : 'bi';
}

export function DialNode({ id, data }: DeviceProps) {
  const setParam = useSetParam(id);
  const setLerp = (v: number) => setParam('lerp', v);
  /* view edges are only the invalidation signal — the walk reads the mirror */
  const edges = useStore(s => s.edges);
  const uni = useMemo(() => dialPolarity(id, 'c:out') === 'uni', [id, edges]);
  /* a stored bipolar value has nowhere to live on a unipolar knob */
  useEffect(() => {
    if (uni && (data.slots.val as Slot<number>).dial.value < 0) setParam('val', 0);
  }, [uni, (data.slots.val as Slot<number>).dial.value]);
  return (
    <Shell id={id} data={data} kind="dial">
      <div className="dialbody">
        <Knob
          def={uni ? DIAL_VAL_UNI : PARAMS.dial.val} value={(data.slots.val as Slot<number>).dial.value} onChange={v => setParam('val', v)}
          size={64} midiTarget={`${id}:val`}
          shift={{ def: PARAMS.dial.lerp, value: (data.slots.lerp as Slot<number>).dial.value, onChange: setLerp }}
        />
        <ArcGauge def={PARAMS.dial.lerp} value={(data.slots.lerp as Slot<number>).dial.value} onChange={setLerp} />
      </div>
      <CPort dir="out" id="c:out" top={80} desc="the control signal — wire it to a camera's rot or zoom port" />
    </Shell>
  );
}

export function XyPadNode({ id, data }: DeviceProps) {
  const setParam = useSetParam(id);
  const setLerp = (v: number) => setParam('lerp', v);
  const edges = useStore(s => s.edges);
  const uniX = useMemo(() => dialPolarity(id, 'c:x') === 'uni', [id, edges]);
  const uniY = useMemo(() => dialPolarity(id, 'c:y') === 'uni', [id, edges]);
  useEffect(() => {
    if (uniX && (data.slots.x as Slot<number>).dial.value < 0) setParam('x', 0);
  }, [uniX, (data.slots.x as Slot<number>).dial.value]);
  useEffect(() => {
    if (uniY && (data.slots.y as Slot<number>).dial.value < 0) setParam('y', 0);
  }, [uniY, (data.slots.y as Slot<number>).dial.value]);
  return (
    <Shell id={id} data={data} kind="xypad">
      <div className="xypadbody">
        <XYPad
          defX={uniX ? XYPAD_X_UNI : PARAMS.xypad.x} x={(data.slots.x as Slot<number>).dial.value} onX={v => setParam('x', v)} midiX={`${id}:x`}
          defY={uniY ? XYPAD_Y_UNI : PARAMS.xypad.y} y={(data.slots.y as Slot<number>).dial.value} onY={v => setParam('y', v)} midiY={`${id}:y`}
        />
        <ArcGauge def={PARAMS.xypad.lerp} value={(data.slots.lerp as Slot<number>).dial.value} onChange={setLerp} />
      </div>
      <CPort dir="out" id="c:x" top={80} desc="the X control signal — wire it to a camera's port" />
      <CPort dir="out" id="c:y" top={100} desc="the Y control signal — wire it to a camera's port" />
    </Shell>
  );
}
