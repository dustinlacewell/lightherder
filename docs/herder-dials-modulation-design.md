# Herder x @ldlework/dials - first-class recursive modulation

Design doc for reworking herder's parameter model onto `@ldlework/dials` slots:
horizontal knob strips under nodes, vertical recursive sub-params, every param
modulatable (`base + depth*signal`) to arbitrary depth. Where dials/phosphor-dials
lack seams a consumer app needs (MIDI learn, live riding, control ports), the
seams are grown in the dials packages - herder does not hack around them.

---

## 1. Current shape - the two models side by side

### Herder today

| Concern | Where | Shape |
|---|---|---|
| Param metadata | `apps/herder/src/patch/params.ts` | `ParamDef` - static: label/min/max/def/step/fmt/desc/periodic/cmin/cmax/polarity. `PARAMS[kind][key]`, `GLOBAL_PARAMS`, `DRAWER[kind]`. |
| Current value | `node.data.v[key]` (`patch/graph.ts`), `mirror.globals[k]` | plain `Record<string, number>` - pure JSON data. |
| Write path | `runtime/dispatch.ts` -> `patch/ops.ts` | Everything is an `Op` (`setParam`/`setGlobal`/`togglePort`/...) through one choke point: session gate (block/defer/apply for peers), canonicalization (compiled id -> scoped level-local), watcher broadcast to the wire, debounced persist. Appliers mutate `data.v` **in place**; the compiled mirror aliases the same objects so the engine feels a write without recompile. |
| Read path (engine) | `engine/params.ts` `paramValue()` | `v + wireSignal * (uni ? range : range/2)`, clamped to `cmin/cmax` or wrapped if `periodic`; publishes to `runtime/live.ts` (`setLive`) only while a control-port wire rides the param. |
| Glide | `engine/dials.ts` `DialBank` | Engine-side one-pole per dial/xypad axis, tau = the node's `lerp` param; also stamps "knob last moved" ticks for fan-in last-write-wins (`engine/wiring.ts` `ctlIn`). |
| UI | `ui/controls/Knob.tsx` | Bespoke Knob/XYPad/ArcGauge. The Knob itself owns: MIDI register/learn/unbind/mode-flip (`midi/targets.ts`, keyed `"nodeId:param"` / `"global:param"`), live-ride display (`watchLive`/`liveValue`, teal arc, periodic fold), control-port toggle (shift-right-click), shift-param (dial's Lerp), unipolar re-ranging (`DIAL_VAL_UNI` swap in `devices.tsx`). |
| Call sites | 4 | `GlobalsBar` (Knob), `Shell` drawer (Knob+port), `DialNode` (Knob+shift+ArcGauge), `XyPadNode` (XYPad+ArcGauge). |
| Persistence | `patch/json.ts` | `v: Record<string, number>` per node, validated/clamped against `PARAMS` on load. MIDI bindings persist separately, keyed by target strings. |

### Dials

| Concern | Where | Shape |
|---|---|---|
| Metadata + value | `packages/dials/src/core.ts`, `dial.ts` | `Slot<T>` = `{ dial: {value, initial, meta}, attached, modDepth, modMode, lastSample }`. `DialMeta` carries label/min/max/step/scale/**lerp**/description/hints. Value lives *on the slot object*. |
| Modulation | `attach.ts`, `sample.ts` | `slot.attached: Source` - one source per slot; sub-params are themselves slots, recursive, unbounded. Sampler combines `base + depth*signal` in knob-travel space (`space.ts`), polarity-normalized, mode-shaped (center/up/down), never leaves range. |
| Smoothing | `sample.ts` `sampleDial` | `meta.lerp` one-pole on the base term, reads `ctx.dt`, memory on `slot._lerpY`. |
| Write path | `dial.ts` `setDial`, `attach.ts` | **Direct in-place mutation** - the Panel calls these itself. No op layer, no gate, no wire. |
| Read path | `sample.ts` `read`/`sampleSlot` | Host samples with a `ctx`; sampler is the only writer of `lastSample`; stateful sources mutate per sample, so the UI must never re-sample - it reads the stash. |
| UI | `react/Panel.tsx`, `react/components.tsx` | Panel walks the tree, one `SlotRow` per slot, nested sub-panel per attached source. Every visual part is a pluggable `PanelComponents` bundle (`Slider`/`Row`/`AttachControl`/`LerpControl`/...) with `sliderShowsValue`/`sliderHostsAttach` seams. `phosphor-dials` supplies the knob-faced bundle (`KnobSlider` rides `slot.lastSample` via rAF; `AttachControl` = glyph + right-click picker). |
| Persistence | `json.ts` | `SlotSnap` - recursive `{ value, depth, mode, attached: { name, params } }`; sources rehydrated by registry name (`fromJSON` throws on unknown). |

### Alignment and clash

Aligned: both treat metadata as code-owned and value as data; both have a
knob-travel-space mental model (herder's polarity re-ranging ~ dials' toPos/fromPos
+ modMode); both have one-pole glide; both already render live-modulated arcs over
a user-owned base; dials' `SlotSnap` is exactly the recursive state herder's `v`
map cannot express.

Clash, in order of severity:

1. **Write mediation.** Herder's entire collab/persist/MIDI story rides the op
   choke point; dials' Panel mutates slots directly. Unmediated, a peer's Panel
   drag would bypass the session gate and never reach the wire.
2. **Value representation.** `data.v` is plain JSON that travels over the wire and
   into localStorage; a live `Slot` tree contains `Source` instances with closures
   (stateful bodies) - unserializable. The document and the live tree cannot be
   the same object unless the closures are treated as runtime-only.
3. **Slot identity.** Herder addresses params by `"nodeId:param"` strings (MIDI
   targets, live channel, ops). Dials has no path concept - the Panel walks by
   local key only. Recursion needs stable paths (`"n3:zoom/freq"`).
4. **Two lerps.** `DialMeta.lerp` (sampler-side, per slot) vs herder's
   `DialBank` (engine-side, per dial/xypad node) - same math, different owner.
5. **Two modulation systems.** Dials' attached sources vs herder's control-port
   *wires* (graph edges, fan-in, module IN/OUT routing, last-write-wins). Wires
   are not going away - they're the patching idiom - so a param ends up with two
   additive layers.

---

## 2. Target architecture

### The core decision: live slot tree on `node.data`, snapshot at the edges

`data.v: Record<string, number>` is **replaced** by `data.slots: Record<string,
Slot<number>>` - a real dials object per node, built by `makeNode` from the
kind's `ParamDef`s (a new `slotFor(def): Slot<number>` factory in `params.ts`
maps min/max/def->initial, desc->description, label; `periodic`/`cmin`/`cmax`/
`polarity`/`fmt` ride in `meta.hints` since the engine's wire-combine and the
formatter still need them). `ParamDef` itself survives as the static schema -
it is still what `polarityOf`, `targetResolves`, port descriptions, and the
JSON validator consult.

The slot tree is **runtime state aliased into the document**, exactly like
`data.v` is today (ops mutate it in place; the compiled mirror shares the
reference; the engine feels writes without recompile). At the serialization
boundary (`patch/json.ts`) the tree converts through dials' `toJSON`/`fromJSON`
per node: `graphToJSON` emits `slots: DialsSnap`, `graphFromJSON` builds default
slots then hydrates. Source closures never touch the wire or disk - only
`SlotSnap` (source *names* + values) does, and `fromJSON`'s registry lookup
rebuilds instances deterministically on every client.

### Write path: ops stay sovereign; dials grows a mediated-action seam

`setParam` keeps its shape but gains a slot path:

```ts
| { kind: 'setParam';   scope; node; rel?; key: string /* "zoom" | "zoom/freq" */; v: number }
| { kind: 'slotAttach'; scope; node; rel?; key: string; source: string | null }  // null = detach
| { kind: 'slotDepth';  scope; node; rel?; key: string; depth: number }
| { kind: 'slotMode';   scope; node; rel?; key: string; mode: ModMode }
| { kind: 'slotLerp';   scope; node; rel?; key: string; seconds: number }
| { kind: 'setGlobal';  k: string /* path too */; v: number }  // + global variants of the above
```

Appliers in `ops.ts` resolve the slot by walking `data.slots[first]` then
`attached.params[next]`... and call dials' own `setDial`/`attachFrom`/`detach`/
`setDepth`/`setMode` on it. Because appliers run identically on every client and
`attachFrom` instantiates from the shared registry, a remote `slotAttach`
reproduces the same tree everywhere. (Stateful source *phase* - an LFO's
accumulator - diverges between peers; that is accepted, matching the engine's
existing per-client nondeterminism.)

The dials Panel must therefore **stop mutating directly when the host says so**:
this is dials gap G1 (section 3) - a `SlotActions` interceptor threaded through
Panel. Herder's implementation dispatches the ops above; the default
implementation is today's direct mutation, so existing dials consumers are
untouched. The session gate, defer/block, canonicalization, echo suppression all
work unmodified - slot ops are just more ops.

### Read path: the engine samples the tree; wires stay a second layer

Each engine `tick()` (`engine/engine.ts`):

1. Build `ctx = { dt: 1/mirror.globals.video, t: simTime }` (sim-time, so a
   frozen bench holds mid-modulation - matching DialBank's behavior today).
2. **One full sampling pass**: for every node, for every slot,
   `sampleSlot(slot, ctx)`. This advances all stateful sources exactly once per
   tick, writes every `lastSample`, and applies `meta.lerp` glide. The engine is
   the *only* sampler; all UI reads `lastSample` (the phosphor `KnobSlider`
   already does exactly this via its rAF `live()` poll).
3. `paramValue(n, key)` becomes:
   `combineWire(slot.lastSample, wiring.ctlIn(...))` - the dials-resolved value
   is the new "base", and a riding control-port wire still adds
   `signal * (uni ? range : range/2)` with `cmin/cmax`/periodic handling read
   from `meta.hints`. `setLive`/`clearLive` publish the wire-ridden effective
   value exactly as today.

`DialBank` glide **retires**: `meta.lerp` on the dial/xypad `val`/`x`/`y` slots
is the same one-pole in the same sim-time. What survives of `DialBank` is a
slim **stamp tracker** (knob-last-moved tick per dial axis, for `ctlIn`'s
last-write-wins fan-in) - fold it into the sampling pass (compare
`slot.dial.value` per tick) and keep `signalOf` reading `slot.lastSample` so a
wire now carries the dial's *modulated* output. That is the payoff: attach an
LFO to a dial node's `val` and every port its wire feeds wobbles.

### Data-flow, end to end

```
user drag / MIDI CC / remote op
        |  (SlotActions -> dispatch, or midi modelTarget -> dispatch{silent})
        v
dispatch() -- gate -- applier (ops.ts) --> mutates Slot in node.data.slots --> wire, persist
                                                   |  (aliased by mirror)
engine tick:  ctx{dt,t} -> sampleSlot(all trees) --> lastSample everywhere
              paramValue = lastSample (+) ctlIn(wires) -> shaders; setLive(ridden)
                                                   |
UI: KnobSlider rAF-polls lastSample (mod arc); liveOverride shows wire-ridden value
```

---

## 3. The dials package gaps (core deliverable)

Each gap names the file/contract that changes. Defaults preserve current
behavior for zero-config consumers.

**G1 - Mediated slot mutation (`react/Panel.tsx`, `react/components.tsx`).**
Today `NumberEditor` calls `setDial`, `DefaultAttachControl`/phosphor
`AttachControl` call `attachFrom`/`detach`/`setMode`, `NumberEditor` calls
`setDepth` and writes `meta.lerp`. Add a `SlotActions` contract:

```ts
export interface SlotActions {
  setValue(path: string[], slot: Slot<unknown>, v: unknown): void
  attach(path: string[], slot: Slot<unknown>, sourceName: string | null): void
  setDepth(path: string[], slot: Slot<unknown>, depth: number): void
  setMode(path: string[], slot: Slot<unknown>, mode: ModMode): void
  setLerp(path: string[], slot: Slot<unknown>, seconds: number): void
}
```

`Panel` accepts `actions?: Partial<SlotActions>` (default = the direct calls),
provides it via the components context, and *all* Panel-internal and
AttachControl mutations route through it. Herder's implementation translates
`(path -> node/key)` into dispatched ops and performs **no** direct mutation -
the applier does. Phosphor's `AttachControl` switches from calling
`attachFrom`/`detach` itself to `actions.attach(...)`.

**G2 - Slot identity / path threading (`react/Panel.tsx`, `components.tsx`).**
`Panel` gains an `id?: string` root prefix; `SlotRow` accumulates `path:
string[]` (root key, then attached-source param keys) and passes it into
`RowProps`, `SliderProps`, `AttachControlProps`, and the `SlotActions` calls.
This is the join point for MIDI targets (`"n3:zoom/freq"`), the live channel,
and ops. Purely additive - components that ignore `path` are unchanged.

**G3 - Per-slot chrome / adornment seam (`components.tsx`).**
New optional bundle member:

```ts
SlotChrome?: ComponentType<{
  path: string[]; slot: Slot<unknown>; children: ReactNode
}>
```

The Panel wraps each row's *control* in `SlotChrome` when supplied. This is
where herder lives: its `SlotChrome` registers/unregisters the MIDI target for
the path, subscribes `watchLearn`, renders the MIDI/learn/port dots, and owns
the context-menu policy (learn / unbind / mode-flip / port-toggle) - wrapping
whatever knob the bundle renders without forking `KnobSlider`. Neither dials
nor phosphor-dials ever imports MIDI or herder concepts.

**G4 - Live-value override (`react/Panel.tsx` -> `SliderProps.live`).**
`SliderProps.live` already exists (the `lastSample` accessor) and covers the
modulation ride for free once the engine is the sampler. What's missing is an
*external* effective value - herder's wire-ridden value is computed engine-side
on top of the slot output and is not in `lastSample`. Add a Panel prop
`liveOverride?: (path, slot) => (() => number | undefined) | undefined`;
when it returns an accessor, the Panel passes *that* as `live` (with riding
hints) instead of the stash accessor. Herder supplies
`path -> liveValue("n3:zoom")` (`runtime/live.ts`), so a port-ridden knob shows
the teal engine truth exactly as today, and falls back to the stash accessor
when nothing rides.

**G5 - Layout ownership: export the row walker (`react/Panel.tsx`, `react/index.ts`).**
`SlotRow` is private and `Panel` hard-codes a vertical `div` stack. Export
`SlotRow` (path-aware per G2) and add a `PanelComponents.Frame?:
ComponentType<{ title?; children }>` for the container. A consumer can then
compose its own arrangement of `SlotRow`s - herder's horizontal strip (section
4) - without reimplementing the recursion, attach logic, or editor selection.
Nested sub-panels keep rendering vertically inside each row (that is already
the desired recursive layout).

**G6 - `fromJSON` resilience (`json.ts`).**
Herder loads hostile/stale patches and must degrade per-field, but dials
`fromJSON` throws on an unregistered source name, which would kill a whole
patch load. Add `fromJSON(dials, snap, { onMissingSource?: 'throw' | 'drop' })`
(default `'throw'`). Herder passes `'drop'`: the slot keeps its value, loses
the attachment, the bench survives.

**G7 (phosphor-dials, minor) - `KnobSlider`/`Row` pass-throughs.**
With G3, `KnobSlider` needs no app hooks - it only needs to keep working when
wrapped. `Row.tsx` gains an orientation class hook so the horizontal strip can
restyle captions via CSS only. Also: expose knob `size` on the bundle (herder's
drawer knobs are 44px, globals 38px; phosphor's is fixed 56) - a
`makeDialPanelComponents({ knobSize })` factory beats a context hack.

Explicitly **not** gaps: depth/mode editing (already `onDepthChange` + slot
state), in-knob attach picker (`sliderHostsAttach`), reset-to-initial
(`defaultValue`), descriptions (HoverCard via `Row.description`), log scale.

---

## 4. The UI layout - horizontal under the node, vertical recursion

Reuse `SlotRow` + the phosphor bundle; do **not** reuse `Panel`'s container.

`Shell.tsx` drawer becomes:

```tsx
<div className="drawer dials-strip nodrag">   {/* flex-row, wraps */}
  {DRAWER[kind].map(k => (
    <SlotRow key={k} label={k} slot={data.slots[k]} path={[k]} ... />
  ))}
</div>
```

with one `PanelComponentsProvider` at the bench root (herder's bundle =
phosphor's `dialPanelComponents` + herder `SlotChrome` + `actions` +
`liveOverride`), not per node. Each `SlotRow` is a column: caption, knob, and -
when a source is attached - the nested sub-panel **vertically beneath it**
(phosphor's `pd-row-nested` already does this, with fold toggles and the indent
rail). The horizontal strip is CSS on the container (`display:flex;
align-items:flex-start`) - columns grow downward independently as modulation
trees deepen. A node with an attached source gets taller, not wider; sibling
knobs stay on the strip. React Flow nodes auto-size; `nodrag` is already the
pattern.

`devices.tsx`: `DialNode` renders a `SlotRow` for `val` (its `lerp` moves into
`meta.lerp` on the slot, so the phosphor `LerpControl` replaces the ArcGauge
and the shift-param hack); `XyPadNode` keeps the XYPad widget for the puck
(section 5) with two axis columns beneath. `GlobalsBar` becomes a two-column
strip of `SlotRow`s over a root `globalSlots` dials object.

`ui/controls/Knob.tsx`: the bespoke `Knob` and `ArcGauge` **retire** (their
MIDI/port/live behaviors move to `SlotChrome`; display moves to phosphor's
`Knob`). `XYPad` survives, slimmed (MIDI/live plumbing moves out to the same
chrome layer).

---

## 5. XYPad + globals + the dial/xypad node kinds

**dial/xypad stay graph nodes; they do not become dials sources.** A dials
source instance is per-slot (attach instantiates fresh; serialization
rehydrates per attachment) - it cannot fan one signal out to many params, which
is the entire point of a dial node (one MIDI-bound knob driving five ports,
last-write-wins fan-in, module IN/OUT boundary routing). Wires and attachments
are different axes: attachments are *local, recursive, generative* modulation;
wires are *global, performable routing*. Both compose at `paramValue`. The
dial's own `val` slot being modulatable makes wire sources richer for free.

**XYPad** has no dials equivalent and doesn't need one: `x`/`y` are two number
slots. The pad edits both dials at once (via `actions.setValue`); each axis
gets its own attach glyph and vertical sub-panel beneath the pad (two columns
under one puck). The puck displays the axes' `lastSample`/wire-ridden values -
the "ridden puck" survives. The unipolar re-range (`dialPolarity` walk in
`devices.tsx`) stays: it now rewrites the slot's `meta.min` (0 vs -1) when the
wired destinations are all-unipolar; the applier clamp keeps stored values
legal.

**Globals**: a root `globalSlots: Dials` replaces `mirror.globals` as the value
store (`mirror.globals.video/res` reads become slot reads). `setGlobal` carries
slot paths like `setParam`. Whether video/res are modulatable is decision 6.

---

## 6. Blast radius

### packages (the gaps, section 3)
| File | Change |
|---|---|
| `packages/dials/src/react/Panel.tsx` | Medium-large: path threading, `actions`, `liveOverride`, export `SlotRow`, `Frame`. |
| `packages/dials/src/react/components.tsx` | Medium: `SlotActions` context, `SlotChrome`, `path` on prop shapes. |
| `packages/dials/src/json.ts` | Small: `onMissingSource`. |
| `packages/dials/src/index.ts`, `react/index.ts` | Small: exports. |
| `packages/phosphor-dials/src/AttachControl.tsx` | Small: mutate via `actions`. |
| `packages/phosphor-dials/src/KnobSlider.tsx`, `Row.tsx`, `index.ts` | Small: size factory, orientation class. |

### herder
| File | Change |
|---|---|
| `patch/params.ts` | Medium: `slotFor(def)` factory; hints mapping; `DIAL_VAL_UNI` variants become meta rewrites. |
| `patch/graph.ts` | Small-medium: `NodeData.slots`, `makeNode` builds trees; `v` removed. |
| `patch/json.ts` | Medium, **risky**: emit/parse `slots: DialsSnap`; migrate legacy `v`. |
| `patch/ops.ts` | Medium, **risky**: slot-path resolution + 4 new op kinds; `setParam` path-aware. Gate untouched (ops are ops), but every peer must share the source registry. |
| `patch/library.ts` + `compile.ts` | Medium, **risky**: `InstVals.v` becomes per-rel `DialsSnap` overlays; `mergedNode` must *clone* slot trees (re-instantiate sources) per compiled node instead of `{...n.data.v}` - compiled module internals need their own live sources, and stateful-source state must not be shared between instances. |
| `engine/engine.ts` | Medium: ctx build, full sampling pass in `tick()`. |
| `engine/params.ts` | Medium: combine `lastSample` with wire using `meta.hints`. |
| `engine/dials.ts` | Shrinks to a stamp tracker (rename to kill the name collision - `stamps.ts`). |
| `engine/wiring.ts` | Small: `signalOf` -> slot `lastSample`. |
| `midi/targets.ts` | Medium, **risky**: path-aware `targetResolves`/`modelTarget` (walk the slot tree); model fallback dispatches path `setParam`. Old binding keys (`"n3:zoom"`) parse as depth-1 paths - compatible. Bindings to *sub*-slots die when the attachment is swapped: prune on `slotAttach`. |
| `ui/nodes/Shell.tsx` | Medium: drawer -> `SlotRow` strip; port toggle moves into `SlotChrome` (root slots only). |
| `ui/nodes/devices.tsx` | Medium: Dial/XyPad rework; `dialPolarity` -> meta rewrite. |
| `ui/chrome/GlobalsBar.tsx` | Small. |
| `ui/controls/Knob.tsx` | Mostly deleted (XYPad survives, slimmed). New `ui/controls/SlotChrome.tsx` + `dialsBundle.ts`. |
| `runtime/live.ts` | Unchanged (still the wire-ride channel; modulation display now rides `lastSample`). |
| `patch/presets.ts`, CSS | Presets re-emitted or migrated; drawer strip / nested rail / phosphor-dials styles import. |

### Risky seams, named
1. **Persistence migration** (`patch/json.ts` + library entries + presets):
   legacy `v` -> default slots + `setDial`. Cheap and lossless.
2. **Compile/ref-instance cloning** (`compile.ts`/`library.ts`): slot trees are
   no longer spreadable; the per-instance overlay merge needs a
   snap-overlay -> hydrate step. The single hardest part of the change.
3. **MIDI target keys and pruning** (`midi/`): path keys, attachment-swap
   pruning, `targetResolves` walking live trees instead of static `PARAMS`.
4. **Peer registry skew**: a remote `slotAttach` naming a source this client
   hasn't registered must degrade (G6's `'drop'` policy in the applier too).

---

## Decisions locked (owner, 2026-07-19)

All 8 decision points resolved on the recommended defaults:
1. **Migrate** saved patches (no clean break). 2. dial/xypad **stay graph nodes**
(params become modulatable slots; wires + attachments compose). 3. Adopt
**`DialMeta.lerp`**, retire DialBank to a slim stamp tracker. 4. Control-port
wires stay an **engine-side additive layer**. 5. **Live tree on `data.slots`**,
snapshot at edges. 6. Globals **not modulatable** initially. 7. Sub-slots
**MIDI-learnable yes, port-exposable no**. 8. **Compose exported `SlotRow`s**,
not `Panel` whole.

Build sequencing: **Phase 1 = dials-package seams first** (G1-G7), isolated,
typechecked, story-covered, committed — no herder changes — before the herder
cutover (phase 2 graph/engine/persist, phase 3 node UI).

## 7. Decision points

1. **Saved-patch migration or clean break?** *Recommend migrate.* Legacy `v`
   hydrates into default slot trees in a dozen lines of `graphFromJSON`; the
   library/localStorage patches and shipped presets keep working. A clean break
   buys almost nothing.
2. **Do dial/xypad node kinds become dials sources?** *Recommend no - they stay
   graph nodes* (fan-out, MIDI performance surface, module boundaries are wire
   concerns a per-slot source instance cannot express). Revisit only if wires
   themselves are to die.
3. **Lerp: keep DialBank or adopt `DialMeta.lerp`?** *Recommend `DialMeta.lerp`*
   - same one-pole, sim-time via `ctx.dt`, one owner, LerpControl UI for free.
   Keep only a slim engine-side stamp tracker for wire fan-in.
4. **Control-port wires: engine-side additive layer, or modeled as an attached
   source?** *Recommend engine-side layer* (status quo composition on top of
   the slot output). Modeling a wire as `slot.attached` would collide with real
   attachments (one source per slot) and drag graph topology into dials.
5. **Live tree on `node.data` (aliased, snapshot at edges) vs snapshot-in-doc
   with a separate runtime tree?** *Recommend live tree on `data.slots`* - it
   preserves herder's aliasing invariant (applier writes, engine feels it, no
   recompile) and confines conversion to json.ts/compile.ts. The separate-tree
   design doubles the bookkeeping for a purity herder's document never had.
6. **Are `video`/`res` (globals) modulatable?** *Recommend not initially* - a
   res change restarts every loop; an LFO on it is a footgun. Trivial to allow
   later (it falls out of the model).
7. **Are sub-slot params MIDI-learnable and port-exposable?** *Recommend MIDI
   yes* (falls out of path keys), *ports no* - control ports stay
   root-param-only; a recursive sub-param as a node port explodes the port
   stack and wire UI for marginal gain.
8. **Consume `Panel` whole or compose exported `SlotRow`s?** *Recommend compose
   `SlotRow`s* (G5) - the horizontal strip, bench-root provider, and node-chrome
   integration don't fit `Panel`'s single vertical container, and forking the
   recursion into herder is exactly the hack the owner forbade.

---

### Critical Files for Implementation
- d:\code\demos\viz\packages\dials\src\react\Panel.tsx
- d:\code\demos\viz\packages\dials\src\react\components.tsx
- d:\code\demos\viz\apps\herder\src\patch\ops.ts
- d:\code\demos\viz\apps\herder\src\engine\params.ts
- d:\code\demos\viz\apps\herder\src\ui\nodes\Shell.tsx
