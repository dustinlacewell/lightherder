---
id: "modulation-aware-numeric-editors-2026-07-19"
status: "done"
priority: "medium"
assignee: null
dueDate: null
created: "2026-07-19T00:29:51.000Z"
modified: "2026-07-19T02:10:00.000Z"
completedAt: "2026-07-19T02:10:00.000Z"
labels: ["dials", "phosphor-dials", "architecture"]
order: "a0"
---

# Modulation-aware numeric editors in dials' Panel

Extend `@ldlework/dials`' `Panel`/`PanelComponents` contract so numeric editors can observe modulation state — enabling phosphor's `Knob` to light up its baseline pip, live tick, and variation band from an attached source instead of running value-only.

## Current architecture (hard facts, from docs/knob-port-recon.md)

- In `Panel.tsx`, `NumberEditor` is only rendered when `!slot.attached` — when a source is attached, the row shows the nested source sub-panel and **no editor at all**. An editor structurally cannot see the attached source, its params, or a live-sampled value.
- dials' `SliderProps` contract is `{ value, min, max, step, scale?, onChange }` — no channel for baseline-vs-live distinction, volatility, or rate.
- Phosphor's `Knob` already has the full prop API for this (`value` vs `baseline`, `volatility`, `speed`) — it was ported from crest-animated with those semantics intact. Only the dials seam withholds the data.
- `phosphor-dials`' `KnobSlider` adapter currently runs the knob in value-only mode (`baseline={value}`, no volatility/speed handlers).

## Design questions to resolve

- Should the editor render *alongside* the nested source sub-panel when attached (knob shows live modulation while source params are edited below), replacing the current editor-hides behavior?
- What shape does the contract extension take — extra optional fields on `SliderProps` (live value, attached-source descriptor), a separate `ModulatedEditor` slot in `PanelComponents`, or passing the `Slot` itself?
- Where does the live sampled value come from — does the Panel subscribe to a sample loop, or does the host pass a per-frame `Ctx` down?
- Can crest-animated's baseline/volatility/speed model map onto arbitrary dials sources (sine/perlin/fbm/...), or only onto amplitude-style params by convention?

## Notes

- The mapping between crest's model and dials' source params is the crux: crest hardcoded baseline+volatility+LFO-speed; dials sources have arbitrary param trees.
- No backward-compat tax applies (pre-release): the contract can change freely; update `phosphor-dials` and any consumers in the same series.
