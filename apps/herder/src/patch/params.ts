/* The knobs — every parameter a device (or the transport) carries:
   its range, default, formatting, and how a control signal rides it.
   Pure data; the engine resolves effective values, the UI draws them. */

import { dial, type Dials, type Slot } from '@ldlework/dials';
import type { NodeKind } from './graph';

export interface ParamDef {
  label: string;
  min: number;
  max: number;
  def: number;
  step?: number;
  fmt: (v: number) => string;
  desc: string;
  /** angle-like: a control signal adds without clamping (it wraps) */
  periodic?: boolean;
  /** control-extended clamp bounds, where a riding signal may push a
      param beyond its knob range (zoom's deliberate stretch) */
  cmin?: number;
  cmax?: number;
  /** control polarity override — otherwise inferred from the shape */
  polarity?: 'uni' | 'bi';
}

/* uni: the param rests at its floor (def === min), so a control signal
   only meaningfully pushes up — a dial driving one re-ranges to 0…+1
   and its signal spans the FULL param range. bi: everything else —
   the signal rides ± half the range around the knob. Either way a full
   twist of the dial covers the whole param. */
export const polarityOf = (def: ParamDef): 'uni' | 'bi' =>
  def.polarity ?? (def.def === def.min ? 'uni' : 'bi');

const RAD = Math.PI / 180;
const fdeg = (v: number) => (v / RAD).toFixed(0) + '°';
const fmul = (v: number) => '×' + v.toFixed(3);
const fpx = (v: number) => v.toFixed(2) + 'px';
const f4 = (v: number) => v.toFixed(4);
const f3 = (v: number) => v.toFixed(3);
const f2 = (v: number) => v.toFixed(2);
const fsig = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(3);
const fint = (v: number) => String(Math.round(v));
const fhz = (v: number) => v.toFixed(0) + '/s';
const fsec = (v: number) => v.toFixed(2) + 's';

export const RES_STEPS: [number, number][] =
  [[960, 540], [1280, 720], [1920, 1080], [2560, 1440], [3840, 2160]];
export const RES_LABELS = ['540p', '720p', '1080p', '1440p', '4K'];

const MONITOR_PARAMS: Record<string, ParamDef> = {
  bright:   { label: 'Bright',   min: -0.25, max: 0.25, def: 0, fmt: fsig, desc: 'Brightness — adds/subtracts light every pass. Additive loop gain: up and the image blooms brighter each iteration, down and it fades toward black.' },
  contrast: { label: 'Contrast', min: 0.60, max: 2.20, def: 1.0, fmt: f3, desc: 'Contrast about mid-gray. The loop-gain knob: above ~1 the feedback stays expansive and keeps evolving, below it the loop contracts and settles. ×1 = untouched.' },
  sat:      { label: 'Sat',      min: 0, max: 2, def: 1.0, fmt: f2, desc: 'Color saturation. ×1 leaves color alone; below 1 drains toward gray, above 1 pumps the hue drift the loop accumulates.' },
  hue:      { label: 'Hue',      min: 0, max: 2 * Math.PI, def: 0, fmt: fdeg, periodic: true, desc: 'Hue rotation, applied every pass. A nonzero angle sends color cycling around the wheel each lap — the traveling rainbow. 0° = no shift. Rest-at-zero, so a dial on the HUE port re-ranges to 0…+1 and its full throw sweeps the whole wheel.' },
  delay:    { label: 'Delay',    min: 0, max: 5, def: 0, step: 1, fmt: fint, desc: 'Frames of buffering in this device’s path. 0 = an analog wire — a CRT scans the signal out as it arrives, so this device adds NO frame to the lap (the camera still charges its one; a camera-less 0-delay cycle falls back to 1). 1 = one digital hop; each extra frame is a converter box — it stretches the LAP, so stepped copies land farther apart. Shorter laps mean fewer slots cycling independently — delay 0 kills the alternating-frame strobe.' },
  persist:  { label: 'Persist',  min: 0, max: 0.9, def: 0, fmt: f2, desc: 'Phosphor persistence — how much of last frame this screen holds onto. The trails. 0 = instant.' },
};

const CAMERA_PARAMS: Record<string, ParamDef> = {
  rot:      { label: 'Rotate',   min: -Math.PI, max: Math.PI, def: 0, fmt: fdeg, periodic: true, desc: 'This camera’s rotation off its subject — how much it turns the view before it re-enters the loop. Nonzero makes the image spiral more each lap. A dial wired to the ROT port adds ±180° on top.' },
  zoom:     { label: 'Zoom',     min: 0.30, max: 1.60, def: 1.0, fmt: fmul, cmin: 0.1, cmax: 2.0, desc: 'How much of the frame the subject fills. Below 1 the recursion is VISIBLE — a screen inside the screen; near 1 the copies merge into abstraction. The money knob. A dial on the ZOOM port rides it.' },
  offx:     { label: 'Off-X',    min: -0.25, max: 0.25, def: 0, fmt: f2, desc: 'Mount misalignment, horizontal — lens off the subject’s axis. A slight offset turns centered spirals into off-axis drift. A dial wired to the OFFX port rides it ±0.25.' },
  offy:     { label: 'Off-Y',    min: -0.25, max: 0.25, def: 0, fmt: f2, desc: 'Mount misalignment, vertical. A dial wired to the OFFY port rides it ±0.25.' },
  focus:    { label: 'Focus',    min: 0, max: 2.5, def: 0, fmt: fpx, desc: 'Lens blur radius in pixels — softens the view before it re-enters the loop. 0 = sharp.' },
  sharpen:  { label: 'Sharpen',  min: 0, max: 2, def: 0, fmt: f2, desc: 'The edge-enhancement circuit — the camcorder sharpening Blair’s feedback lives on. Everything else in a loop blurs, so detail decays; this is gain above 1 on edges only. 0 = flat profile, and images dissolve into blobs.' },
  exposure: { label: 'Exposure', min: 0.85, max: 1.15, def: 1.0, fmt: f3, desc: 'Fixed gain on the capture. ×1 = neutral; a touch over 1 keeps a loop from starving, under 1 lets it dim.' },
  agc:      { label: 'Auto exp', min: 0, max: 1, def: 0, fmt: f2, desc: 'Auto-exposure strength — how hard the camera chases mid-gray, like a camcorder AGC. It’s the iris: it pays back mixer losses and trims bloom, slowly, like a real camera. 0 = the loop runs raw, gain is all yours.' },
  contrast: { label: 'Contrast', min: 0.60, max: 1.60, def: 1.0, fmt: f3, desc: 'Picture-profile contrast, dialed in the camera before the image re-enters the loop. Above 1 the capture expands about mid-gray every lap; ×1 = flat.' },
  sat:      { label: 'Sat',      min: 0, max: 2, def: 1.0, fmt: f2, desc: 'Picture-profile saturation. Above 1 re-pumps the color the loop’s losses drain each lap; 0 captures grayscale.' },
  fringe:   { label: 'Fringe',   min: 0, max: 0.005, def: 0, fmt: f4, desc: 'Chromatic aberration — red sampled slightly outward, blue inward. It COMPOUNDS every lap (red spirals in, blue out), painting color into edges — a whisper is plenty.' },
  bleed:    { label: 'Bleed',    min: 0, max: 0.10, def: 0, fmt: f3, desc: 'Sensor channel crosstalk. Without it each RGB channel loops independently and rails to 0 or 1, collapsing the palette to the cube corners. High values drain color.' },
  knee:     { label: 'Knee',     min: 0, max: 1, def: 0, fmt: f2, desc: 'Highlight knee — how softly values above 0.8 roll off instead of clipping. Soft keeps color alive where a loop over-drives; 0 = hard clip (identity for in-range values).' },
  grain:    { label: 'Grain',    min: 0, max: 0.05, def: 0, fmt: f3, desc: 'Sensor grain injected each frame — the color seed a loop amplifies. A little keeps a dark loop alive; too much drowns it in static.' },
};

/** the mixer's composite modes, in wire order — the stored `mode` value
    is an index into this list, so the order is frozen (presets and saved
    patches carry the numbers; the shader ladders on them). MIX and KEY
    are the original hardware pair; the rest are the digital blend set —
    no glass ever did a color dodge, but this bench is silicon. */
export const MIXER_MODES: { name: string; desc: string }[] = [
  { name: 'MIX',     desc: 'The 50/50 beamsplitter glass — A and B superimposed at half strength each.' },
  { name: 'KEY',     desc: 'The Roland keyer — bright pixels of B ride over A (Key knob sets the threshold).' },
  { name: 'ADD',     desc: 'The superimpose bus — A + B at full strength. No half-loss: a feedback loop blooms.' },
  { name: 'DIFF',    desc: 'Absolute difference — |A − B|. Motion flashes bright; identical frames go black.' },
  { name: 'MULT',    desc: 'A × B — stacked transparencies: dark wherever either is dark.' },
  { name: 'SCREEN',  desc: 'Inverted multiply — bright wherever either is bright; never clips past white.' },
  { name: 'OVERLAY', desc: 'Multiply in A’s shadows, screen in its highlights — B’s texture pushed into A’s contrast.' },
  { name: 'DODGE',   desc: 'Color dodge — A brightened by B; B’s highlights blow A out toward white.' },
  { name: 'BURN',    desc: 'Color burn — A darkened by B; B’s shadows crush A toward black.' },
];

const MIXER_PARAMS: Record<string, ParamDef> = {
  keylvl: { label: 'Key', min: 0.02, max: 0.98, def: 0.45, fmt: f2, desc: 'The keyer’s luma threshold, in KEY mode: pixels of input B brighter than this land OVER input A; darker ones let A through. Low = B mostly covers; high = only its highlights ride in.' },
  ...MONITOR_PARAMS,
};

const DRAW_PARAMS: Record<string, ParamDef> = {
  hue:  { label: 'Hue',  min: 0, max: 360, def: 30, step: 1, fmt: v => v.toFixed(0) + '°', desc: 'Pen color — the slider track is the wheel itself.' },
  size: { label: 'Size', min: 1, max: 60, def: 8, step: 1, fmt: v => v.toFixed(0) + 'px', desc: 'Pen thickness, in source pixels.' },
};

const DIAL_PARAMS: Record<string, ParamDef> = {
  val:  { label: 'Value', min: -1, max: 1, def: 0, fmt: fsig, desc: 'The control signal this dial sends down its wire: −1…+1, 0 at rest. On a camera’s ROT port that’s ±180°; on ZOOM it rides the knob ±0.65.' },
  lerp: { label: 'Lerp', min: 0, max: 3, def: 0, fmt: fsec, desc: 'How the signal chases the knob — the time constant of the glide, in seconds. 0 = wired direct: the wire carries the knob’s position instantly. Turn it up and a flick or a MIDI jump arrives down the wire as a smooth sweep instead of a step.' },
};

const XYPAD_PARAMS: Record<string, ParamDef> = {
  x:    { label: 'X', min: -1, max: 1, def: 0, fmt: fsig, desc: 'The control signal this pad sends down its X wire: −1…+1, 0 at rest (center).' },
  y:    { label: 'Y', min: -1, max: 1, def: 0, fmt: fsig, desc: 'The control signal this pad sends down its Y wire: −1…+1, 0 at rest (center).' },
  lerp: { label: 'Lerp', min: 0, max: 3, def: 0, fmt: fsec, desc: 'How both signals chase the puck — the time constant of the glide, in seconds, shared by X and Y. 0 = wired direct.' },
};

/* the val knob's face when everything the dial feeds is unipolar —
   the whole throw pushes up from rest at the floor */
export const DIAL_VAL_UNI: ParamDef = {
  ...DIAL_PARAMS.val,
  min: 0,
  desc: 'The control signal this dial sends down its wire: 0…+1, 0 at rest. Every port it feeds is unipolar, so the throw only pushes up — a full twist sweeps the destination’s entire range.',
};

/* the same re-ranging, independently per XY pad axis — an axis whose
   wired destinations are all unipolar squishes to 0…+1, rest at its
   own floor; the other axis keeps ±1 regardless */
export const XYPAD_X_UNI: ParamDef = { ...XYPAD_PARAMS.x, min: 0, desc: 'The control signal this pad sends down its X wire: 0…+1, 0 at rest. Every port X feeds is unipolar, so it only pushes up.' };
export const XYPAD_Y_UNI: ParamDef = { ...XYPAD_PARAMS.y, min: 0, desc: 'The control signal this pad sends down its Y wire: 0…+1, 0 at rest. Every port Y feeds is unipolar, so it only pushes up.' };

export const PARAMS: Record<NodeKind, Record<string, ParamDef>> = {
  media: {},
  draw: DRAW_PARAMS,
  camera: CAMERA_PARAMS,
  monitor: MONITOR_PARAMS,
  mixer: { mode: { label: 'Mode', min: 0, max: MIXER_MODES.length - 1, def: 0, step: 1, fmt: v => MIXER_MODES[Math.round(v)]?.name ?? 'MIX', desc: 'How A and B composite — the MIX glass, the luma KEY, and the blend set (ADD, DIFF, MULT, SCREEN, OVERLAY, DODGE, BURN).' }, ...MIXER_PARAMS },
  switch: {},
  dial: DIAL_PARAMS,
  xypad: XYPAD_PARAMS,
  in: {},
  out: {},
  module: {},
};

/* the knobs each kind shows in its drawer (mode has its own dropdown) */
/* draw's hue/size are its own sliders, not drawer knobs */
export const DRAWER: Record<NodeKind, string[]> = {
  media: [],
  draw: [],
  camera: Object.keys(CAMERA_PARAMS),
  monitor: Object.keys(MONITOR_PARAMS),
  mixer: Object.keys(MIXER_PARAMS),
  switch: [],
  dial: [],
  xypad: [],
  in: [],
  out: [],
  module: [],
};

/* the transport globals — the video standard and the loop resolution */
export const GLOBAL_PARAMS: Record<string, ParamDef> = {
  video: { label: 'Video', min: 10, max: 60, def: 30, step: 1, fmt: fhz, desc: 'The video standard’s frame rate — every device runs at this. Each hop costs one of these frames; a LAP is the sum of the hops. Turn it down to run the whole bench in slow motion.' },
  res:   { label: 'Res', min: 0, max: RES_STEPS.length - 1, def: 0, step: 1, fmt: v => RES_LABELS[Math.round(v)] ?? RES_LABELS[0], desc: `Internal loop resolution: ${RES_LABELS.join(' · ')}. Higher is crisper but ~4× the GPU per step, and changing it restarts every loop.` },
};

/** default knob values for a kind — what a fresh device boots with */
export function defaultValues(kind: NodeKind): Record<string, number> {
  return Object.fromEntries(Object.entries(PARAMS[kind]).map(([k, p]) => [k, p.def]));
}

/** default values for the transport globals */
export function defaultGlobals(): Record<string, number> {
  return Object.fromEntries(Object.entries(GLOBAL_PARAMS).map(([k, p]) => [k, p.def]));
}

/* ---- the slot model — every param is a dials Slot ---------------------- */

/* What the engine's wire-combine and the formatter still need off a
   ParamDef once the value lives on a Slot. `polarity` is resolved (never
   inferred at read time); `fmt` rides along so the UI can format without
   re-consulting PARAMS. Discrete params (mode/res/video, delay/size…)
   set `step`; the panel shows no attach picker where modulation makes no
   sense, but the shape stays uniform. */
export interface ParamHints extends Record<string, unknown> {
  periodic: boolean;
  cmin?: number;
  cmax?: number;
  polarity: 'uni' | 'bi';
  fmt: (v: number) => string;
}

/** the resolved hints an engine/UI reader pulls off a slot's meta */
export function paramHints(def: ParamDef): ParamHints {
  return {
    periodic: def.periodic ?? false,
    ...(def.cmin !== undefined ? { cmin: def.cmin } : {}),
    ...(def.cmax !== undefined ? { cmax: def.cmax } : {}),
    polarity: polarityOf(def),
    fmt: def.fmt,
  };
}

/** build a fresh Slot for one param — the value store the tree carries.
    min/max/def/step/desc map onto DialMeta; the engine-only bits ride in
    `meta.hints`. `initial` is the def, so reset-to-home works for free. */
export function slotFor(def: ParamDef): Slot<number> {
  return dial(def.def, {
    label: def.label,
    min: def.min,
    max: def.max,
    ...(def.step !== undefined ? { step: def.step } : {}),
    description: def.desc,
    hints: paramHints(def),
  });
}

/** the full slot tree a fresh device of `kind` boots with */
export function slotsFor(kind: NodeKind): Dials {
  const out: Dials = {};
  for (const [k, def] of Object.entries(PARAMS[kind])) out[k] = slotFor(def);
  return out;
}

/** the transport globals as a slot tree (video/res — not modulatable,
    but slots for a uniform read model) */
export function globalSlots(): Dials {
  const out: Dials = {};
  for (const [k, def] of Object.entries(GLOBAL_PARAMS)) out[k] = slotFor(def);
  return out;
}
