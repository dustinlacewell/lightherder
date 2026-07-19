# Knob-port recon: crest-animated → phosphor

Facts only. Gathered by reading source directly in both repos on 2026-07-18. No recommendations below — see "Open questions" for the forks the implementer/user must resolve.

All paths below are relative to their repo root unless given in full. crest-animated root: `D:\code\demos\crest-animated`. Monorepo root: `d:\code\demos\viz`.

---

## 1. crest-animated UI kit inventory

### `Knob` — `src/ui/Knob.tsx` + `Knob.css`

**Purpose.** Round knob with a 270° arc, drawing up to four concentric layers: track, variation (modulation) band, baseline pip, live-value tick. Renders a numeric readout inside the dial and a caption label below it.

**Prop API** (all in one object param):
```ts
{
  value: number;                          // live resolved value — drives the live tick
  baseline: number;                       // user-set value — drives the baseline meter
  volatility?: number;                    // [0,1], default 0 — modulation amount
  speed?: number;                         // [0,1], default 0 — LFO speed
  range: [number, number];                // required
  polarity?: "unipolar" | "bipolar";      // default "unipolar" — NOTE: dead prop, see below
  onChangeBaseline: (v: number) => void;  // required
  onChangeVolatility?: (v: number) => void;
  onChangeSpeed?: (v: number) => void;    // when set, wheel tunes speed not baseline
  size?: number;                          // default 72
  label?: string;
  unit?: string;
  displayScale?: number;                  // default 1 — multiplies displayed value only (e.g. 1000 for ‰)
  tab?: ReactNode;                        // absolutely-positioned slot inside the dial (mod-cycle button)
  wrap?: boolean;                         // default false — wrap-style param (e.g. hue); affects variation-band centering math
}
```
`polarity` is accepted but explicitly a no-op on the visual (`void polarity;   // polarity no longer affects the visual; kept for prop-shape compatibility` — Knob.tsx line 141). Bipolar fill-from-center behavior lives only in `Slider`, not `Knob`.

**Interaction model.**
- Left pointer-drag (button 0): vertical drag sets `baseline`. 200px of drag = full `range` span. Shift = 0.25× (finer).
- Right pointer-drag (button 2, only if `onChangeVolatility` supplied): vertical drag sets `volatility` in [0,1], same 200px/shift scaling. Right-click context menu is preventDefault'd.
- Pointer capture used on down; released on up/cancel.
- Wheel: if `onChangeSpeed` is provided, wheel nudges `speed` by ±0.02 (±0.005 with shift) per notch, clamped [0,1]; otherwise wheel nudges `baseline` by ±0.02×span (±0.005×span with shift). Wheel handler is a native, non-passive `wheel` listener added via `useEffect` (not React's synthetic onWheel) specifically so `preventDefault`+`stopPropagation` can suppress the canvas's own zoom-on-wheel handler.
- No keyboard handling (no arrow-key, no Home/reset, no tabIndex) — contrast with herder's Knob (below), which has full keyboard support.
- No double-click reset.

**Visual/geometry.** SVG, 270° sweep from 135° to 45° (i.e., 7 o'clock to 5 o'clock, leaving a 90° gap at the bottom for the mod-toggle button). Track radius `r = size/2 - 10`; outer halo radius `r + 6` for the variation band. Live tick and baseline pip are short radial line segments at ±4px / ±6px from `r`.

**CSS classes** (Knob.css): `.ui-knob-wrap` (flex column, dial + caption), `.ui-knob` (circular glass-morphic surface: radial-gradient highlight + `--ui-bg` glass fill, `backdrop-filter: blur(var(--ui-blur))`, border `--ui-edge`, hover → `--ui-edge-strong`, `.mod` modifier → border tints to `rgba(255,208,137,0.35)`), `.ui-knob-svg`, `.ui-knob-track` (stroke `--ui-edge`), `.ui-knob-variation` (stroke `--ui-accent-mod` at 0.5 opacity), `.ui-knob-tick` (stroke `--ui-accent`, drop-shadow glow), `.ui-knob-baseline` (stroke `rgba(255,255,255,0.7)`), `.ui-knob-readout`, `.ui-knob-value` (font `--ui-fs`/`--ui-mono`, color `--ui-fg`), `.ui-knob-caption` (font `--ui-fs-xs`, color `--ui-fg-mute`, uppercase).

**Coupling.** Knob.tsx itself imports nothing from crest's param system — it's pure props-in, callbacks-out, plus one CSS import (`./Knob.css`, which itself references `tokens.css` custom properties assumed to be in scope via `#cockpit`). Fully liftable as-is. All param/LFO coupling lives one layer up in `ParamWidget.tsx`'s `ScalarKnob`, not in `Knob.tsx`.

### `Slider` — `src/ui/Slider.tsx` + `Slider.css`

**Purpose.** Horizontal slider with the same two-mode (plain / modulated) semantics as Knob, using a linear axis instead of an arc.

**Prop API:**
```ts
{
  value: number;                          // live resolved value
  baseline?: number;                      // defaults to `value` if omitted (plain-slider mode)
  volatility?: number;                    // default 0
  range: [number, number];
  step?: number;
  polarity?: "unipolar" | "bipolar";      // default "unipolar" — DOES affect fill origin here (0.5 vs 0)
  onChange: (v: number) => void;          // baseline setter
  onChangeVolatility?: (v: number) => void;
  height?: number;                        // default 28
}
```

**Interaction.** Left-drag (button 0) sets baseline by horizontal position (`(clientX - rect.left) / rect.width`, clamped [0,1], mapped into `range`, snapped to `step` if given) — fires immediately on pointerdown too. Right-drag (button 2, only if `onChangeVolatility` given) sets volatility by horizontal drag *delta* (not absolute position) over the track width. Pointer capture on down, released on up/cancel. Right-click context menu suppressed. No wheel handling, no keyboard handling.

**Visual layers:** `.ui-slider-track` (recessed rail), `.ui-slider-variation` (thick faint band centered on baseline, width = `volatility`, only when `volatility>0 && onChangeVolatility` set), `.ui-slider-fill` (bright meter from `fOrigin` — 0 for unipolar, 0.5 for bipolar — to baseline; turns `--ui-accent-mod` colored when modulated), `.ui-slider-thumb` (circular puck at baseline position; also turns accent-mod colored when modulated), `.ui-slider-tick` (small bright vertical pip at the live resolved value, shown only `isModulated`).

**CSS tokens used:** `--ui-edge`, `--ui-accent-mod`, `--ui-accent`, `--ui-fg`.

**Coupling.** None — pure props/callbacks, same as Knob.

### `Toggle` / `Segmented` / `Stepper` — `src/ui/Toggle.tsx` + `Toggle.css`

Three separate exported components in one file:
- **`Toggle`**: `{ value: boolean; onChange: (v:boolean)=>void; labelOn?: string ("ON"); labelOff?: string ("OFF") }`. Renders a `<button>` with a track+thumb pill plus a text label that swaps between `labelOn`/`labelOff`. Click-only toggle (no drag).
- **`Segmented<T extends string>`**: `{ value: T; onChange: (v:T)=>void; options: readonly {value:T; label:string}[] }`. Row of buttons, one marked `.on`. Used by `LfoControls` for Mode (fixed/modulated) and Shape (drift/wave).
- **`Stepper`**: `{ value:number; min:number; max:number; onChange:(v:number)=>void; label?:string }`. −/+ buttons around a numeric readout, clamped to [min,max], step of exactly 1. Used in Cockpit for `K` and `Depth` (non-modulatable structural values).

All three are click/button-only, no drag, no wheel, no keyboard beyond native button semantics. Classes: `.ui-toggle`, `.ui-toggle-track`, `.ui-toggle-thumb`, `.ui-toggle.on`; `.ui-segmented`, `.ui-segmented-btn`, `.ui-segmented-btn.on`; `.ui-stepper`, `.ui-stepper-btn`, `.ui-stepper-value`. Tokens: `--ui-fg-dim`, `--ui-bg-2`, `--ui-edge`, `--ui-accent-mod`, `--ui-bg-1`, `--ui-radius-sm`, `--ui-fs-sm/-xs/-lg`. No param-system coupling.

### `Popover` — `src/ui/Popover.tsx` + `Popover.css`

**Purpose.** Click-anchored floating panel, portaled to `#cockpit` (fallback `document.body`).

**Prop API:**
```ts
{
  open: boolean;
  anchor: DOMRect | null;
  onClose: () => void;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";   // default "top"
}
```

**Interaction.** Positions itself relative to `anchor` (assumes a fixed expected size `W=280, H=200` for the CSS-clamped popover, then clamps final position to stay 8px inside the viewport). Closes on outside `mousedown` (listener attached via a `setTimeout(...,0)` to dodge the same click that opened it) or `Escape` keydown. Stops propagation of its own `pointerdown` so inner drags (e.g. a Slider inside it) don't bubble to the outside-click closer.

**CSS:** `.ui-popover` (fixed position, `--ui-bg-0` background, heavy blur+saturate, border `--ui-edge-strong`, drop-in keyframe animation), `.ui-popover-row` (flex row: label + control), `.ui-popover-title`.

**Coupling.** None direct — pure DOM/portal logic. Assumes `#cockpit` exists as the portal root when mounted inside the cockpit (falls back gracefully to `document.body` otherwise).

### `Panel` / `Cluster` — `src/ui/Panel.tsx` + `Panel.css`

`Panel`: `{ title?:string; children:ReactNode; className?:string; compact?:boolean }` — glass-morphic chrome (blur, border, shadow, optional title bar) wrapping children in `.ui-panel-body` (flex column, gap 10px). `compact` shrinks padding/radius.
`Cluster`: `{ children:ReactNode; className?:string }` — flex row, `align-items:center`, `gap:12px`, `flex-wrap:wrap`. Pure layout, no state, no param coupling.

### `ParamWidget.tsx` (no own CSS export — styles in `ParamWidget.css`)

This is the **binding layer** between crest's `Param` model and the presentational widgets above — not a single component but a module of adapters and composite widgets:

- **Cycle helpers** `cycleScalar(p)` / `cycleCell(p, i)`: clicking the knob's mod-tab button cycles `fixed → modulated(drift) → modulated(wave) → fixed`. First transition into modulated auto-bumps `volatility` to `DEFAULT_VOLATILITY = 0.3` if it was 0, "so the cycle never looks like a no-op."
- **Glyph/class/style helpers**: `tabGlyph(mode, shape)` → `"·"` fixed, `"~"` drift, `"∿"` wave. `tabClass(mode, shape)` → `""`/`" mod-drift"`/`" mod-wave"`. `tabStyle(speed)` → sets CSS var `--ui-speed` inline so the tab's glow scales with LFO speed via CSS.
- **Adapters** `scalarAdapter(p)`, `cellAdapter(p,i)`, `arrayAdapter(p)`: each normalizes a `ScalarParam | ColorParam | ScalarArrayParam` (or one cell of an array) into the uniform `{ mode, lfo, setMode, setLfo }` shape that `LfoControls` consumes. This is the single adapter surface — "the four variations of 'what is being modulated' plug in through a tiny adapter."
- **`ScalarKnob({ param: ScalarParam, size?, unit?, displayScale? })`**: renders one `Knob`, wired directly to `param.value/baseline/lfo.volatility/lfo.speed/range/polarity/wrap`; the knob's `tab` prop is a mod-cycle button. `onChangeBaseline` sets `param.baseline` (and mirrors into `param.value` if currently fixed); `onChangeVolatility` auto-flips `mode` to `"modulated"` if turning volatility up from a fixed state; `onChangeSpeed` sets `param.lfo.speed`. Every mutation ends with `commitParam("bake")`.
- **`ScalarSlider({ param: ScalarParam, unit?, width? })`**: renders label + mod-tab button (opens a `Popover` with `LfoControls`) + a `Slider` wired the same way as ScalarKnob.
- **`CellModControls({ param: ScalarArrayParam, index, label? })`**: thin `LfoControls` wrapper via `cellAdapter` for one array cell.
- **`ColorChip` / `ColorPopover`**: swatch button showing live color; popover has an `<input type="color">` bound to `param.baseline` (RGB↔hex conversion) plus `LfoControls` via `scalarAdapter`.
- **`ScalarArrayStack({ param: ScalarArrayParam, orientation? })`**: a stack of per-cell `Slider`s (one row per array element) plus a popover with array-wide `LfoControls` via `arrayAdapter`.
- **`ParamWidget({ param, size? })`**: generic dispatcher — `kind==="scalar"` → ScalarKnob, `kind==="color"` → ColorChip, else → ScalarArrayStack.

**Coupling.** Imports `ColorParam, Param, ScalarArrayParam, ScalarParam` from `../config` (re-exported types), `LfoConfig, ParamMode` from `../params`, `LfoShape` from `../lfo`, and `commitParam, useParam` from `./useParam`. This file is the least portable piece — it directly mutates crest's mutable `Param` objects (`p.mode = m`, `p.lfo.volatility = v`, etc.) and calls `commitParam("bake")` (which calls `fireConfig("bake")` from `../config`) after every edit. None of this generic React-state pattern; crest uses direct object mutation + a manual re-render signal (see `useParam` below). Lifting `ParamWidget` standalone requires either the whole `Param`/`LfoConfig` model or a rewrite of every adapter/mutation site.

### `LfoControls.tsx` (styles reuse `ParamWidget.css` `.ui-popover-*` classes; no own CSS file)

**Purpose.** The single, shared "configure this param's modulation" block, rendered inside every popover (scalar knob, scalar slider, color, array).

**Prop API:**
```ts
{
  title?: string;
  mode: ParamMode;                         // "fixed" | "modulated"
  lfo: LfoConfig;
  setMode: (m: ParamMode) => void;
  setLfo: (patch: Partial<Pick<LfoConfig, "shape"|"speed"|"volatility">>) => void;
}
```
Renders (via `Segmented` + `Slider`, reused primitives): Mode segmented (Fixed/Modulate), Shape segmented (Drift="value-noise"/Wave="sum-of-sines"), Speed slider (range [0,1], step 0.01), Amount slider (range [0,1], step 0.01, drives `lfo.volatility`). Every control's `onChange` calls the corresponding setter then `commitParam("bake")`.

**Coupling.** Imports `Slider`, `Segmented`, `commitParam`, and the `LfoConfig`/`ParamMode` types from `../params`. Structurally this is the reusable piece (given any object exposing `{mode, lfo, setMode, setLfo}` it works), but it's typed directly against crest's `LfoConfig`/`ParamMode` shape, so porting it standalone means either porting those types too or re-typing the props to something generic.

### `useParam.ts`

Not a UI component — a tiny React/render bridge:
- `useParam(_p: Param): number` / `useFrame(): number`: both call `useFrameTick()`, which subscribes to a single shared `requestAnimationFrame` loop (module-level `Set` of subscribers, RAF started lazily on first subscriber, cancelled when the set empties) and forces a re-render every frame by bumping local state. The `Param` argument is accepted only for call-site legibility — its value is never read here.
- `commitParam(kind: "bake"|"world" = "bake")`: calls `fireConfig(kind)` from `../config` — crest's render/bake pipeline trigger.

**Coupling.** Only import is `fireConfig` from `../config`. This RAF-fan-out pattern ("every param-driven widget subscribes to one shared RAF, not N of them") and the `commitParam("bake"|"world")` two-tier invalidation model are crest-specific; a port would need an equivalent app-level "something changed, re-render / re-bake" signal, but the pattern itself (shared RAF subscription) is generic and self-contained if lifted as-is.

### `RootHueRing` — `src/cockpit/RootHueRing.tsx` + `.css`

**Purpose.** Per-K hue knob: visually a Knob but with a full 360° rainbow ring drawn as 60 discrete `hsl()`-colored arc segments instead of a single-color track, plus a wedge marker showing the hue-spread slice this index owns. Interaction model is declared to intentionally mirror Knob's exactly (same left/right-drag, wheel, and center-click-to-cycle semantics), but it is a **separate, non-shared implementation** — it does not render `<Knob>` internally; it reimplements the SVG arc math, drag handlers, and wheel handler from scratch against `ScalarArrayParam`/cell-index semantics instead of Knob's generic value/baseline/volatility props.

**Prop API:**
```ts
{ hues: ScalarArrayParam; spread: ScalarParam; index: number; size?: number /* default 76 */ }
```

**Interaction:** left-drag → hue baseline (200px = 360°, *wraps* via modulo rather than clamping); right-drag → volatility (200px = 1.0, clamped, auto-enables modulation like Knob); wheel → LFO speed only when already modulated (no baseline-nudge fallback, unlike Knob); center-click on the embedded mod-tab button cycles fixed→drift→wave→fixed via `cycleCell`.

**Visual layers (z-order, per its own docblock):** 1. variation band (outer arc) 2. 60-segment rainbow ring (the track, replacing Knob's single-color track) 3. wedge marker (inner arc, structural/neutral, shows hue-spread slice) 4. live tick 5. baseline pip (shown only when modulated). The mod-tab button is repositioned dead-center (`.cp-rh-ring .ui-param-tab` overrides `top/left/bottom/right` + `transform`) because the full-360° rainbow leaves no perimeter gap to park it in, unlike Knob's bottom-gap slot.

**Coupling.** Imports `cycleCell, tabClass, tabGlyph, tabStyle` from `../ui/ParamWidget`, `commitParam, useFrame` from `../ui/useParam`, types from `../params`. Directly mutates `hues.baseline[index]`, `hues.modes[index]`, `hues.lfos[index].volatility/.speed`. Reuses `.ui-knob-variation`, `.ui-knob-tick`, `.ui-param-tab` classes from Knob.css/ParamWidget.css (cross-file class reuse) plus its own `cp-rh-*` classes for the rainbow/wedge/baseline-pip specifics.

`RootHueStack({ hues, spread })`: vertical list wrapper rendering one `RootHueRing` per array index (`K = hues.baseline.length`).

### `Cockpit.tsx` / `mount.tsx` / `cockpit.css`

Application-shell composition, not a reusable widget: lays out `LeftRail` (Structure panel with `Stepper`s → `RootHueStack` → rootHueSpread `ScalarKnob` → Motion panel), `FrequenciesPanel` (`ScalarArrayStack`), `ColorPanel` (six `ScalarKnob`s in a `Cluster`), plus a global `H`-key hide toggle and a help-hint footer bar. `mount.tsx` is the React-root bootstrapper: imports `tokens.css` and `cockpit.css` globally, then `createRoot(#cockpit).render(<Cockpit/>)`. Confirms the `#cockpit` DOM id is load-bearing (pointer-events gating in tokens.css, Popover's portal target).

### Param/LFO model consumed by the above (`src/params.ts`, `src/lfo.ts`)

Types: `ParamMode = "fixed" | "modulated"`. `LfoConfig = { shape: LfoShape; speed: number; volatility: number; seed: number; phase: number }`. `LfoShape = "value-noise" | "sum-of-sines"`.

`ScalarParam`: `{ kind:"scalar"; id; label; range:[number,number]; step?; wrap?; polarity?:"unipolar"|"bipolar"; baseline:number; mode:ParamMode; lfo:LfoConfig; value:number; defaults:ScalarDefaults }`. `value` is a per-frame **resolved/derived** field ("Don't write to this directly" — comment in source); `baseline` is the user-set anchor. `ColorParam` and `ScalarArrayParam` follow the same `baseline`/`mode`/`lfo`/`value` split (array variant has per-cell `modes[]` and `lfos[]`, plus one aggregate `mode` kept in sync as a derived "any cell modulated" flag).

Resolution (`resolveScalar`/`resolveColor`/`resolveScalarArray` in params.ts, called from `tickParams(params, dt)` every frame): when `mode==="fixed"`, `value = baseline`. When modulated, samples the LFO (`sampleLfo(shape, phase, seed)` in lfo.ts → roughly [-1,1]) and applies `applySwing(sample, baseline, range, volatility)`, which computes a swing center that floats inward from `baseline` just enough that `baseline ± volatility·halfRange` never clips the param's range (unless `wrap` is set, e.g. hue, which instead free-wraps via modulo). `swingExtent()` exposes the same center/amp math for the UI to draw the variation band consistently with what's actually being sampled.

This whole param/LFO/resolve/tick system (`params.ts` + `lfo.ts`, ~570 + ~90 lines) is what every crest widget above ultimately binds to via mutation + `commitParam("bake")`. None of the presentational components (`Knob`, `Slider`, `Toggle`, `Popover`, `Panel`) import it; only `ParamWidget.tsx`, `LfoControls.tsx`, `useParam.ts`, and `RootHueRing.tsx` do.

---

## 2. The knob comparison

| | **crest-animated `Knob`** | **herder `Knob`** (`apps/herder/src/ui/controls/Knob.tsx`) | **phosphor `Slider` + `NumberField`** |
|---|---|---|---|
| **Value model** | Two numbers: `value` (live/resolved, read-only display) + `baseline` (user-set, the thing drags edit). Distinct concepts, both always present as props. | One number: `value` (the "base" the knob edits) + optional separate `ridden` value computed internally from `liveValue(midiTarget)` when a control-port signal or MIDI CC currently drives it. Ridden value is *derived inside the component* from a global runtime lookup (`liveValue`), not passed as a prop. | One number, no distinction — `value`/`onChange` is the whole model. No live-vs-baseline split exists at all. |
| **Modulation display** | First-class: separate `volatility`/`speed` props render a dedicated outer arc "variation band" plus a baseline pip distinct from the live tick. Modulation is the arc's primary reason for existing (drift/wave LFO). | Partial: the arc shows the *ridden* live value in teal vs the base value in amber when a control signal ("wire") rides the param; no volatility/amount concept, no LFO shape, no "variation band" — just base-vs-ridden coloring of the same single arc. Ridden values can exceed the drawn circle's nominal range for `periodic` params (folded back onto the circle) or clamp for `cmin`/`cmax`-extended params. | None. No modulation concept anywhere in phosphor's numeric primitives — `Slider`/`NumberField` are flat value editors with no "attached source" visual at all. |
| **Interaction** | Left-drag = baseline (200px/range, shift=0.25×). Right-drag = volatility (200px/1.0, shift=0.25×), only if `onChangeVolatility` passed. Wheel = LFO speed (if `onChangeSpeed` passed) else baseline nudge. No keyboard, no double-click. | Left-drag = value (150px/range, shift=0.15× UNLESS a `shift` second-param is bound, in which case shift-drag rides that other param at full scale instead). Wheel = value nudge by `step` (native non-passive listener). Full keyboard: arrow keys nudge by `step`, `Home` resets to `def`. Double-click resets to `def` (or resets the `shift` param if held). Right-click: context-sensitive — MIDI-learn / unbind / mode-toggle, or (`port` present) shift+right-click toggles control-port exposure. `role="slider"` + full `aria-value*`. `tabIndex={0}`. | `Slider`: native `<input type="range">` — full native keyboard (arrows, Home/End, PgUp/PgDn), pointer-drag, no wheel handling, no double-click-reset, no right-click semantics. `scale="log"` option remaps the native range's linear [0,1] position through exp/log. `NumberField`: native `<input type="number">`, typed/spinner/paste editing, no drag. |
| **Range/step contract** | `range: [number,number]` tuple; `step` lives on the owning `Param`, not passed to `Knob` itself (Knob has no `step` prop at all — drag/wheel are continuous). | `ParamDef { min, max, def, step?, periodic?, cmin?, cmax?, polarity? }` — richer: `periodic` (wrap without clamp for control signals), `cmin`/`cmax` (control-extended bounds beyond the visual knob's own min/max), explicit `polarity` override. | `min`/`max`/`step` on the primitive directly (`SliderProps`/`NumberFieldProps`), no periodic/extended-bounds concept. |
| **Visual identity** | Glass/blur cockpit aesthetic (`--ui-*` tokens): 270° SVG arc, radial-gradient glass fill, backdrop-blur, numeric readout + caption inside/below the dial. | Small (44px default) dark/skeuomorphic wood-console aesthetic: fixed hard-coded colors (`#33281a`, `var(--amber)`, `var(--maple)`, `var(--teal)`) rather than a shared token system; 270°(-ish, ±135°) SVG arc with a dot indicator for MIDI-bound/learning/port state. | Phosphor's "retrofuture 80s hi-fi" chrome family: `Slider` is a recessed-groove chrome rail with a raised pill thumb; `NumberField` is a chrome-bezeled OLED-style glowing digital readout box. Both theme through `--theme-hue`/`--chrome-*` tokens (see §4), no arc/circular geometry anywhere in phosphor today.
| **Secondary-param riding** | None — a Knob edits exactly one param; modulation config (shape/speed/amount) lives in a *separate* popover (`LfoControls`), not on the knob itself. | Built-in: `shift?: { def, value, onChange }` — a second param literally sharable on the same physical knob via the Shift modifier, plus an independent `port` (control-port exposure) toggle. | N/A — not part of either primitive's contract. |
| **External wiring** | Binds to crest's mutable `Param` object via the `ParamWidget.tsx` adapter layer (not built into `Knob` itself). | Binds to herder's MIDI-learn (`midi.registerTarget/unregisterTarget/isBound/isLearning/bindingFor/toggleMode/startLearn/cancelLearn`) and live-wire runtime (`liveValue`, `watchLive`) modules directly inside the component — not adapter-mediated, MIDI/wire awareness is baked into `Knob.tsx` itself. | None — a Slider/NumberField is a leaf primitive with zero awareness of any surrounding data model; all wiring happens at the call site (e.g. dials' `NumberEditor`, see §3). |
| **React Flow coupling** | None. | `className="knob nodrag"` (also on `XYPad`/`ArcGauge`) — the literal string `nodrag` is a React Flow convention (elements with this class don't trigger node-drag when interacted with inside a React Flow canvas). Load-bearing only inside herder's canvas; meaningless outside it. | None. |

**Overlap summary.** All three "edit one number" primitives overlap on the base case (drag/type a number in a range). None of the three fully subsumes another: crest's Knob uniquely has the baseline/live split + volatility/speed arc; herder's Knob uniquely has MIDI-learn + ridden-value + shift-param-riding + keyboard + nodrag; phosphor has neither modulation display nor MIDI concepts, but does have the only two numeric editors actually wired into the `dials` package's Panel contract (§3) and the only ones using the monorepo's shared `--theme-hue`/`--chrome-*` token system.

herder's XYPad and ArcGauge (same file) have no crest or phosphor counterpart: XYPad is a two-axis pointer-locked pad; ArcGauge is a smaller "quiet sibling" arc control with no pointer-capture ceiling behavior, used e.g. beside a main knob for its Lerp value.

---

## 3. Target contracts, precisely

### `PanelComponents` — `packages/dials/src/react/components.tsx`

The full, verbatim contract every UI part of `<Panel/>` is pluggable through:

```ts
export interface PanelComponents {
  Slider: ComponentType<SliderProps>
  NumberField: ComponentType<NumberFieldProps>
  LerpControl: ComponentType<LerpControlProps>
  Dropdown: ComponentType<DropdownProps>
  HelpTooltip: ComponentType<HelpTooltipProps>
  Row: ComponentType<RowProps>
  Heading: ComponentType<HeadingProps>
  AttachControl: ComponentType<AttachControlProps>
}
```

Member prop shapes, verbatim:

```ts
export interface SliderProps {
  value: number
  min: number
  max: number
  step: number
  scale?: 'linear' | 'log'
  onChange: (v: number) => void
}

export interface NumberFieldProps {
  value: number
  min: number
  max: number
  step: number
  scale?: 'linear' | 'log'
  onChange: (v: number) => void
}

export interface LerpControlProps {
  /** Current smoothing time constant in seconds (0 = off). */
  value: number
  onChange: (seconds: number) => void
}

export interface DropdownOption {
  value: string
  label: string
}

export interface DropdownProps {
  value: string
  options: DropdownOption[]
  onChange: (v: string) => void
}

export interface HelpTooltipProps {
  title: string
  description: string
}

export interface RowProps {
  label: ReactNode
  control: ReactNode
  help?: ReactNode
  attach?: ReactNode
  nested?: ReactNode
}

export interface HeadingProps {
  title: string
}

export interface AttachControlProps {
  slot: Slot<unknown>
  candidates: ReturnType<typeof sourcesForType>
  onChange: () => void
}
```

Note: `SliderProps`/`NumberFieldProps` here (dials' contract) are **not the same type** as phosphor's own exported `SliderProps`/`NumberFieldProps` (§4) — they happen to be structurally compatible (both use `value/min/max/step/onChange`, plus dials' also carries `scale`), which is exactly why `@ldlework/phosphor-dials/src/index.ts` can pass phosphor's `Slider`/`NumberField` components directly as `dialPanelComponents.Slider`/`.NumberField` with no wrapper — but they are declared independently in each package.

### How `Panel.tsx` composes them (`packages/dials/src/react/Panel.tsx`)

`Panel<D extends Dials>({ dials, editors, title, components, onChange })`: merges `components` over `defaultPanelComponents`, provides the merged bundle via `PanelComponentsProvider` (React context), then renders one `SlotRow` per entry in the `dials` record.

`SlotRow` (per slot): reads `c = usePanelComponents()`; computes `attached = slot.attached`, `candidates = sourcesForType(slot.outType)`, `displayLabel = slot.dial.meta.label ?? label`. Builds `help` (only if `slot.dial.meta.description` is set) via `<c.HelpTooltip>`, `attachedHelp` (only if an attached source has its own `.def.description`) via `<c.HelpTooltip>` again, and `attachPicker` (only if `candidates.length>0 || attached`) via `<c.AttachControl>`. `control` is `null` when a source is attached, else `<SlotEditorView>`. `nested` is `null` when nothing is attached, else a recursive `<SlotRow>` for every one of `attached.params` (each of *those* being itself a full `Slot<unknown>`, hence "recursively, no depth limit"). Finally renders exactly one `<c.Row label={displayLabel} control={control} help={help} attach={attachNode} nested={nested} />`.

`SlotEditorView`: if `slot.outType === 'number'` → `<NumberEditor>`; else if `editors?.[slot.outType]` exists → calls that custom editor with `{ value: slot.dial.value, set, slot }`; else falls back to a read-only `String(slot.dial.value)` div.

`NumberEditor(slot, onChange)` — **the exact seam a ported Knob would plug into**:
```ts
function NumberEditor({ slot, onChange }: { slot: Slot<number>; onChange: () => void }) {
  const c = usePanelComponents()
  const meta = slot.dial.meta
  const min = meta.min ?? 0
  const max = meta.max ?? 1
  const step = meta.step ?? (max - min) / 1000
  const scale = meta.scale
  const set = (v: number) => { setDial(slot, v); onChange() }
  const setLerp = (seconds: number) => { meta.lerp = seconds; onChange() }
  return (
    <div className="dials-number" data-dials-number="" ...>
      <c.Slider value={slot.dial.value} min={min} max={max} step={step} scale={scale} onChange={set} />
      <c.NumberField value={slot.dial.value} min={min} max={max} step={step} scale={scale} onChange={set} />
      {meta.lerp !== undefined ? <c.LerpControl value={meta.lerp} onChange={setLerp} /> : null}
    </div>
  )
}
```
`NumberEditor` renders exactly `<c.Slider>` and `<c.NumberField>` unconditionally, side by side, plus a conditional `<c.LerpControl>`. There is **no `PanelComponents` member for a combined/alternate numeric editor** — a knob would either have to be swapped in as the `Slider` implementation (receiving `SliderProps` only — no `NumberField` pairing, no ability to see `meta.lerp` or the attach state) or `NumberEditor` itself would need to change to call a new component type.

### What modulation state a numeric editor can actually observe at this seam — exact answer

At the point `NumberEditor` executes, it has been handed `slot: Slot<number>`. The `Slot<T>` shape (verbatim, from `packages/dials/src/core.ts`):

```ts
export interface Slot<T> {
  readonly kind: 'slot'
  readonly outType: string
  readonly dial: Dial<T>
  attached: Source<Record<string, unknown>, T> | null
  _lerpY?: number   // @internal — one-pole filter memory for meta.lerp smoothing
}

export interface Dial<T> {
  readonly kind: 'dial'
  value: T
  readonly meta: DialMeta<T>
}

export interface DialMeta<T> {
  label?: string
  min?: number
  max?: number
  step?: number
  scale?: 'linear' | 'log'
  lerp?: number
  space?: string
  description?: string
  hints?: Record<string, unknown>
}

export interface Source<Params extends Record<string, unknown>, Out> {
  readonly kind: 'source'
  readonly def: SourceDef<Params, Out>
  readonly params: { [K in keyof Params]: Slot<Params[K]> }
  readonly body: Body<Params, Out>
  readonly _buf: Params
  readonly _keys: readonly (keyof Params & string)[]
}
```

Concretely:

1. **`NumberEditor` is only ever rendered when `!attached`.** In `SlotRow`, `control = attached ? null : <SlotEditorView .../>`, and `SlotEditorView` is what dispatches to `NumberEditor`. So **the numeric editor (Slider+NumberField pairing at that exact call site) never runs while a source is attached** — when a source is attached, `control` is `null` and the row instead shows `nested` (a full recursive sub-`<Panel>` of the source's own params, laid out by `<c.Row>`'s `nested` slot, entirely separate markup from `NumberEditor`).
2. **`slot.dial.value` is the slot's own literal/baseline number** — this is what `NumberEditor` reads and what `Slider`/`NumberField` display and edit via `set()`/`setDial()`. It is *not* the same thing as "what the app actually samples at runtime": that's `sampleSlot(slot, ctx)` in `packages/dials/src/sample.ts`, which returns `sampleSource(slot.attached, ctx)` when a source is attached (bypassing `slot.dial.value` entirely) or `sampleDial(slot, ctx)` otherwise (which applies `meta.lerp` one-pole smoothing to `slot.dial.value` if `meta.lerp>0`). **`NumberEditor` never calls `sampleSlot`/`read()` and has no access to any "live sampled value" at all** — there is no live/resolved-vs-baseline distinction exposed to it, unlike crest's `Param.value` vs `Param.baseline`.
3. Because `NumberEditor` only runs when `!attached`, it **structurally cannot see** the attached source, its name, its per-param sub-slots (amplitude/speed-equivalent dials), or any live-sampled output — none of that data reaches `NumberEditor`'s scope. That information exists (on `slot.attached: Source<...> | null` and `slot.attached.params: {[K]: Slot<...>}`) but is consumed one level up, in `SlotRow`, to build `attachPicker`/`attachedHelp`/`nested`, never passed down into `NumberEditor`'s props.
4. `AttachControl` (`AttachControlProps = { slot, candidates, onChange }`) is the one component in the whole `PanelComponents` bundle that *does* receive the full `slot` (hence `slot.attached`) — but it's rendered as a sibling to the numeric control inside `<c.Row attach={...}>`, not as something `NumberEditor`/`Slider`/`NumberField` themselves see.
5. The only "amount"-like value ever exposed to a `PanelComponents` numeric-family component is `meta.lerp` via `LerpControlProps { value: number; onChange }` — a single smoothing time-constant in seconds, gated on `meta.lerp !== undefined`. This is unrelated to LFO/modulation amount; it's a snap-vs-ease toggle on the dial's own literal value, orthogonal to whether a source is attached.

**Bottom line, stated precisely:** at the `Panel`/`NumberEditor` seam as it exists today, a numeric editor component (`Slider`/`NumberField`) can see the slot's own `value`/`min`/`max`/`step`/`scale` and nothing about modulation — no attached-source visibility, no source params, no live-vs-set distinction, no volatility/amount, no speed. All attach-related state (`slot.attached`, its `def.name`, its `params`) is visible only to `SlotRow` (which builds the `AttachControl` and the `nested` recursive sub-panel) and to `AttachControl` itself, never to `Slider`/`NumberField`/`NumberEditor`.

### `phosphor-dials` adapter pattern (`packages/phosphor-dials/src/index.ts`, `Row.tsx`, `Heading.tsx`)

```ts
export const dialPanelComponents: PanelComponents = {
  Slider,          // from '@ldlework/phosphor' — used as-is, no wrapper
  NumberField,     // from '@ldlework/phosphor' — used as-is, no wrapper
  Dropdown,        // from '@ldlework/phosphor' — used as-is, no wrapper
  HelpTooltip,     // from '@ldlework/phosphor' — used as-is, no wrapper
  Row,             // phosphor-dials' own — pd-row layout wrapper
  Heading,         // phosphor-dials' own — pd-heading label
  AttachControl: defaultPanelComponents.AttachControl,  // reused verbatim from dials
  LerpControl: defaultPanelComponents.LerpControl,      // reused verbatim from dials
}
```
Four of eight members are phosphor primitives passed through unmodified (their prop shapes happen to satisfy dials' contracts structurally); two (`Row`, `Heading`) are phosphor-dials-authored layout-only wrapper components (`Row.tsx`: header strip with label/help/attach on one line, control below, nested sub-panel indented with a `border-left` rail; `Heading.tsx`: a styled title div, no chrome plate of its own); two (`AttachControl`, `LerpControl`) are reused verbatim from dials' `defaultPanelComponents` because "their logic is styling-independent" — `AttachControl` delegates its actual `<select>` rendering to whichever `Dropdown` is active via context, so swapping `Dropdown` alone restyles it with no wrapper needed.

---

## 4. Phosphor conventions

### File layout for a new primitive

- Component: `packages/phosphor/src/primitives/<Name>.tsx` — one export per file, named the same as the file (e.g. `Slider.tsx` exports `Slider`), plus a co-located `export type { <Name>Props }`.
- Barrel: `packages/phosphor/src/primitives/index.ts` — a flat `export { X } from './X'` list, one line per primitive (see verbatim contents in §research above: currently 17 primitives, e.g. `export { Slider, type SliderProps } from './Slider'`).
- Styles: `packages/phosphor/src/styles/<name-lowercase>.css` (e.g. `slider.css`, `numberfield.css`) — one stylesheet per primitive family, imported once, in a fixed order, from `packages/phosphor/src/styles/index.css` via `@import './<name>.css';`. `index.css` also pulls in `theme.css` (hue token) and `tokens.css` (chrome aesthetic tokens) before any component sheet, plus a webfont (`@fontsource/dseg7-classic`) for `SegmentedDisplay`.
- Package entry: `packages/phosphor/src/index.ts` does `import './styles/index.css'; export * from './primitives'`. Consumers additionally import `@ldlework/phosphor/styles.css` (the *built* bundle) once at their app root per the package.json `exports` map (`"./styles.css": "./dist/styles.css"`); the source-level `import './styles/index.css'` inside `index.ts` is for the package's own dev/build, not what host apps import.

### CSS class and variable naming patterns

- Component classes are prefixed `chrome-<component>` (e.g. `.chrome-slider`, `.chrome-numberfield`, `.chrome-button`), with BEM-ish descendant/state classes: `.chrome-slider.is-disabled`, `.chrome-button[data-selected="true"]` / `[data-pressed="true"]` (state via `data-*` attributes, not classes, on interactive primitives), `.chrome-raised-shadow`/`.chrome-raised-edge`/`.chrome-raised-front` (shared "raised object" 3-layer substrate used by both Panel and PushButton).
- CSS variables: two tiers.
  - **Theme tier** (`theme.css`, `--theme-*`): one true knob, `--theme-hue` (default 82), from which every accent (`--theme-lit`, `--theme-lit-bright`, `--theme-lit-dim`, `--theme-lit-glow`, `--theme-lit-edge`, `--theme-lit-on`, `--theme-pixel-off*`, `--theme-lit-strong/-mid/-soft`, `--theme-label-dim*`) is derived via fixed-chroma OKLCH (`--theme-chroma: 0.16` constant across the whole brand). Runtime re-theming = `document.documentElement.style.setProperty('--theme-hue', <0..360>)`.
  - **Chrome tier** (`tokens.css`, `--chrome-<area>-<facet>`): the 80s-hi-fi visual language built on top of the theme tier — `--chrome-slate-*` (neutral darks), `--chrome-panel-*`/`--chrome-bezel-*`/`--chrome-button-*` (per-component recipes), and a **per-display emitted-light system**: `--display-color` (defaults to `--theme-lit`, overridable per-instance, e.g. `SegmentedSurface`'s `color` prop sets it inline) drives a whole derived family (`--chrome-screen-body-center/-edge`, `--chrome-screen-rim-catch`, `--chrome-screen-haze`, `--embedded-chamfer`, `--spill`, `--recess`, `--bezel-rim`) so one color prop re-tints rim-catch/glow/body-fill/glyph-color in unison. A parallel **glow-rung scale** (`--chrome-glow-xs/sm/md/lg/xl`, five bloom intensities) is referenced by name (`--screen-readout-glow: var(--chrome-glow-md)`) rather than components hardcoding shadow stacks.
- `NumberField`'s CSS explicitly coordinates with `Slider` via a shared height token comment: `.chrome-numberfield { --numberfield-h: 22px; ... }` / `.chrome-slider { --slider-h: 22px; /* Match the NumberField's --numberfield-h ... */ }` — components in the same visual "row" family (both rendered inside `[data-dials-number]` by dials' `NumberEditor`) deliberately share a baseline height as a hand-maintained convention, not a shared variable.
- Components accept a raw `color?` CSS-color-string prop (not a token name) to override `--display-color` per-instance (see `SegmentedSurfaceProps.color` verbatim in §research) — the established pattern for "this one instance should hue-lock regardless of the page theme."

### Story conventions (`apps/docs/src/stories/`, `.storybook/preview.ts`)

- One file per primitive: `<PrimitiveName>.stories.tsx`, default export `Meta<typeof Component>` with `title: 'Primitives/<Name>'`. Interactive stories wrap local `useState` and render the primitive inside phosphor's own `<Panel style={{ padding: 20, width: 280 }}>` (using `Panel` itself, not a bare div, as the story's shell/backdrop). Named exports are `StoryObj<typeof Component>` per variant (`Default`, `LogScale`, `Disabled` for Slider); variant-specific behavior gets a leading JSDoc comment above the export explaining what's being demonstrated.
- `preview.ts` (global, applies to all stories): imports `@ldlework/phosphor/styles.css` once plus a local `preview.css`; sets `layout: 'centered'`; defines three fixed background swatches consumers pick from in the Storybook toolbar (`shelf #1a1512` default — "warm low-key backdrop... so chrome plates look like they're sitting on furniture, not floating on white", `rack #0a0a0a`, `lab #222`); configures the Controls-panel color/date matchers.
- Dials-specific stories exist as a separate naming convention: `dials-Panel.stories.tsx`, `dials-components.stories.tsx`, `phosphor-dials-Panel.stories.tsx` (dash-prefixed rather than nested under `Primitives/`, presumably a different Storybook `title` group — not read in full for this recon; flagged for the implementer to check directly if a new dials-adapter story is needed).

---

## 5. Overlap/skip map

| crest-animated component | Overlaps existing phosphor primitive? | Which one |
|---|---|---|
| `Slider` (horizontal, baseline+volatility+live-tick) | Partial — base drag-to-set-value behavior overlaps `Slider` (native `<input type="range">`). Phosphor's has no volatility band, no live tick, no bipolar-fill, no right-drag-for-second-value. | `packages/phosphor/src/primitives/Slider.tsx` |
| `Toggle` (boolean pill switch) | No direct phosphor equivalent found among the primitives read (Panel/PushButton/SegmentedSurface/Slider/NumberField). `ChipToggle` and `LeverSwitch` exist in the phosphor primitives barrel (`primitives/index.ts`) but were not read in this pass — named plausible candidates, not confirmed. | Unconfirmed — `ChipToggle` and/or `LeverSwitch` (not read) |
| `Segmented` (multi-option button row) | `Tabs` exists in the phosphor barrel (not read this pass) as a plausible overlap for "pick one of N labeled options." | Unconfirmed — `Tabs` (not read) |
| `Stepper` (−/+ integer control) | No phosphor equivalent seen among primitives read or the barrel list. | None identified |
| `Popover` (click-anchored floating panel, portal, outside-click/Escape close) | `Modal` exists in the phosphor barrel (not read this pass) — different interaction shape (modal = typically centered/blocking; crest's Popover = anchored/non-blocking), so likely not a drop-in match even if related. `HelpTooltip` (read) is anchor-adjacent but is a hover/focus tooltip, not a click-toggled panel with arbitrary children. | Unconfirmed — `Modal` (not read); `HelpTooltip` is close but narrower |
| `Panel` / `Cluster` (glass chrome container + flex row layout) | `Panel` exists by the same name in phosphor (`packages/phosphor/src/primitives/Panel.tsx`, not read this pass — only its usage as a story wrapper was observed) — near-certain naming collision and likely conceptual overlap (both are "chrome container for grouping controls"), but crest's is glass/blur-morphic and phosphor's is the 80s hi-fi chrome-raised aesthetic; visual language differs even if the role is identical. `Cluster`'s flex-row-with-gap has no named phosphor equivalent found. | `Panel` (name collision, not read — flag for implementer) |
| `Knob` (arc dial, baseline+volatility+speed) | No phosphor equivalent exists — phosphor has no circular/arc-geometry numeric control at all today (confirmed via the full primitives barrel: Panel, PushButton, Display, Modal, LeverSwitch, SegmentedDisplay, SegmentedSurface, ScrubChipRow, ChipToggle, HueStrip, CodeBlock, Slider, NumberField, Dropdown, HelpTooltip, Tabs, SidePanel, IndexStrip — none are arc/dial-shaped). This is the net-new primitive the port introduces. | None |
| `ParamWidget` / `LfoControls` / `RootHueRing` / `useParam` | App/domain-specific binding layer and cockpit-specific dial variant; not primitive-shaped, no phosphor overlap expected — these are consumers of a Knob, not alternatives to one. | N/A |

---

## 6. Open questions

Facts-gap and design-fork questions only — no recommendations.

1. Does the ported Knob need to preserve crest's **baseline-vs-live value split** (`value` + `baseline` as two separate numbers), given that `dials`' `Slot<number>` has no live-sampled value visible at the `NumberEditor`/`PanelComponents` seam at all (§3) — i.e., is "live value" even representable for a phosphor Knob used inside a dials `Panel`, or does that concept only make sense outside the dials integration?
2. `PanelComponents` has exactly one numeric-control pairing point (`NumberEditor` renders `<c.Slider>` + `<c.NumberField>` unconditionally side by side, with no third "combined" component type). Does a ported Knob become a **replacement value** for the `Slider` member of `PanelComponents` (receiving only `SliderProps { value,min,max,step,scale,onChange }`, paired next to a separate `NumberField`), or does it require a **new member added to the `PanelComponents` interface** (and a `Panel.tsx`/`NumberEditor` code change) to receive richer props?
3. Crest's Knob volatility/speed arc is driven by `Param.lfo.{volatility,speed}` mutated directly; dials' modulation model is `Slot.attached: Source | null` with per-source `params: {[K]: Slot}` (arbitrary shape, not a fixed `{shape,speed,volatility}` triple). Since `NumberEditor` never passes `slot.attached` down to `Slider`/`NumberField` today (§3, point 3), does making a phosphor Knob "modulation-aware" require plumbing `attached`/its params into a new prop on the Slider (or a new PanelComponents member), and if so what should that generic shape be, since dials sources aren't constrained to an LFO-shaped param set the way crest's `LfoConfig` is?
4. crest's Knob has no keyboard support at all (confirmed in Knob.tsx — no `onKeyDown`, no `tabIndex`); herder's Knob has full keyboard (arrows/Home) plus `role="slider"` + `aria-value*`; phosphor's `Slider` gets keyboard for free via native `<input type="range">`. Should the ported Knob adopt herder's keyboard/ARIA pattern, crest's as-is (mouse-only), or something else?
5. Is herder's `Knob` (MIDI-learn, ridden-value display, shift-param-riding, `nodrag`/React-Flow coupling) in scope for **any** consolidation in this port, or is it explicitly out of scope / staying app-local given its couplings to herder-specific modules (`../../patch`, `../../midi`, `../../runtime`)?
6. §5's overlap map flags `ChipToggle`/`LeverSwitch`/`Tabs`/`Modal`/`Panel` as *unconfirmed* candidate overlaps for crest's `Toggle`/`Segmented`/`Popover`/`Panel` because this recon's file list did not include reading them — should those be read before the port starts, given LfoControls (needed for any modulation-config popover) depends on `Segmented` and a `Popover`-equivalent?
7. Phosphor's chrome-tier tokens (`--chrome-*`, `--display-color`, the glow-rung scale) assume a flat/rectilinear "chrome chassis with embedded OLED glass" visual language; crest's tokens (`--ui-*` in `tokens.css`) assume a translucent glass-morphic overlay-on-canvas language (heavy `backdrop-filter: blur`, low-alpha `rgba` fills). Should a ported Knob's arc/track/variation-band/tick visuals be re-expressed entirely in phosphor's `--chrome-*`/`--theme-*` vocabulary (dropping `--ui-*` and blur-morphism), or is some hybrid/new token set expected?
8. crest's wheel-handling pattern (`useEffect` + native non-passive `addEventListener('wheel', ..., {passive:false})` specifically to beat React's passive synthetic `onWheel` and stop a parent canvas's zoom-on-wheel handler) is a workaround for crest's specific canvas-zoom conflict. Does the target monorepo/host app(s) for the ported Knob have any analogous "ambient wheel handler that must be suppressed" concern, or can wheel support be added straightforwardly?
