# Notes / Followups

Work unblocked by the package split, not part of the restructure itself. Each
of these is an independent project rather than "a change to the monorepo."

1. **Colored accumulator refactor** in `@ldlework/crt`. The deposit shader tints
   by `phosphorColor` before blending, so the accumulator stores actual color.
   Present pass stops re-tinting. This unlocks:
   - Per-wave hue offsets (multiple waves at different hues compositing on one
     screen).
   - General-purpose "render arbitrary RGB into the accumulator" mode —
     phosphor-as-rendering-surface, where any drawable content gets CRT
     treatment (persistence trails, halation, glass tint) automatically.

2. **General-surface entrypoint** in `@ldlework/crt`. A new prop / pass that
   lets the caller blit arbitrary WebGL drawcalls or a texture into the
   accumulator, instead of (or alongside) the `beamFn` path. Once the
   accumulator is colored, this is a small addition.

3. **OnlySines (or whatever you call it)** lives as a standalone app:
   - Its own repo or just a folder under `d:\code\demos\`.
   - Imports `@ldlework/dials`, `@ldlework/scope`, `@ldlework/crt`.
   - Probably imports `@ldlework/phosphor` too if it wants the chassis/UI
     chrome; otherwise just `crt` alone is enough for a minimal demo.
   - "Click for a new animation" is `randomize(dials)` — a helper that walks the
     dial tree and rolls each numeric leaf within its slot's range. Probably
     belongs in `@ldlework/dials` itself.

4. **Second pumper type** in `@ldlework/scope`. Currently there's `WavePumper`.
   The original OnlyLines (windowed-border line tracing) would be `LinesPumper`.
   Both speak dials and emit BeamSamples to a `CrtSurface`. The package becomes
   "all the different ways to produce beam paths from a dials tree."

5. **Come back to the hero** as a *configured instance* of `@ldlework/scope`
   driving a `<CrtSurface>` inside the `phosphor` chassis. With everything
   sharpened by going through OnlySines, the hero should be a cleaner thing to
   build out.

6. **`LerpControl` styling gap** in `@ldlework/phosphor-dials`
   (`src/index.ts`). Wired straight to dials' unstyled `defaultPanelComponents.LerpControl`
   to satisfy the `PanelComponents` type — it renders a raw `<input>` with no
   matching rule in `phosphor-dials/src/styles.css`. The code comment claims
   it's "styling-independent like AttachControl," which isn't true:
   `AttachControl` routes through phosphor's swapped `Dropdown`; `LerpControl`
   doesn't route through anything phosphor-styled. Needs either a real
   phosphor-styled `LerpControl` or a corrected comment if the gap is
   intentional for now.
