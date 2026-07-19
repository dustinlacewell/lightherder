# Handoff — herder × @ldlework/dials first-class modulation

Read this first, then `docs/herder-dials-modulation-design.md` (the full
design, 335 lines + a "Decisions locked" block). This file is the state +
next-step summary so a fresh chat can continue without re-deriving anything.

## The goal (owner's intent, verbatim-ish)

Make `@ldlework/dials`' **recursive modulation a first-class part of herder's
parameter model** — not a surface UI swap. **Every parameter knob on every
node** becomes a dials `Slot` you can attach a signal source to
(`base + depth·signal`), recursively, no depth limit. Knobs lay out
**horizontally under a node**; a param's attached-source sub-params lay out
**vertically beneath it**. Where dials/phosphor-dials lack the flexibility a
consumer app needs (MIDI learn/bind, live-value riding, control-port
exposure), that flexibility is **grown as seams in the dials packages** —
herder must not hack around them.

Scope is literally all four knob call sites: every device kind's drawer knobs
(`Shell.tsx`), the `dial`/`xypad` node params (`devices.tsx`), and the globals
(`GlobalsBar.tsx`). herder's bespoke `Knob`/`ArcGauge` get deleted; `XYPad`
survives (slimmed).

## Locked decisions (all 8 design decision-points, owner-confirmed)

1. **Migrate** saved patches (legacy `data.v` hydrates into default slots). No clean break.
2. dial/xypad **stay graph nodes** (their params become modulatable slots; wires + attachments compose). NOT reconceived as dials sources — a per-slot source can't fan out, which is the dial node's whole job.
3. Adopt **`DialMeta.lerp`**; retire the engine-side `DialBank` glide to a slim stamp tracker (kept only for wire fan-in last-write-wins).
4. Control-port wires stay an **engine-side additive layer** on top of the slot output (not modeled as a dials attachment).
5. **Live slot tree on `node.data.slots`**, aliased into the doc exactly like `data.v` is today; convert to `SlotSnap` only at the JSON edges.
6. Globals **not modulatable** initially (a res change restarts every loop).
7. Sub-slot params: **MIDI-learnable yes, port-exposable no** (ports stay root-param-only).
8. **Compose exported `SlotRow`s**, don't consume `Panel` whole (herder owns a horizontal-strip container + bench-root provider).

## Three phases

- **Phase 1 — dials-package seams. ✅ DONE & GREEN (uncommitted).**
- **Phase 2 — herder model / engine / persistence.** Not started.
- **Phase 3 — herder node-UI cutover (every knob).** Not started.

(Phase 2 is the big one; it may want sub-steps — model+ops, then engine, then
persistence — each separately verifiable. That's sequencing within a phase, not
a 4th phase.)

## Phase 1 — what was built (all additive, backward-compatible)

In `@ldlework/dials`:
- **G1 `SlotActions`** (`react/components.tsx`) — mediated-mutation contract `{ setValue, attach, setDepth, setMode, setLerp }(path, slot, …)`. `defaultSlotActions` = direct in-place mutation (historical behavior). Provided via `SlotActionsProvider` / `useSlotActions`. `Panel` takes `actions?: Partial<SlotActions>`. `NumberEditor`, `SlotEditorView`, `DefaultAttachControl` all route through it.
- **G2 `path`** — stable identity `['n3','zoom','freq']` threaded through `Panel(id?)` → `SlotRow(path)` → `RowProps`/`SliderProps`/`AttachControlProps` and every action call.
- **G3 `SlotChrome`** — optional `PanelComponents.SlotChrome?: ComponentType<{path,slot,children}>`; Panel wraps each row's *control* in it. Where herder will put MIDI/dots/port-toggle.
- **G4 `liveOverride`** — `Panel` prop `(path,slot) => (()=>number|undefined)|undefined`; when it returns an accessor the Panel feeds *that* as `SliderProps.live` and forces `attached` truthy so the knob rides it (herder's control-port wire value). Falls back to the `lastSample` stash.
- **G5 exported `SlotRow`** (path-aware) + `PanelComponents.Frame?` container seam. Lets a consumer compose its own arrangement without reimplementing recursion/attach/editor-selection.
- **G6 `fromJSON(dials, snap, { onMissingSource: 'throw' | 'drop' })`** (`json.ts`, default `'throw'`). `'drop'` keeps the value, drops the unknown attachment, survives.

In `@ldlework/phosphor-dials`:
- **G7** — `AttachControl` now mutates via `useSlotActions()` + accepts `path`. `makeDialPanelComponents({ knobSize })` factory (`index.ts`) + `sizedKnobSlider(size)` (`KnobSlider.tsx`, knob was hardcoded 56px). `dialPanelComponents = makeDialPanelComponents()`. Row orientation is container-CSS-driven (herder scopes CSS from its strip wrapper) — no phosphor Row change needed.

**Files changed (Phase 1, all uncommitted):**
```
 M apps/docs/src/stories/phosphor-dials-Panel.stories.tsx   (ConsumerSeams + SmallKnobs stories)
 M packages/dials/src/json.ts
 M packages/dials/src/react/Panel.tsx
 M packages/dials/src/react/components.tsx
 M packages/dials/src/react/index.ts
 M packages/phosphor-dials/src/AttachControl.tsx
 M packages/phosphor-dials/src/KnobSlider.tsx
 M packages/phosphor-dials/src/index.ts
?? docs/herder-dials-modulation-design.md      (design doc)
?? docs/herder-dials-modulation-HANDOFF.md     (this file)
```

**Verification:** 155/155 dials tests pass; all 9 workspace projects typecheck;
docs builds. Story to eyeball: Storybook → **Phosphor-Dials/Panel →
ConsumerSeams** (mutation-tape from `actions`, a knob riding a synthetic sine
via `liveOverride` with no source attached, `SlotChrome` path-dots) and
**SmallKnobs** (40px factory).

> NOTE: phosphor-dials/docs consume dials' built `dist`, not src. After
> editing `packages/dials`, run `pnpm --filter @ldlework/dials build` (then
> `pnpm --filter @ldlework/phosphor-dials build`) or downstream typechecks see
> the stale API.

## Immediate next step

**Commit Phase 1** (was offered, not yet done) — one clean commit, the 8 files
above + the two docs. Suggested message subject: *"Grow dials consumer seams
for host-mediated modulation"*. Stage by explicit path. **No Co-Authored-By /
AI attribution** (owner rule). Then start **Phase 2**.

## Phase 2 starting points (from the design, §2 + §6)

Replace `node.data.v: Record<string,number>` with `node.data.slots:
Record<string, Slot<number>>`:
- `patch/params.ts` — new `slotFor(def): Slot<number>` (min/max/def→initial, desc→description; stash `periodic`/`cmin`/`cmax`/`polarity`/`fmt` in `meta.hints` — engine wire-combine + formatter still need them). `ParamDef` survives as the static schema.
- `patch/graph.ts` — `NodeData.slots`; `makeNode` builds trees; drop `v`.
- `patch/ops.ts` (**risky**) — 4 new op kinds (`slotAttach`/`slotDepth`/`slotMode`/`slotLerp`) + path-aware `setParam`; appliers walk `slots[first]`→`attached.params[next]`… and call dials' `setDial`/`attachFrom`/`detach`/`setDepth`/`setMode`. Gate/session/canonicalization untouched (ops are ops). Every peer must share the source registry.
- `patch/json.ts` (**risky**) — emit/parse `slots: DialsSnap` via dials `toJSON`/`fromJSON({onMissingSource:'drop'})`; migrate legacy `v`.
- `patch/library.ts` + `compile.ts` (**HARDEST**) — `InstVals.v` per-rel overlays become `DialsSnap` overlays; `mergedNode` must *clone* slot trees (re-instantiate sources per compiled node, no shared stateful-source state) instead of `{...n.data.v}`.
- `engine/engine.ts` — build `ctx={dt,t}` in sim-time; one full `sampleSlot` pass over every node's tree per `tick()` (the engine is the *only* sampler; UI reads `lastSample`).
- `engine/params.ts` — `paramValue = combineWire(slot.lastSample, ctlIn(...))` using `meta.hints` for uni/cmin/cmax/periodic; `setLive` unchanged.
- `engine/dials.ts` — shrink to a stamp tracker; **rename to `stamps.ts`** to kill the name collision with the dials package. `wiring.ts` `signalOf` → slot `lastSample` (so a wire carries the dial's *modulated* output).
- `midi/targets.ts` (**risky**) — path-aware `targetResolves`/`modelTarget` walk the live tree; old keys (`"n3:zoom"`) parse as depth-1 paths (compatible); prune sub-slot bindings on `slotAttach` swap.

## Phase 3 (node-UI cutover, from §4)

One `PanelComponentsProvider` + `SlotActionsProvider` at the bench root
(bundle = `makeDialPanelComponents({knobSize:44})` + herder `SlotChrome` +
`actions`=dispatch ops + `liveOverride`=`liveValue`). `Shell.tsx` drawer →
`<div className="dials-strip">` of `SlotRow`s (flex-row, wraps; each column
grows downward as its modulation tree deepens). `devices.tsx`: DialNode → a
`SlotRow` for `val` (lerp→`meta.lerp`, LerpControl replaces ArcGauge + the
shift-param hack); XyPadNode keeps the XYPad puck with two axis columns
beneath. `GlobalsBar` → strip of `SlotRow`s over a root `globalSlots`.
`ui/controls/Knob.tsx`: delete `Knob`+`ArcGauge`; new
`ui/controls/SlotChrome.tsx` (MIDI register/learn/unbind/mode-flip +
MIDI/port dots + context-menu policy) + `dialsBundle.ts`. `XYPad` survives,
MIDI/live plumbing moved into the chrome layer.

## Environment / rules reminders
- Windows; **Bash tool is Git Bash** but working dir drifts — use absolute paths or `cd /d/code/demos/viz && …`. Heredoc `@'…'@` is PowerShell-only, NOT the Bash tool.
- No Co-Authored-By / AI attribution in commits. Stage by explicit path.
- Don't self-verify GUI/runtime — build + typecheck, then hand to owner to eyeball in Storybook / the running herder.
- Model ladder for delegation: Sonnet mundane, Opus routine, Fable hard analysis (must be fully specced, no open-ended browse).
- Memory: `herder-dials-modulation-goal.md` records the project goal.
