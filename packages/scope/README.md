# @ldlework/scope

Oscilloscope-style synthetic-signal generation that drives a
[`@ldlework/crt`](../crt) phosphor display. Every parameter is a
[`@ldlework/dials`](../dials) slot — modulatable, serializable, panel-
ready.

```tsx
import '@ldlework/phosphor/styles.css' // or your own host
import { Scope } from '@ldlework/scope/react'

<Scope endpoint="/__preset/myscope" fallbackUrl="/myscope.json" />
```

## What's in the box

- **Wave model** — every wave is `Σᵢ ampᵢ · sin(2π·freqᵢ·t + phaseᵢ)`
  plus an always-on noise floor plus phase-locked bursts. No "drift"
  abstraction; attach an LFO to a `freq` dial if you want one.
- **`WavePumper`** — the runtime. Walks dials at the beam sample rate
  and emits `BeamPosition`s (NDC x/y + per-sample beam character).
- **Hero preset** — `{ screen: ScreenDials, waves: WaveDials[] }`.
  Serializes via dials' `toJSON` / `fromJSON`. Includes
  `loadHeroPreset` / `saveHeroPreset` that POST/GET a JSON document
  to a configurable endpoint (the host app provides the URL).
- **`<Scope>`** — the React mount. Pumps N waves in parallel, packs
  their positions into the `BeamFn` that `<CrtSurface>` expects.
- **`<TuningPanel>`** — dev-only (`import.meta.env.DEV`) tabbed panel
  for live editing of screen + wave dials, including
  add/remove/duplicate/randomize. Mounted via `createPortal`.

## Module layout

- `@ldlework/scope`           — core library: dials, pumper, presets,
                                snapshots, network. No React.
- `@ldlework/scope/react`     — `Scope`, `TuningPanel`, hooks. The
                                React surface.

The core entrypoint is React-free so non-React drivers (Storybook
stories, server-side generation, tests) can use the wave runtime
directly.
