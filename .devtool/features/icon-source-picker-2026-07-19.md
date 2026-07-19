---
id: "icon-source-picker-2026-07-19"
status: "in-progress"
priority: "medium"
assignee: null
dueDate: null
created: "2026-07-19T03:40:00.000Z"
modified: "2026-07-19T07:20:00.000Z"
completedAt: null
labels: ["phosphor", "phosphor-dials", "ui"]
order: "a1"
---

# Icon source picker

Replace the attach dropdown in phosphor panel rows with a compact icon selector — waveform glyphs for every stdlib modulation source.

## Shape

- New phosphor primitive `IconPicker`: small chrome trigger button showing the current selection's glyph; click opens a popover grid of glyph cells; select/outside-click/Escape closes. Value-driven, options `{ value, label, icon }`.
- phosphor-dials `SourceIcons`: stroke-based `currentColor` SVG glyphs for all 16 stdlib sources + a generic fallback for app-registered sources. Keyed by `def.name` — dials core stays UI-agnostic.
- phosphor-dials `AttachControl`: conforms dials' `AttachControlProps`, replacing the reused unstyled `DefaultAttachControl`. Trigger lit with the mod accent while attached; swap preserves depth; `''` detaches.
- Storybook story for `IconPicker`; the Phosphor-Dials/Panel story exercises the real thing.

## Follow-on: per-attachment mode toggle

`Attachment` gains `mode: 'center' | 'up' | 'down'` — how the normalized signal applies around the set value (source `polarity` stays as the raw-emission descriptor used for normalization). Defaults to natural shape (bipolar → center, unipolar → up). Sampler remaps per mode with the same per-side envelope scaling; band renders both-sides / above-only / below-only; mode serializes with depth and survives source swaps. UI: second ~22px chrome button next to the attach picker cycling ± / + / −, mod-accent lit.
