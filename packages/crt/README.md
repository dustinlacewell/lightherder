# @ldlework/crt

Physically-grounded CRT phosphor display renderer for WebGL2.

Renders whatever you draw into it as if it were painted onto a real
cathode-ray-tube phosphor: an HDR beam accumulator, Kohlrausch
stretched-exponential persistence, separable exponential halation, and an
ACES-shoulder tonemap with phosphor-color modulation. Crt itself is
content-agnostic — it owns the effect chain, not what gets drawn.

Plain TypeScript at the core (`@ldlework/crt`); an optional React mount
at `@ldlework/crt/react`.

```tsx
import { useCallback, useRef } from 'react'
import { CrtSurface } from '@ldlework/crt/react'
import {
  StampPass, PHOSPHOR_P31,
  type DrawablePass, type DrawCtx,
} from '@ldlework/crt'

function Scanner() {
  const stampRef = useRef<StampPass | null>(null)

  const passes = useCallback((gl: WebGL2RenderingContext): DrawablePass<DrawCtx>[] => {
    const stamp = new StampPass(gl)
    stampRef.current = stamp
    return [stamp]
  }, [])

  const stage = useCallback((t: number) => {
    stampRef.current?.setStamps([{ x: Math.sin(t), y: Math.cos(t), sizePx: 24 }])
  }, [])

  return <CrtSurface passes={passes} stage={stage} {...PHOSPHOR_P31} />
}
```

Pair with [`@ldlework/scope`](../scope) for oscilloscope-style beam traces —
it ships a `DepositPass` that plugs into the same `passes` slot.

## Concepts

- **`CrtSurface`** (from `@ldlework/crt/react`) — the React component.
  Owns a `<canvas>`, a WebGL2 context, the rAF loop, and the rendering
  `Pipeline`. Content comes from the `passes` factory you supply;
  `CrtSurface` doesn't know what a beam or a stamp is.
- **`Pipeline`** — the effect chain itself: decay → your passes →
  halation → present. Construct it directly (instead of `<CrtSurface>`)
  to drive rendering from a non-React host, or to share a GL context with
  another renderer.
- **`DrawablePass<DrawCtx>`** — the interface your passes implement.
  `StampPass` (below) is one; `@ldlework/scope`'s `DepositPass` is
  another. Every pass additively writes into the same HDR accumulator and
  inherits the phosphor's persistence + halation + tonemap.
- **`CrtPreset`** — a plain-object snapshot of the tunable display
  uniforms (persistence, halation, tonemap…). Every field optional;
  `resolvePreset` fills in defaults from `PHOSPHOR_P31`.
- **`presetFn`** — optional prop on `<CrtSurface>`. When supplied, called
  every rAF so caller-driven (e.g. dial-driven) preset values land at
  frame rate without forcing a React re-render.
- **`stage`** — optional prop on `<CrtSurface>`, called once per frame
  before the pipeline runs. Use it to push per-frame data into the passes
  you registered (a stamp list, a segment batch).

## Phosphor presets

Four shipped presets, named after real-world phosphor coatings:

- `PHOSPHOR_P31` — ZnS:Cu yellow-green; short persistence; the
  classic oscilloscope phosphor (component defaults target this).
- `PHOSPHOR_P7` — cascade blue→yellow; long persistence; radar look.
- `PHOSPHOR_P39` — ZnO:Zn slow-scan yellow-green; medium persistence.
- `PHOSPHOR_BEAUTY` — exaggerated halation + bleach for art mode.

## API reference

### `<CrtSurface>` — `@ldlework/crt/react`

```ts
interface CrtSurfaceProps extends CrtPreset {
  passes: (gl: WebGL2RenderingContext) => DrawablePass<DrawCtx>[]
  stage?: (t: number, dt: number) => void
  presetFn?: (t: number, dt: number) => CrtPreset
  className?: string
  style?: CSSProperties
}
```

`passes` runs once at mount with the live GL context; `CrtSurface` disposes
the returned passes on unmount. `stage` and `presetFn` run every rAF tick.

### `CrtPreset` / `ResolvedUniforms`

```ts
interface CrtPreset {
  persistence?: number        // per-frame survival of the brightest fresh trace
  persistenceBeta?: number    // Kohlrausch stretch exponent; 1 = pure exponential
  intensity?: number          // master deposit gain, applied by every pass
  halationStrength?: number   // halation additive strength
  halationSigma?: number      // halation blur radius, CSS px at 1x DPR
  halationTint?: number       // 0 = halo matches phosphor color, 1 = warm amber
  saturationKnee?: number     // intensity above which color bleaches to white
  whiteHot?: number           // how aggressively the bright core blows to white
  grain?: number              // screen grain noise
  flicker?: number            // 120Hz brightness wobble
  alpha?: number               // global surface opacity, [0, 1]
  phosphorColor?: readonly [number, number, number]  // default: read from --theme-lit-bright
  whitePoint?: readonly [number, number, number]
  resolutionScale?: number    // accumulator FBO resolution as a fraction of canvas px
}

function resolvePreset(p: CrtPreset): ResolvedUniforms  // fills every field's default
```

### `Pipeline`

```ts
class Pipeline {
  constructor(gl: WebGL2RenderingContext, fboWidth: number, fboHeight: number, options: PipelineOptions)
  readonly decay: DecayPass
  readonly halation: HalationPass
  readonly present: PresentPass
  get fboWidth(): number
  get fboHeight(): number
  resize(fboWidth: number, fboHeight: number): void
  runFrame(input: FrameInput): void
  dispose(): void
}

interface PipelineOptions { passes: DrawablePass<DrawCtx>[] }
interface FrameInput {
  uniforms: ResolvedUniforms
  t: number
  dt: number
  canvasWidthPx: number
  canvasHeightPx: number
  phosphorColor: readonly [number, number, number]
}
```

`DecayPass`, `HalationPass`, and `PresentPass` are also individually
exported for consumers assembling a custom pipeline (e.g. reordering
stages, or reusing just the tonemap).

### `StampPass`

Additive texture-stamp deposit — one instanced quad per stamp, alpha
channel of a staged texture written into the accumulator scaled by a
per-stamp intensity multiplier.

```ts
class StampPass implements DrawablePass<DrawCtx>, ResizablePass {
  constructor(gl: WebGL2RenderingContext, options?: { capacity?: number })  // default capacity 256
  setTexture(tex: WebGLTexture | null): void
  setStamps(stamps: readonly Stamp[]): void
}

interface Stamp {
  x: number; y: number       // NDC center, [-1, 1]
  sizePx: number             // edge length in CSS px
  intensity?: number         // per-stamp multiplier, default 1
  rotation?: number          // radians, default 0
}
```

### `DrawablePass<DrawCtx>`

The interface any custom pass implements (re-exported from `@ldlework/gl`
so consumers don't need a direct dependency on it):

```ts
interface DrawCtx {
  gl: WebGL2RenderingContext
  uniforms: ResolvedUniforms
  t: number; dt: number
  canvasWidthPx: number; canvasHeightPx: number
  fboWidth: number; fboHeight: number
  accum: PingPongTargets   // ping-pong HDR accumulator: { read, write, flip() }
  phosphorColor: readonly [number, number, number]
}

interface DrawablePass<Ctx> extends Pass {
  draw(ctx: Ctx): void
}
interface ResizablePass { resize(w: number, h: number): void }
```

## Notes

- `@ldlework/crt` (the core) has no React dependency — React is only
  needed if you import `@ldlework/crt/react`. `react` is listed as an
  optional peer dependency accordingly.
- Requires WebGL2 + `EXT_color_buffer_float`.
- Shader sources are generated as plain `.ts` string modules at build
  time (`scripts/gen-shaders.mjs`, run before `tsc`) — no bundler-specific
  import syntax, works under any consumer toolchain.
- Beam color follows `--theme-lit-bright` from the document by default;
  pass `phosphorColor: [r, g, b]` to override.

## License

MIT
