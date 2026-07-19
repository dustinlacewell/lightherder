---
id: "normalized-modulation-model-2026-07-19"
status: "review"
priority: "high"
assignee: null
dueDate: null
created: "2026-07-19T02:10:00.000Z"
modified: "2026-07-19T02:50:00.000Z"
completedAt: null
labels: ["dials", "phosphor-dials", "phosphor", "architecture"]
order: "a0"
---

# Normalized modulation model

Redesign `@ldlework/dials`' attachment semantics from "source replaces the slot's output" to the synth-standard model: base value + depth × normalized signal, centered on the user-set value.

## Decisions (locked)

- Every `SourceDef` declares `polarity: 'bipolar' | 'unipolar'` and emits a normalized signal — bipolar `[-1, 1]` (oscillators, noises, combinators, gates — gates pass through bipolar sub-signals), unipolar `[0, 1]` (ramp, now a wrapping phasor).
- All `lo`/`hi` params and the `seedRangeFromHost` / `narrowHostRange` / `onAttach` range-seeding apparatus are deleted.
- `Slot.attached` becomes a modulation record `{ source, depth }`. Sampling: `output = clamp(base + depth·signal, min, max)`; the dial's `lerp` smoothing applies to the base, modulation adds after.
- `depth` is in knob-travel (normalized position) space — symmetric on the arc for every scale, geometric on log dials. Plain number, not itself a slot.
- Knob band inlay renders the exact envelope: `base ± depth` (bipolar), `base → base + depth` (unipolar). The empirical rAF swing-accumulator in KnobSlider is deleted.
- Right-click vertical drag on the knob sets depth (same 150px / 0.15× shift-fine convention as the value drag; context menu suppressed). Left-drag moves base, sliding the envelope with it.
- LCD number fields removed from phosphor panel rows — the knob's own readout is the value display. Bundle-level flag (`sliderShowsValue`) so dials' default HTML bundle keeps its number field.
- `remap` and `clamp` stdlib sources culled (they existed for range plumbing the new model does natively). Other combinators survive in signal-space.

## Plan

- Sonnet recon → `docs/modulation-redesign-recon.md` → specced Fable implementation.
- Iterate with user on gesture feel and anything overlooked.
