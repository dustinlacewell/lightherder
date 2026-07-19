# Modulation redesign — recon

Facts only. All citations are `file:line` relative to `d:\code\demos\viz`. Line numbers are as of the recon read; re-verify before large edits land elsewhere.

---

## 1. `packages/dials/src/source.ts`

Exports: `ParamSpec<T>` (`packages\dials\src\source.ts:37-40`), `ParamsSpec<P>` (`:42-44`), `DefineSourceArgs<P,Out>` (`:46-62`), `DefineStatefulSourceArgs<P,Out>` (`:64-84`), `defineSource` (`:90-97`), `defineStatefulSource` (`:104-114`), `instantiate` (`:154-175`), `registerSource` (`:186-195`), `getSource` (`:201-205`), `sourcesForType` (`:212-220`), `clearRegistry` (`:225-227`). Internal `buildDef` (`:116-140`) is the sole constructor of a `SourceDef`.

`DefineSourceArgs`/`DefineStatefulSourceArgs` fields (identical shape except `body`): `name: string` (`:51`/`:69`), `description?: string` (`:53`/`:71`), `outType: string` (`:55`/`:73`), `params: ParamsSpec<P>` (`:57`/`:75`), `body: Body<P,Out>` (stateless, `:59`) or `body: BodyFactory<P,Out>` (stateful, `:81`), `onAttach?: OnAttach<P>` (`:61`/`:83`). **No `polarity` field exists anywhere in this file.**

`buildDef` (`packages\dials\src\source.ts:116-140`) assembles the returned `SourceDef`: sets `stateful` from its own boolean parameter (`:137`, passed as literal `false` from `defineSource` at `:95` and `true` from `defineStatefulSource` at `:112`) — `stateful` is never derived from `body`'s shape, it's caller-declared per which factory function was used. A new `polarity` field would be threaded exactly like `outType`/`stateful`: added to `DefineSourceArgs`/`DefineStatefulSourceArgs` (`:46-84`), passed into `buildDef`'s parameter list (`:116-124`), and copied onto the returned object literal (`:130-139`), landing on `SourceDef` in `core.ts` (see §3 below, `core.ts:108-136`).

`instantiate` (`:154-175`) builds a live `Source` from a `SourceDef`: iterates `def.params` making a fresh `Slot` per param via `makeSlot()` (`:160-163`), resolves `body` — calls the factory once if `def.stateful` (`:164-166`) — and returns `{ kind: 'source', def, params, body, _buf, _keys }` (`:167-174`). `polarity` would simply be read off `def.polarity` wherever a `Source` is later interpreted (sample.ts / attach.ts under the new model) since `instantiate` doesn't need to touch it — it passes through on `def`.

Registry (`:179-227`) is a `Map<string, SourceDef>` keyed by `name`; `sourcesForType` linear-scans matching `outType` (`:212-220`) — this is what the Panel's attach picker queries (see §7). Nothing here reads `min`/`max`/lo/hi.

---

## 2. `packages/dials/src/attach.ts`

Exports `attach` (`:21-30`), `attachFrom` (`:36-54`), `detach` (`:60-62`).

**`attach<T>(slot, source)`** (`:21-30`): runtime-checks `source.def.outType !== slot.outType`, throws if mismatched (`:22-27`); otherwise `slot.attached = source` (`:28`) and returns `slot`.

**`attachFrom<T>(slot, def)`** (`:36-54`) — step by step:
1. Runtime-check `def.outType !== slot.outType`, throw if mismatched (`:40-45`).
2. `const src = instantiate(def)` (`:46`) — fresh sub-slots per §1.
3. `if (def.onAttach) def.onAttach(src.params, slot as Slot<unknown>)` (`:49-51`) — this is the **only** call site of `onAttach` in the whole package (confirmed via search — no other `.onAttach(` call exists outside this file and `stdlib.ts`'s definitions of the hook itself).
4. `slot.attached = src` (`:52`).
5. Returns `src` (the instantiated `Source`, not the slot — differs from `attach`'s return value).

**`detach<T>(slot)`** (`:60-62`): single statement, `slot.attached = null`. No-op safe on an already-detached slot (asserted by `attach.test.ts:78-83`).

### Every site that reads `.attached` (repo-wide grep, `packages\dials\src\**` and `packages\**\*.tsx`)

| File:line | Read shape | Context |
|---|---|---|
| `packages\dials\src\sample.ts:26` | `const src = slot.attached` | ternary branch selector in `sampleSlot` |
| `packages\dials\src\attach.ts:28,52,61` | write sites (`slot.attached = source\|src\|null`) | attach/attachFrom/detach |
| `packages\dials\src\json.ts:48,50,51,53` | `if (slot.attached)`, `slot.attached.params`, `slot.attached.def.name` | `slotToSnap` serializer |
| `packages\dials\src\json.ts:79,80,83-84,89` | `snap.attached`, `snap.attached.name`, `snap.attached.params[k]` | `applySlotSnap` deserializer (note: these are `SourceSnap` reads, not `Slot.attached` reads — different shape, see §4) |
| `packages\dials\src\react\Panel.tsx:109` | `const attached = slot.attached` | `SlotRow`, drives `attachedHelp`, `attachPicker`, `control` branch, `nested` sub-panel, `data-dials-attached` |
| `packages\dials\src\react\Panel.tsx:265` | `attached={slot.attached !== null}` | boolean prop passed to `<c.Slider>` |
| `packages\dials\src\react\components.tsx:272` | `if (candidates.length === 0 && !slot.attached) return null` | `DefaultAttachControl` |
| `packages\dials\src\react\components.tsx:273` | `slot.attached?.def.name ?? ''` | dropdown's current-selection value |

Also test-only reads: `attach.test.ts:50,66,82`; `json.test.ts:85-87,95,143,147`; `sample.test.ts:69` (`params.v.attached = null`, direct write in a test).

**If `Slot.attached` becomes `{ source, depth: number } | null`**, every row above that dereferences `.attached` as if it *were* the source (`.def`, `.params`, `.def.name`) breaks and needs a `.source` hop inserted:
- `sample.ts:26` — `const src = slot.attached` → needs `slot.attached?.source`.
- `json.ts:48-53` (`slotToSnap`) — `slot.attached.params`/`slot.attached.def.name` → `.attached.source.params`/`.attached.source.def.name`; also new: serialize `depth`.
- `Panel.tsx:109,120-125,153-173,179` — `attached.def.description`, `attached.def.name`, `attached.params` all need `.source.` inserted; `attached` itself (truthy check) stays valid since the wrapper object is still truthy/null.
- `Panel.tsx:265` — `slot.attached !== null` stays valid as a null-check (wrapper is still `| null`), but if `KnobSlider`/`Slider` also want `depth` this is the place to pass it through.
- `components.tsx:272-273,284-291` (`DefaultAttachControl`) — `slot.attached?.def.name` → `.attached?.source.def.name`; the swap logic at `:284-291` calls `detach(slot)` then `attachFrom(slot, def)`, both of which only know about the bare-source shape today and need updating in `attach.ts` itself (not just call sites) once `attached` is a record — `attachFrom`'s final assignment `slot.attached = src` (`:52`) becomes `slot.attached = { source: src, depth: <default> }`.
- Attach/detach in `attach.ts` (`:28,52,61`) are the authoritative write sites — the wrapper's construction logic centralizes here.

---

## 3. `packages/dials/src/sample.ts` — control flow

Three exports: `sampleSlot` (`:25-30`), `sampleSource` (`:65-77`), `read` (`:100-112`). Internal `sampleDial` (`:42-63`).

**`sampleSlot<T>(slot, ctx)`** (`:25-30`):
```
const src = slot.attached
const out = src ? sampleSource(src, ctx) : sampleDial(slot, ctx)
slot.lastSample = out
return out
```
Binary branch: attached → `sampleSource` result REPLACES the dial value entirely (today's replace-not-combine model); unattached → `sampleDial`. Either way, `slot.lastSample = out` (`:28`) is written unconditionally — this is described in the file header (`:18-20`) as "the sampler is the only writer of the stash."

**`sampleDial<T>(slot, ctx)`** (`:42-63`) — the dial branch, only reached when nothing is attached:
1. `target = slot.dial.value` (`:43`).
2. Reads `meta.lerp` as `tau` (`:44-45`).
3. Fast-path bailout: if `target` isn't a number, or `tau` isn't a positive number, return `target` verbatim — zero state touched (`:46-52`).
4. Else reads filter memory `slot._lerpY` (`:53`). If unset/non-finite (first sample), seeds `_lerpY = target` and returns `target` directly — no easing on the first sample (`:54-57`).
5. Else one-pole update: `dt = ctx.dt ?? 1/60` (`:58`), `alpha = 1 - exp(-dt/tau)` (`:59`), `y = prev + (target - prev) * alpha` (`:60`), stores `slot._lerpY = y` (`:61`), returns `y` (`:62`).

This lerp/smoothing machinery is dial-branch-only per the header comment (`core.ts:49-52`: "This smooths only the dial branch; an attached source drives the slot directly"). Under the new `output = clamp(base + depth·signal, min, max)` model, whether `sampleDial`'s lerped `target` becomes the `base` term, and whether lerp still applies when a source is attached, is an open design question this recon does not resolve — it is out of scope for a facts-only pass.

**`sampleSource<P,T>(source, ctx)`** (`:65-77`): for each cached key in `source._keys`, recursively `sampleSlot`s the corresponding param slot into the reusable `source._buf` (`:69-75`), then calls `source.body(source._buf, ctx)` (`:76`) and returns its result untouched — this is where a normalized-signal source's raw `[-1,1]`/`[0,1]` output would need combining with the host slot's `base`/`depth`/`min`/`max`, which today happens nowhere (the combine step doesn't exist; `sampleSlot`'s ternary at `:27` just substitutes).

**`read<D>(dials, ctx)`** (`:100-112`): per-dials-object cache via `WeakMap<Dials, {buf, keys}>` (`:84-88`, `:100-106`); loops `keys`, calls `sampleSlot` per top-level slot into the shared `buf` (`:107-110`), returns the same buffer reference every call (`:111`, documented risk at `:12-13, 90-98`).

`lastSample` stash write is single-sited: `sample.ts:28`, inside `sampleSlot` only — `sampleSource` and `sampleDial` never write it directly, and no other file writes `.lastSample` (confirmed by the earlier `.attached` grep pass covering the same directories — a further targeted grep for `lastSample =` shows only `sample.ts:28`).

---

## 4. `packages/dials/src/json.ts`

Types: `SlotSnap { value: unknown; attached?: SourceSnap }` (`:24-27`), `SourceSnap { name: string; params: Record<string, SlotSnap> }` (`:29-32`), `DialsSnap = Record<string, SlotSnap>` (`:34`).

**Save path.** `toJSON(dials)` (`:38-44`) maps every top-level slot through `slotToSnap`. `slotToSnap(slot)` (`:46-56`): builds `{ value: slot.dial.value }` (`:47`); `if (slot.attached)` (`:48`) recursively snapshots each of `slot.attached.params` (`:49-52`) and sets `snap.attached = { name: slot.attached.def.name, params }` (`:53`). **No `depth` field exists in `SourceSnap` today** — the whole file has no concept of depth/gain, only `name` + recursive `params`.

**Load path.** `fromJSON(dials, snap)` (`:69-75`) iterates dials keys, skips ones absent from `snap` (`:71-72`, forward-compat by omission), else `applySlotSnap`. `applySlotSnap(slot, snap)` (`:77-97`):
1. `setDial(slot, snap.value)` (`:78`) — always writes the base dial value regardless of whether a source is attached.
2. `if (snap.attached)` (`:79`): look up `getSource(snap.attached.name)` (`:80`), throw loudly if unregistered (`:81-86`, deliberate per header `:11-12`); `attachFrom(slot, def)` (`:87`) — this re-runs `onAttach` seeding (see §2 step 3) even during a JSON load, then for each `k in source.params`, recursively `applySlotSnap`s the child snapshot if present (`:88-93`).
3. `else detach(slot)` (`:95`) — snapshot with no `attached` field forces detachment even if the live slot currently has something attached (asymmetric with the "leave defaults" behavior for missing top-level keys).

**Where `depth` would need to be added:** `SourceSnap` (`:29-32`) gains a `depth: number` field; `slotToSnap` (`:46-56`) must read `slot.attached.depth` (post-redesign, `slot.attached.source.def...` per §2) and include it in the emitted `attached` object at `:53`; `applySlotSnap` (`:77-97`) must apply the loaded `depth` onto the newly-created attachment after `attachFrom` returns (`:87`) — `attachFrom` itself only returns the bare `Source`, so either `attachFrom`'s signature changes to accept/return depth or `json.ts` sets `slot.attached.depth` directly after the call, mirroring how it currently walks `source.params` for children.

**Source params round-trip today:** by full recursion — a source's own params are themselves `Slot`s, so `slotToSnap`/`applySlotSnap` recurse through `SourceSnap.params` uniformly whether the param is a plain dial or itself has a nested source attached (exercised by `json.test.ts:55-64` depth-2 nesting, and `json.test.ts:132-149` for a custom registered source). This recursive mechanism is untouched by the depth/polarity redesign — only the per-attachment envelope (`SourceSnap` gaining `depth`) changes.

---

## 5. `packages/dials/src/network.ts`

Purpose (file header `:1-11`): thin `fetch`-based load/save helpers wrapping `toJSON`/`fromJSON` against a configurable HTTP endpoint (typically a Vite dev middleware), so an app can persist a whole dials tree in one call.

Exports: `DialsEndpoint` interface (`:16-21`, `{ url, fallbackUrl? }`), `loadDials(target, endpoint)` (`:32-42`), `saveDials(target, endpoint)` (`:48-63`). Internal `fetchSnap(url)` (`:65-75`).

`loadDials` (`:32-42`): GETs `endpoint.url` via `fetchSnap`, falls back to `endpoint.fallbackUrl` on miss, calls `fromJSON(target, snap)` (`:40`) if a snapshot was found; never throws (swallows fetch/parse errors, `fetchSnap:66-73`).

`saveDials` (`:48-63`): `toJSON(target)` (`:53`) then POSTs the JSON body; returns `false` on any thrown error, never throws itself.

**Does it touch slots/sources/attachments directly? No.** It only calls `toJSON`/`fromJSON` from `json.ts` — zero direct references to `Slot`, `Source`, `.attached`, `.dial`, or any stdlib name. The file is explicitly described as "dial-tree-agnostic" (`:9-10`).

**Redesign impact: none, mechanically.** Because it delegates entirely to `json.ts`'s `DialsSnap` shape, any `depth`/`polarity` fields added there flow through `network.ts` for free — no edits needed in this file. No further action item here beyond re-running its tests if `json.ts`'s snapshot shape changes in a way that breaks JSON round-trip assumptions (it doesn't; the shape is still `DialsSnap`, just with a wider `SourceSnap`).

---

## 6. `packages/dials/src/stdlib.ts` — source inventory

All entries import from `./source` via `defineSource`/`defineStatefulSource` and share `outType: 'number'`. Every stdlib source currently has `onAttach` wired to seed lo/hi/range from the host (except `ramp`, which has none).

| Source | stateful? | Current params (name: default, [min,max]) | lo/hi range plumbing (delete) | Survives redesign | Natural polarity |
|---|---|---|---|---|---|
| `sine` (`:163-178`) | no | `lo:-1[-10000,10000]`, `hi:1[-10000,10000]`, `freq:1[0.01,20]log`, `phase:0[0,6.2832]` | `lo`, `hi`, `onAttach: seedRangeFromHost` | `freq`, `phase` | bipolar |
| `tri` (`:189-205`) | no | `lo:-1`, `hi:1`, `freq:1[0.01,20]log`, `phase:0[0,1]` | `lo`, `hi`, `onAttach` | `freq`, `phase` | bipolar |
| `saw` (`:210-226`) | no | `lo:-1`, `hi:1`, `freq:1[0.01,20]log`, `phase:0[0,1]` | `lo`, `hi`, `onAttach` | `freq`, `phase` | bipolar (ramps through both signs by default; unipolar in spirit but current default range is [-1,1] like the others) |
| `square` (`:231-247`) | no | `lo:-1`, `hi:1`, `freq:1log`, `duty:0.5[0,1]`, `phase:0[0,1]` | `lo`, `hi`, `onAttach` | `freq`, `duty`, `phase` | bipolar |
| `whiteNoise` (`:256-278`) | **yes** | `seed:1[1,9999]`, `lo:-1`, `hi:1` | `lo`, `hi`, `onAttach` | `seed` | bipolar |
| `valueNoise` (`:287-314`) | **yes** | `seed:1`, `lo:-1`, `hi:1`, `rate:1[0.01,20]log` | `lo`, `hi`, `onAttach` | `seed`, `rate` | bipolar |
| `perlin1D` (`:347-382`) | **yes** | `seed:1`, `lo:-1`, `hi:1`, `rate:1log` | `lo`, `hi`, `onAttach` | `seed`, `rate` | bipolar |
| `fbm` (`:395-444`) | **yes** | `seed:1`, `lo:-1`, `hi:1`, `rate:1log`, `octaves:4[1,6]`, `lacunarity:2[1.01,4]`, `gain:0.5[0.05,0.95]` | `lo`, `hi`, `onAttach` | `seed`, `rate`, `octaves`, `lacunarity`, `gain` | bipolar |
| `brown` (`:455-488`) | **yes** | `seed:1`, `lo:-1`, `hi:1`, `rate:1[0.01,50]log` | `lo`, `hi`, `onAttach` | `seed`, `rate` | bipolar (noise family) |
| `ramp` (`:497-515`) | **yes** | `rate:1[-10,10]`, `reset:0[0,1]` | none — **no lo/hi, no `onAttach` at all** | `rate`, `reset` | unbounded/unipolar-ish accumulator; doesn't naturally fit bipolar/unipolar signal contract — flagged as a design question, not resolved here |
| `smooth` (`:525-544`) | **yes** | `signal:0[-1000,1000]`, `tau:0.1[0.001,5]log` | none directly, but `onAttach: seedPassThroughFromHost(p.signal, host, {startAtHostValue:true})` | `signal` (as a filter input, not a generator), `tau` | N/A — filter/combinator, not a generator; combines nothing itself, just lowpasses one input |
| `add` (`:551-566`) | no | `a:0[-1000,1000]`, `b:0[-1000,1000]` | `onAttach: seedPassThroughFromHost` on both `a`,`b` | combinator — combines `a + b` | N/A — combinator |
| `mul` (`:571-584`) | no | `a:1[-1000,1000]`, `b:1[-1000,1000]` | `onAttach: seedPassThroughFromHost(p.a, host)` only | combinator — combines `a * b` (amplitude-modulate) | N/A — combinator |
| `lerp` (`:590-612`) | no | `a:0`, `b:1`, `t:0.5[0,1]` | `onAttach` seeds `a`/`b` pass-through + sets `p.a.dial.value=meta.min`, `p.b.dial.value=meta.max` (`:601-611`) | combinator — combines `a + (b-a)*t` | N/A — combinator |
| `clamp` (`:617-634`) | no | `signal:0`, `lo:0[-1000,1000]`, `hi:1[-1000,1000]` | `onAttach: seedPassThroughFromHost(signal) + seedRangeFromHost(lo,hi)` | — | **flagged for deletion** per brief (range-clamping combinator, obsoleted by slot-level `min`/`max` clamp in the new `output = clamp(base+depth·signal,min,max)` model) |
| `remap` (`:641-662`) | no | `signal:0`, `inLo:-1`, `inHi:1`, `outLo:0`, `outHi:1` | `onAttach: seedRangeFromHost(outLo,outHi)` | — | **flagged for deletion** per brief (range-remapping combinator, obsoleted by the new normalized-signal + depth model where sources are already in [-1,1]/[0,1] and don't need manual range conversion) |
| `gate` (`:675-694`) | no | `signal:0`, `closed:0`, `period:1[0.001,60]`, `lo:0[0,1]`, `hi:0.5[0,1]` | `onAttach: seedPassThroughFromHost` on `signal`,`closed`; **note: `gate`'s own `lo`/`hi` are the open/close *phase fractions* [0,1], NOT range-seeding lo/hi** — these are semantically different from the oscillator lo/hi and are NOT touched by `seedRangeFromHost` | all params — this `lo`/`hi` pair is timing config, not the deleted range apparatus | unipolar (gate output is `signal` or `closed`, a pass-through switch) |
| `phaseGate` (`:702-721`) | no | `signal:0`, `closed:0`, `lo:0[0,1]`, `hi:0.5[0,1]` | same note as `gate` — `lo`/`hi` here are phase-window fractions, unrelated to range-seeding | all params | unipolar |

**Important distinction the brief should note:** `gate`/`phaseGate`'s `lo`/`hi` params are named identically to the oscillators' range-seeding `lo`/`hi` but serve a completely different purpose (phase-window bounds in [0,1], never touched by `seedRangeFromHost`/`narrowHostMeta`). Do not delete these when removing the oscillator lo/hi apparatus — they're structurally unrelated despite the name collision. Brief's list of "unipolar: ramp/gate/phaseGate" is consistent with keeping `gate`/`phaseGate`'s own `lo`/`hi` as-is.

`STDLIB` array (`:729-748`) lists all 18 defs in registration order; `registerStdlib()` (`:754-756`) registers each — called once at `index.ts:24` on package import.

### The lo/hi apparatus — helpers to delete, with exact ranges

| Helper | Lines | Purpose | Called by |
|---|---|---|---|
| `seedRangeFromHost(loSlot, hiSlot, host)` | `packages\dials\src\stdlib.ts:73-84` | Seeds a source's `lo`/`hi` sub-slot values + their min/max/step UI metadata from the host slot's own `min`/`max`/`step` | `sine`(`:177`), `tri`(`:204`), `saw`(`:225`), `square`(`:246`), `whiteNoise`(`:277`), `valueNoise`(`:313`), `perlin1D`(`:381`), `fbm`(`:443`), `brown`(`:487`), `clamp`(`:632`), `remap`(`:661`) |
| `narrowHostMeta(host)` | `:86-93` | Extracts `{min,max,step?}` from `host.dial.meta`, returns `null` if `min`/`max` aren't both numbers or `max<=min` | `seedRangeFromHost`(`:79`), `seedPassThroughFromHost`(`:109`) |
| `seedPassThroughFromHost(passSlot, host, opts?)` | `:104-121` | Copies host's min/max/step onto a single pass-through sub-slot (e.g. `smooth.signal`, `clamp.signal`), optionally starts at host's current value or re-clamps existing value into new range | `smooth`(`:543`), `add`(`:563-564`, both `a`&`b`), `mul`(`:583`), `lerp`(`:602-603`, both `a`&`b`), `clamp`(`:631`), `gate`(`:691-692`), `phaseGate`(`:718-719`) |
| `inheritRangeMeta(slot, host)` | `:123-131` | Mutates a slot's `dial.meta.min`/`max`/`step` to match host's | `seedRangeFromHost`(`:82-83`), `seedPassThroughFromHost`(`:111`) |

All four helpers are private to `stdlib.ts` (not exported from `index.ts` — confirmed against `index.ts:74-95`'s re-export list, which only re-exports the source defs themselves, `STDLIB`, and `registerStdlib`). Deleting them requires stripping every `onAttach:` line listed in the "current lo/hi apparatus" column above (11 of the 18 stdlib sources reference `seedRangeFromHost` or `seedPassThroughFromHost` directly; `gate`/`phaseGate` reference only `seedPassThroughFromHost` on non-range params, still deletable under the new model since pass-through seeding is superseded by depth-based combining), plus every `lo`/`hi` **range-seeding** param on the 9 oscillator/noise sources (`sine`, `tri`, `saw`, `square`, `whiteNoise`, `valueNoise`, `perlin1D`, `fbm`, `brown`) and the `clamp`/`remap` combinators entirely.

Also note `getT`/`getDt`/`mulberry32`/`perlinFade`/`gradient1D` helpers (`:134-155`, `:325-337`) are unrelated to the lo/hi apparatus and are NOT part of the deletion — they're time/RNG/gradient math used inside bodies, independent of range-seeding.

---

## 7. React layer — `Panel.tsx` + `components.tsx`

### `NumberEditor` rendering condition

`Panel.tsx:153-159` (`SlotRow`'s `control` computation):
```
const control = attached ? (
  slot.outType === 'number' ? (
    <NumberEditor slot={...} onChange={onChange} />
  ) : null
) : (
  <SlotEditorView slot={slot} editors={editors} onChange={onChange} />
)
```
So `NumberEditor` renders in **both** branches for numeric slots — attached or not (comment at `Panel.tsx:148-152` confirms this is a recent, deliberate change: "Numeric slots keep their editor while a source is attached — the slider/knob shows the live modulated output... while drags still edit the slot's own dial"). Non-numeric attached slots render nothing in the `control` position (`:156`, `null`) — they collapse to the nested sub-panel only.

### `SliderProps` exact shape (`components.tsx:24-47`)

```ts
export interface SliderProps {
  value: number
  min: number
  max: number
  step: number
  scale?: 'linear' | 'log'
  onChange: (v: number) => void
  attached?: boolean   // true while a source is attached (added recently)
  live?: () => number | undefined   // accessor for slot.lastSample (added recently)
}
```
`attached` documented at `:31-37` — slider still edits the slot's own dial via `value`/`onChange`; a modulation-aware implementation restyles using `attached`+`live`. `live` documented at `:38-46` — read-only accessor, deliberately never itself samples (so polling from rAF can't advance stateful sources); `DefaultSlider` (`:118-152`) ignores both new props entirely and just renders a plain `<input type=range>`.

`NumberEditor` (`Panel.tsx:222-281`) constructs and passes these props at `:258-267`:
```ts
<c.Slider
  value={slot.dial.value}
  min={min} max={max} step={step} scale={scale}
  onChange={set}
  attached={slot.attached !== null}
  live={live}   // useCallback(() => slot.lastSample, [slot]), Panel.tsx:249
/>
```

### Where a bundle-level `sliderShowsValue?: boolean` flag would be consulted

**No such flag exists today.** `PanelComponents` (`components.tsx:100-109`) has no boolean config fields — it's purely a map of component-type slots (`Slider`, `NumberField`, `LerpControl`, `Dropdown`, `HelpTooltip`, `Row`, `Heading`, `AttachControl`). A new `sliderShowsValue?: boolean` would need to be added to this interface (`:100-109`) and read either in `NumberEditor` (`Panel.tsx:222-281`, e.g. to conditionally render `<c.NumberField>` at `:268-275` alongside/instead of the slider) or passed down as a prop into `SliderProps`/`NumberFieldProps` — no existing consultation site to point to; this is new plumbing, not a rewire.

### Attach picker rendering

`Panel.tsx:127-134` builds `attachPicker`:
```ts
const attachPicker =
  candidates.length > 0 || attached ? (
    <c.AttachControl slot={slot} candidates={candidates} onChange={onChange} />
  ) : null
```
where `candidates = sourcesForType(slot.outType)` (`:110`). Default implementation `DefaultAttachControl` (`components.tsx:267-296`): single `<Dropdown>` (routed through context, `:271`) with options `[{value:'',label:'none'}, ...candidates]` (`:274-277`); on change, empty string → `detach(slot)` (`:284`); non-empty differing from current → `detach(slot)` then `attachFrom(slot, def)` (`:286-291`, "detach first so the new attach starts from clean factory defaults via onAttach" — this detach-then-reattach-on-swap pattern is itself dependent on the current `onAttach` seeding model and will need reconsidering once `onAttach` is deleted).

### Nested source sub-panel

`Panel.tsx:161-173`: when `attached` is truthy, renders a `<div data-dials-source={attached.def.name}>` wrapping one `<SlotRow>` per entry in `Object.entries(attached.params)` — i.e. the source's own sub-params recurse through the exact same `SlotRow` renderer, unbounded depth (per file header `:9-10`). Under the `{source, depth}` wrapper redesign, every `attached.X` here (`attached.def.name` `:162`, `attached.params` `:163`) becomes `attached.source.X`.

---

## 8. Tests inventory — `packages/dials/test/*`

| File | Total `describe`/`it` blocks (approx.) | Asserts absolute-range / lo-hi-seeding / source-replaces-output (breaks under redesign) | Model-agnostic (survives) |
|---|---|---|---|
| `attach.test.ts` | 4 describes, 9 its | `describe('attach()')` "drives the slot via the attached source" (`:28-33`) and `describe('detach()')` "drops the source and reveals the underlying dial value" (`:61-68`) assert pure source-replaces-output semantics — **break** under combine model (output would be `base ± depth·signal`, not raw `42`). `attachFrom()` `s.attached toBe(src)` (`:50`) breaks if `.attached` becomes a wrapper object. | outType-mismatch throw tests (`:35-38, 54-57`), chaining-returns-slot (`:40-43`), dial-value-preserved-across-cycle (`:70-76`), no-op-on-unattached (`:78-83`), typed-dial attach (`:86-92`) are model-agnostic (though `.attached` direct-compare at `:66,82` needs the wrapper-aware update noted in §2). |
| `dial.test.ts` | 3 describes, 8 its | None — no source/attach content at all. | Fully model-agnostic (pure `dial()`/`setDial()`/`typedDial()` tests). |
| `json.test.ts` | 4 describes, ~11 its | `toJSON()` "snapshots an attached source with its sub-slot values" (`:31-53`) hardcodes the current `SourceSnap` shape (`{name, params}`, no `depth`) — **breaks** (needs `depth` in expected object) once §4's schema change lands. `fromJSON()` "round-trips an attached source" (`:74-89`) and "survives JSON.stringify/parse" (`:120-129`) assert `.attached` is the bare source (`fresh.freq.attached!.def.name`, `:86`) — **breaks** under the `{source,depth}` wrapper (needs `.attached!.source.def.name`). Nested modulation depth-2 test (`:55-64`) similarly reads `snap.freq?.attached?.name` — shape changes to `.attached?.depth`+`.attached?.source.name`-equivalent once `SourceSnap` gains depth (exact new key name is a design decision, not yet fixed). | "detaches when snapshot has no attached field" (`:91-96`), "throws on unregistered source" (`:98-106`), "leaves missing keys at default" (`:108-112`), "ignores extra keys" (`:114-118`), custom-registered-source round-trip (`:132-149`, though its `.attached!.params.v...` at `:143,147` needs the same wrapper hop) are largely mechanical shape updates rather than semantic breaks — the *serialization protocol* (recurse into params, look up by name) is unchanged, only the envelope gains a field. |
| `sample.test.ts` | 6 describes, ~22 its | `read()` "reflects attach/detach on next read" (`:62-71`) asserts `read(params,{}).v` toBe **exactly** the source's raw output (100) and exactly the dial value (7) on detach — **breaks**, becomes `base + depth*signal`-shaped once combine lands; also direct-writes `params.v.attached = null` (`:69`) which needs wrapper awareness. `sampleSlot()` "returns source output when one is attached" (`:114-120`) same raw-replace assumption — **breaks**. | "nested modulation" describe (`:74-107`, depth-2/depth-5/mutation-propagation) tests the recursive *sampling mechanism* not the replace-vs-combine semantics — survives if reinterpreted (the chain still resolves the leaf value the same way; only the top-level combine step changes) — borderline, flag for implementer attention. `meta.lerp smoothing` describe (`:123-182`, 8 its) is entirely dial-branch behavior, untouched by the source-side redesign. `lastSample stash` describe (`:184-221`, 6 its) — "records the source output (not the dial value) when attached" (`:195-203`) currently asserts `lastSample` equals the *raw* source output; under combine model `lastSample` would hold the *combined* output instead — **breaks** in expected value, not in mechanism. |
| `source.test.ts` | 3 describes, ~11 its | None reference lo/hi or range-seeding or `onAttach` at all — this file only exercises `defineSource`/`defineStatefulSource`/`instantiate`/registry, all of which are structurally unaffected (a `polarity` field is additive here). | Fully model-agnostic. |
| `stdlib.test.ts` | 15 describes (one per source, roughly), ~50 its | Every oscillator/noise describe (`sine`, `tri`, `saw`, `square`, `whiteNoise`, `valueNoise`, `perlin1D`, `fbm`, `brown`) sets explicit `lo`/`hi` param overrides and asserts outputs land inside `[lo,hi]` (e.g. `:41-56, 61-79, 82-88, 90-95, 97-129, 131-147, 264-325, 327-381, 383-417`) — **all break** once `lo`/`hi` params are deleted from these sources; the whole file's `once()` helper (`:26-36`) sets params by literal key name including `lo`/`hi`, so every such call site needs rewriting to the new normalized-signal contract. `clamp` describe (`:205-215`) and `remap` describe (`:217-227`) test sources **flagged for deletion** — these describes are removed outright, not adapted. | `ramp` (`:149-165`), `smooth` (`:167-189`), `add`/`mul`/`lerp` (`:191-203`, though note these three combinators may also change shape depending on how "combine" is redefined for combinator sources specifically — flag), `gate`/`phaseGate` (`:229-262`, their `lo`/`hi` are phase-window params, unrelated to deletion) are structurally closer to model-agnostic, modulo whatever param renames ripple through. |

**Aggregate**: `stdlib.test.ts` is the file with the largest blast radius (roughly 9 of ~15 source describes directly assert lo/hi-seeded absolute-range behavior, plus 2 describes for sources being deleted entirely). `sample.test.ts` and `json.test.ts` each have a handful of specific its asserting replace-not-combine semantics. `attach.test.ts` has 2 semantically-breaking its plus several needing the `.attached.source.X` wrapper hop. `dial.test.ts` and `source.test.ts` are unaffected.

---

## 9. `phosphor-dials` + `phosphor` consumers

### `packages/phosphor-dials/src/KnobSlider.tsx`

Full file is 94 lines; conforms phosphor's `Knob` to dials' `SliderProps` (`:1-28` header, `:34-93` implementation).

**rAF poll + swing-accumulator (lines to be replaced):** `:43-79`.
- State: `liveSample` (`:43`), `band` (`:44`), `swing` ref `{lo,hi} | null` (`:46`).
- `useEffect` at `:56-79`, keyed on `[attached, live]` (`:79`):
  - Resets `swing.current = null` and `setBand(undefined)` on every effect run (`:57-58`).
  - Early-return path when not attached: `setLiveSample(undefined)`, no rAF started (`:59-62`).
  - Otherwise starts an rAF loop (`:63-77`): each tick calls `live()` (`:64`), `setLiveSample(s)` (`:65`), and if `s !== undefined` grows `swing.current` min/max (`:67-72`) and publishes `band` once `hi > lo` (`:73`).
  - Cleanup cancels the rAF (`:78`).
- Consumption: `:81-92` — `riding = attached && liveSample !== undefined` (`:81`); renders `<Knob value={riding ? liveSample : value} baseline={value} band={riding ? band : undefined} ... />` (`:83-91`).

This entire poll+accumulate mechanism exists **because** the current model has no analytic band — the only way to know the modulation's swing extent is to observe samples over time. Under `band = [base − depth, base + depth]`, `band` becomes a pure function of `(base, depth)` available synchronously from the slot's own state — no rAF, no accumulator, no `liveSample`/`swing` state needed at all. The `live()` polling for the *pointer/fill-arc position* (i.e., `value={riding ? liveSample : value}`, `:84`) is a separate concern from the band and may still be needed post-redesign if the Knob is meant to visually ride the live combined output — that's a design decision, not resolved here, but the band-specific accumulator code (`:44,46,58,67-73`) is unambiguously superseded.

### `packages/phosphor/src/primitives/Knob.tsx`

**Pointer-event handling — which buttons:**
- `onDown` (`:179-187`): `if (e.button !== 0) return` (`:181`) — **only left-button (button 0)** is handled; all other buttons (right=2, middle=1) are no-ops today. `onContextMenu` is explicitly suppressed via `e.preventDefault()` (`:297`), which currently only prevents the browser context menu with no replacement behavior wired to right-click.
- `onMove` (`:189-198`) and `onUp` (`:200-207`) — unconditional on button (rely on `drag.current` gate, which is only set by `onDown` for button 0).
- **Where a right-button depth drag would hook in:** `onDown` (`:179-187`) is the natural insertion point — a `e.button === 2` branch alongside the existing `e.button !== 0 → return` check, likely starting a separate `depthDrag` ref (parallel to `drag`, `:137`) rather than reusing `drag.current` since baseline-drag and depth-drag need independent state if both gestures should be resumable. `onMove`(`:189-198`)/`onUp`(`:200-207`) would need parallel `if (depthDrag.current)` branches. `onContextMenu`'s existing `preventDefault` (`:297`) already suppresses the native menu, so no change needed there — right-click-drag can already fire pointer events freely.

**150px / 0.15× shift-fine drag convention:** `onMove` (`:189-198`):
```ts
const dy = drag.current.y - e.clientY
const fine = e.shiftKey ? 0.15 : 1
const next = drag.current.v + (dy / 150) * fine
setBaseline(fromPos(next))
```
`150` (px for full position-space traversal) and `0.15` (shift fine multiplier) are both literal at `:194,193`. A depth-drag would reuse this exact convention (same `150`, same `0.15`) per the brief's "existing 150px/0.15× convention" framing — no separate constants exist elsewhere in the file for this (confirmed: only one `150` and one `0.15` literal in the file, both here).

**`band` prop path to arc rendering:** `KnobProps.band?: [number, number]` (`:26`, doc comment `:19-25` — already describes exactly the semantics needed: "white inlay arc... spanning `[band[0], band[1]]`... under the lit fill... Ends are clamped to `range`... mapped through the same linear/log scale... zero-width or inverted band renders nothing"). Consumption: `:271-273` computes `bandLo = clamp(toPos(band[0]),0,1)`, `bandHi = clamp(toPos(band[1]),0,1)`, `showBand = band !== undefined && bandHi > bandLo`; rendered at `:312-321` as a `<path className="chrome-knob-band">` using `arcPath(TRACK_R, A0 + bandLo*(A1-A0), A0 + bandHi*(A1-A0))`, layered between the track (`:310`) and the fill arc (`:322-325`, comment at `:99` "under the lit fill so the accent sweeps over it"). **This whole path is already generic and needs no change** — feeding it `[base-depth, base+depth]` instead of an observed min/max is purely a call-site change in `KnobSlider.tsx`, not a `Knob.tsx` change.

### `packages/phosphor-dials/src/index.ts`

Bundle registration: `dialPanelComponents` (`:49-60`) maps `Slider: KnobSlider` (`:50`), plus `NumberField`, `Dropdown`, `HelpTooltip`, `Row`, `Heading`, `LerpControl` from phosphor/local, and `AttachControl: defaultPanelComponents.AttachControl` (`:59`, explicitly reused unstyled since its logic — detach+reattach on swap — is styling-independent). No other bundle members reference sources/attachment directly.

### NumberField / "LCD removal" — does not apply as briefed

Searched `packages/phosphor/src` for any LCD-named component — **none exists**. The relevant chrome-styled numeric display is `packages\phosphor\src\primitives\NumberField.tsx` (68 lines, full file read) — a `<input type="number">` wrapped in a `chrome-numberfield` span (`:44-64`), used inside `dialPanelComponents` (`phosphor-dials\src\index.ts:22-25,51`). It is a plain numeric text field, styled to look like a recessed digital readout (doc comment `:20-26`), not a separate "LCD" component and not obviously slated for removal by anything read in this recon — **flag this as a mismatch with the brief's assumption**; if "LCD removal" refers to something else (e.g. a planned deletion of `NumberField` from the numeric-slot row entirely, or a `sliderShowsValue`-style toggle hiding it), that intent isn't present in the current source and needs clarifying with whoever wrote the brief.

---

## 10. Storybook touchpoints

### `apps/docs/src/stories/phosphor-dials-Panel.stories.tsx` (79 lines, full file read)

- `Default` story (`:28-32`): static `synthDials` (`freq`/`amp`/`detune`, `:22-26`), no attachment — unaffected by the redesign except insofar as slider/knob defaults change globally.
- `modDials` (`:34-40`) + `LiveModulationPanel` (`:48-66`) + `WithModulation` story (`:76-78`): the modulation-specific story. Runs its own rAF host loop calling `read(modDials, {t,dt})` (`:49-58`) to populate `lastSample`, mirroring the "host app" pattern the doc comment at `:43-47` describes. Doc comment at `:68-74` explicitly describes today's replace semantics: "the knob stays put, riding the live modulated value while drags keep editing the base dial the slot returns to on detach" — this comment needs rewriting once the model is additive (`base + depth·signal`) rather than replace. No `depth` UI exists yet for the user to adjust from this story.

### `apps/docs/src/stories/Knob.stories.tsx` (137 lines, full file read)

- `Default`/`LogScale`/`Stepped` stories (`:17-84`) don't touch `band` or modulation — unaffected.
- `Modulated` story (`:93-136`) is the one that exercises `band`: today it **hand-simulates** a swing band by computing `center = clamp(baseline, HALF, 1-HALF)` and `band = [center-HALF, center+HALF]` (`:106-107`) directly in the story, entirely independent of dials' package — this is a standalone demonstration of `Knob`'s `band` prop, not wired through `KnobSlider`/dials at all. Under the redesign, this story could be simplified/left as-is since it's already doing exactly `[base-depth, base+depth]`-shaped math manually (`HALF` here is literally a fixed depth) — the doc comment at `:87-91` ("`band` = its [min,max]") should be updated to describe it as `[baseline-depth, baseline+depth]` framing for consistency, but the story's actual behavior needs no code change.

No other files under `apps/docs/src/stories/` reference `attach`, `source`, `modulat`, `Knob`, or `Slider` per the targeted greps (`Panel.stories.tsx`, `SidePanel.stories.tsx` were listed by the directory scan but returned no matches for those terms and were not read in full).

---

## Surprises / mismatches with the brief's assumptions

1. **No `LCD` component exists** in `packages/phosphor/src/primitives/` or anywhere searched. The numeric display is `NumberField.tsx`, a chrome-styled `<input type="number">`. "LCD removal" as framed in the brief doesn't map onto anything in the current source — needs clarification.
2. **No `sliderShowsValue?: boolean` flag exists** on `PanelComponents` or anywhere in `components.tsx`/`Panel.tsx` today — this is new plumbing to add, not an existing consultation site to relocate.
3. **`gate`/`phaseGate` have their own unrelated `lo`/`hi` params** (phase-window fractions, [0,1]) that collide in name only with the oscillator range-seeding `lo`/`hi`. These must NOT be deleted when removing the lo/hi apparatus — the brief's own framing ("ramp/gate/phaseGate → unipolar") is consistent with keeping them, but the naming collision is worth flagging explicitly since a naive grep-and-delete on "lo/hi params" would wrongly hit these too.
4. **`onAttach` has exactly one call site** in the whole package (`attach.ts:49-51`, inside `attachFrom`) — deletion is a single-site removal plus removing the field from `SourceDef`/`DefineSourceArgs`/`DefineStatefulSourceArgs` (`core.ts`, `source.ts`) and every `onAttach:` line in `stdlib.ts` (11 of 18 sources).
5. **`attachFrom` returns the `Source`, not the `Slot`** (`attach.ts:53`) while `attach` returns the `Slot` (`attach.ts:29`) — an existing asymmetry unrelated to the redesign but relevant if the new depth-aware attach functions' signatures are being unified.
6. **`ramp`'s natural polarity doesn't cleanly fit bipolar/unipolar** — it's an unbounded accumulator (no lo/hi, no onAttach at all today) whose classification the brief doesn't clearly resolve; flagged as a design question for the implementer rather than assumed here.
7. **The `DefaultAttachControl`'s detach-then-reattach-on-swap pattern** (`components.tsx:284-291`, "detach first so the new attach starts from clean factory defaults via `onAttach`") is itself written in terms of the `onAttach` mechanism being deleted — its rationale comment will be stale and its behavior (whether swapping sources should preserve `depth`) is an open design question.
