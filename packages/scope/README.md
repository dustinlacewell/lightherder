# @ldlework/scope

Oscilloscope-style synthetic-signal generation, plus a WebGL2 deposit
pass that feeds the resulting beam trace into
[`@ldlework/crt`](../crt)'s phosphor pipeline.

Plain TypeScript. No dials, no React, no DOM, no presets, no persistence
— the application composes scope with whatever parameter system (e.g.
[`@ldlework/dials`](../dials)) and persistence it wants.

```ts
import { makeWave, makeFundamental, WavePumper } from '@ldlework/scope'

const wave = makeWave()
wave.fundamentals = [makeFundamental(440, 0.5)]  // freq, amp, phase

const pumper = new WavePumper(500_000)  // beamHz
const sample = pumper.step(wave, { t, dt })
// sample: BeamPosition — { x, y, on?, beamI?, beamWidth? }
```

## What's in the box

- **Wave model** (`signal/`) — every wave is
  `Σᵢ ampᵢ · sin(2π·freqᵢ·t + phaseᵢ)` plus an always-on noise floor plus
  phase-locked bursts. No "drift" abstraction; attach an LFO to a `freq`
  dial in your own parameter layer if you want one.
- **`WavePumper`** (`signal/pumper.ts`) — the runtime. Walks a `Wave` at
  the configured beam sample rate and emits `BeamPosition`s (NDC x/y +
  per-sample beam character).
- **Noise generators** (`noise/`) — white / brown / pink / drift, plus
  seeded variants for reproducible signal-floor noise.
- **`DepositPass` + `SegmentPump`** (`beam/`) — the `@ldlework/crt`
  integration seam. `DepositPass` is a `DrawablePass<DrawCtx>` that
  additively deposits beam segments into crt's HDR accumulator via an
  analytical line-integral (woscope-style); `SegmentPump` batches a
  `BeamFn`'s per-frame samples into the instance data `DepositPass`
  consumes.

## Module layout

- `@ldlework/scope` — everything above, one entrypoint. No React
  subpath: the dials-wrapped parameter layer, hero preset persistence,
  and `<Scope>`/`<TuningPanel>` React composition live in the demo site
  (`apps/phosphor-site`), not in this package — scope stays parameter-system-
  and framework-agnostic so any host can drive it.

## Wiring a beam into crt

```tsx
import { useCallback, useRef } from 'react'
import { CrtSurface } from '@ldlework/crt/react'
import type { DrawablePass, DrawCtx } from '@ldlework/crt'
import { DepositPass, makeSegmentPump, type BeamFn, type SegmentPump } from '@ldlework/scope'

const CAPACITY = 4000

function Trace({ beamFn }: { beamFn: BeamFn }) {
  const depositRef = useRef<DepositPass | null>(null)
  const pumpRef = useRef<SegmentPump | null>(null)

  const passes = useCallback((gl: WebGL2RenderingContext): DrawablePass<DrawCtx>[] => {
    const deposit = new DepositPass(gl, CAPACITY)
    depositRef.current = deposit
    pumpRef.current = makeSegmentPump(CAPACITY)
    return [deposit]
  }, [])

  const stage = useCallback((t: number, dt: number) => {
    depositRef.current?.setBatch(pumpRef.current!.pump(beamFn, t, dt))
  }, [beamFn])

  return <CrtSurface passes={passes} stage={stage} />
}
```

## License

MIT
