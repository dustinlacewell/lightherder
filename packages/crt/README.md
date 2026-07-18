# @ldlework/crt

Physically-grounded CRT phosphor display renderer for WebGL2.

A self-contained React surface (`<CrtSurface>`) that takes a beam emission
function and renders it as if drawn into a real cathode-ray-tube phosphor:
woscope-style analytical line-integral deposit into an HDR accumulator,
Kohlrausch stretched-exponential persistence, separable exponential
halation, ACES-shoulder tonemap with phosphor-color modulation.

```tsx
import { CrtSurface, PHOSPHOR_P31 } from '@ldlework/crt'

<CrtSurface
  beamFn={(t) => [{ x: Math.sin(t), y: Math.cos(t) }]}
  {...PHOSPHOR_P31}
/>
```

## Concepts

- **`CrtSurface`** — the React component. Owns a `<canvas>`, a WebGL2
  context, the rAF loop, and the rendering pipeline.
- **`CrtPreset`** — a plain-object snapshot of the tunable display
  uniforms (persistence, beam width, halation, tonemap…).
- **`BeamFn`** — `(t, dt) => Iterable<BeamSample>`. Called once per frame.
  Yield as many samples as you like; consecutive non-break samples are
  joined into segments which the deposit pass paints analytically.
- **`presetFn`** — optional prop on `<CrtSurface>`. When supplied, called
  every rAF so caller-driven (e.g. dial-driven) preset values land at
  frame rate without forcing a React re-render.

## Phosphor presets

Four shipped presets, named after real-world phosphor coatings:

- `PHOSPHOR_P31` — ZnS:Cu yellow-green; short persistence; the
  classic oscilloscope phosphor (component defaults target this).
- `PHOSPHOR_P7` — cascade blue→yellow; long persistence; radar look.
- `PHOSPHOR_P39` — ZnO:Zn slow-scan yellow-green; medium persistence.
- `PHOSPHOR_BEAUTY` — exaggerated halation + bleach for art mode.

## Notes

- Requires WebGL2 + `EXT_color_buffer_float`.
- Shaders are `.glsl` files imported via Vite's `?raw` query — consumers
  must be on Vite (or anything that handles `?raw` string imports).
- Beam color follows `--theme-lit-bright` from the document by default;
  pass `phosphorColor: [r, g, b]` to override.
