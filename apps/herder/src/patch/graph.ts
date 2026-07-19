/* The patch — devices wired on an infinite bench.

   Seven device kinds:
     MEDIA   — boots with stained glass, takes a dropped image/video.
               A way a picture gets INTO a loop.
     DRAW    — a hand-painted source: stroke its face with the hue and
               size sliders; the picture persists like dropped media.
     CAMERA  — looks at whatever its video input is wired to, warps the
               view by its rotation/zoom (knobs + control ports), then
               applies the whole physical camera: focus, sharpen,
               exposure + AGC, picture profile, fringe, bleed, knee,
               grain. Every feedback loop closes through a camera.
     MONITOR — shows its video input through the four analog knobs
               (bright/contrast/sat/hue) at its Delay (converter frames).
               A camera pointed at a monitor is the classic loop.
     MIXER   — takes two video inputs and acts like a monitor: MIX is
               the 50/50 beamsplitter glass, KEY lumakeys B over A (the
               Roland keyer — "keying does electronically what the glass
               does optically").
     SWITCH  — routes one of four video inputs to its output. Latching
               clicks; the momentary flavor springs back to its home
               position on release. A cut is instant (no frame cost).
     DIAL    — a control-signal source (−1…+1). Wire it to a camera's
               rotation or zoom port to work that axis by hand.
               Shift-drag the knob to work its Lerp — the glide time
               the signal takes chasing the knob (the little teal arc
               beside it shows it; 0 = wired direct).
     XYPAD   — two control signals (−1…+1 each) off one puck — X and Y
               wire independently, so one drag can work two ports at
               once (a camera's OFFX and OFFY, say). Shares a single
               Lerp between both axes.
     IN/OUT  — port definitions: placed INSIDE a patch, they declare
               the interface it presents when used as a module. An IN
               is where an outside signal lands; an OUT is what the
               module emits. Each is video- or control-flavored; the
               device's name is the port's label.
     MODULE  — a patch used as a device: a by-value copy of a library
               entry, its ports derived from the IN/OUT devices
               inside. Compile dissolves it (see compile.ts), so
               the boundary costs zero frames.

   Signal kinds are in the handle ids: "v:*" video, "c:*" control.
   Wires only connect like to like. A video input takes one wire; a
   control input fans in — several dials may share a port, and the one
   whose knob moved most recently drives it (last write wins). Every
   video hop through a device costs at least one video frame (the
   engine's rings); a lap around a loop is the sum of its hops — that
   slowness is the phenomenon.

   The node and edge shapes here are the DOCUMENT's own — structurally
   compatible with React Flow's (the editor uses them directly) but
   owing it nothing, so a headless client can hold a patch without
   pulling in an editor. */

import type { Dials } from '@ldlework/dials';
import { slotsFor } from './params';
import type { InstVals } from './library';

export type NodeKind = 'media' | 'draw' | 'camera' | 'monitor' | 'mixer' | 'switch' | 'dial' | 'xypad' | 'in' | 'out' | 'module';

/** one level of the patch tree — a module's inside is one of these */
export interface SubPatch { nodes: PatchNode[]; edges: PatchEdge[] }

export interface NodeData extends Record<string, unknown> {
  name: string;
  /** the live dials slot tree — one Slot per param, each modulatable
      (base + depth·signal) to arbitrary depth. Aliased by reference into
      the compiled mirror exactly as `v` was, so an op's in-place slot
      mutation reaches the engine same-tick with no recompile. Converts
      to/from `DialsSnap` only at the JSON edges. */
  slots: Dials;
  sel: number;          // switch: latched (home) input, 0-based
  momentary: boolean;   // switch flavor: spring-return
  open: boolean;        // knob drawer visible
  flavor?: 'v' | 'c';   // in/out: the signal kind of the port it defines
  patch?: SubPatch;     // module: the embedded patch (transition only — a
                        //   ref replaces it; deleted in C5)
  ref?: string;         // module: the library entry this instance references
  vals?: Record<string, InstVals>;  // module: per-instance values, keyed by
                        //   the prototype node's path relative to the
                        //   instance ('n5', 'n5/n2' through a nested ref)
  ports?: string[];     // param keys exposed as control ports (per instance)
  labels?: boolean;     // the port-label rail visible (default true)
  mediaKey?: string;    // media: the blob key compile stamps on it (the
                        //   entry default or an instance override) — set on
                        //   the COMPILED node only, never stored
}

export interface PatchNode {
  id: string;
  type: NodeKind;
  position: { x: number; y: number };
  data: NodeData;
}

export interface PatchEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

/** the whole bench: one graph tree plus the transport globals.
    `globals` is a slot tree like every node's — video/res carry no
    modulation (decision), but the read model is uniform: the engine
    pulls a global's value off its slot, never a raw number map. */
export interface Patch {
  nodes: PatchNode[];
  edges: PatchEdge[];
  globals: Dials;
}

/* ---- ports ------------------------------------------------------------ */

export const SWITCH_INS = 4;

/** the signal kind a handle id carries */
export const handleKind = (h: string | null | undefined): 'v' | 'c' | null =>
  h?.startsWith('v:') ? 'v' : h?.startsWith('c:') ? 'c' : null;

export function validConnection(sourceHandle: string | null | undefined, targetHandle: string | null | undefined): boolean {
  const a = handleKind(sourceHandle), b = handleKind(targetHandle);
  return a !== null && a === b;
}

/* ---- the module interface ---------------------------------------------- */

export interface ModulePort { handle: string; name: string; kind: 'v' | 'c'; dir: 'in' | 'out' }

/** the ports a module presents, derived from the IN/OUT devices inside
    its patch — ordered by their vertical position on the inner bench.
    A port's handle names the device behind it ("v:n5"), so the compile
    pass can splice the boundary. */
export function moduleInterface(patch: SubPatch | undefined): ModulePort[] {
  if (!patch) return [];
  return patch.nodes
    .filter(n => n.type === 'in' || n.type === 'out')
    .sort((a, b) => a.position.y - b.position.y)
    .map(n => {
      const kind = n.data.flavor ?? 'v';
      return { handle: `${kind}:${n.id}`, name: n.data.name, kind, dir: n.type === 'in' ? 'in' as const : 'out' as const };
    });
}

/** every media device at ONE level of a patch, by local id — a module is
    a reference now, so its inner media belongs to the entry it names, not
    to this level. compile stamps each media node's effective blob key
    (mediaKey); this flat filter is just the level's own media. */
export function mediaPaths(patch: SubPatch): string[] {
  return patch.nodes.filter(n => n.type === 'media').map(n => n.id);
}

/* ---- construction ------------------------------------------------------ */

const KIND_LABEL: Record<NodeKind, string> = {
  media: 'MEDIA', draw: 'DRAW', camera: 'CAM', monitor: 'MON', mixer: 'MIX', switch: 'SW', dial: 'DIAL', xypad: 'XY',
  in: 'IN', out: 'OUT', module: 'MOD',
};

function nextId(nodes: PatchNode[]): string {
  let max = 0;
  for (const n of nodes) {
    const m = /^n(\d+)$/.exec(n.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `n${max + 1}`;
}

export interface MakeOpts { momentary?: boolean; flavor?: 'v' | 'c' }

export function makeNode(kind: NodeKind, x: number, y: number, existing: PatchNode[], opts: MakeOpts = {}): PatchNode {
  const momentary = opts.momentary ?? false;
  const count = existing.filter(n => n.type === kind && n.data.momentary === momentary).length;
  const label = kind === 'switch' && momentary ? 'MOM' : KIND_LABEL[kind];
  return {
    id: nextId(existing),
    type: kind,
    position: { x, y },
    data: {
      name: `${label} ${count + 1}`,
      slots: slotsFor(kind),
      sel: 0,
      momentary,
      open: false,
      ...(kind === 'in' || kind === 'out' ? { flavor: opts.flavor ?? 'v' } : {}),
      /* a module is nothing but a reference — the caller mints or names
         its entry and sets `ref`; no embedded patch is initialized */
      /* a camera boots with the rig's classic handle ports exposed;
         everything else starts clean — shift-right-click a knob */
      ports: kind === 'camera' ? ['rot', 'zoom', 'offx', 'offy'] : [],
      labels: true,
    },
  };
}

export function makeEdge(source: string, sourceHandle: string, target: string, targetHandle: string): PatchEdge {
  return {
    id: `e ${source}.${sourceHandle} > ${target}.${targetHandle}`,
    source, sourceHandle, target, targetHandle,
  };
}
