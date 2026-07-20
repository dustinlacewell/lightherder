---
id: "per-type-modulation-combiners-2026-07-19"
status: "backlog"
priority: "medium"
assignee: null
dueDate: null
created: "2026-07-19T22:20:00.000Z"
modified: "2026-07-19T22:20:00.000Z"
completedAt: null
labels: ["dials", "architecture"]
order: "a0"
---

# Per-type modulation combiners in dials

`sampleSlot` hardcodes the numeric combine (travel-space `base + depth·signal`) and demotes every other `outType` to replace-semantics — which is also why an attached non-numeric slot loses its editor in the Panel.

Generalize: register a combiner per type tag alongside the type's sources.

```ts
type Combiner<T> = (base: T, signal: T, depth: number, mode: ModMode, meta: DialMeta<T>) => T
```

- `'number'`'s combiner is the existing travel-space math, moved verbatim.
- An `'oklch'` combiner could sweep hue properly; `'vec2'` could offset per-axis.
- Fallback when no combiner is registered: replace (today's behavior).
- Panel follow-up: with a combiner present, keep the custom editor mounted while attached (mirroring the numeric slots' live-riding behavior).

Makes `typedDial` a first-class citizen instead of a special case. Additive — new seam, no rework of the sampler's shape.
