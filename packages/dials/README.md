# dials

A parameter machine. An object of named slots; any slot's value can be driven
by a modulation source whose own parameters are dials, recursively, no depth
limit. Sample by pulling. Plain numbers out the other side.

The library does not know about time, audio, graphics, React, or what your
numbers mean. It walks a tree of slots and returns a record of values.

```ts
import { dial, read, attach, instantiate, lfo } from '@ldlework/dials'

const params = {
  freq: dial(600, { min: 50, max: 3000 }),
  amp:  dial(0.5, { min: 0,  max: 1    }),
}

attach(params.freq, instantiate(lfo))   // freq now driven by an LFO

const { freq, amp } = read(params, { t: performance.now() / 1000 })
```

`read()` returns a shared buffer mutated in place. Destructure or copy; don't
stash. Zero allocations on the hot path. The stdlib of sources auto-registers
on import.

---

# Reference

## Types

```ts
type Ctx = Record<string, unknown>

interface DialMeta<T> {
  label?: string; min?: number; max?: number; step?: number
  space?: string; hints?: Record<string, unknown>
}

interface Dial<T>   { kind: 'dial'; value: T; meta: DialMeta<T> }
interface Slot<T>   { kind: 'slot'; outType: string; dial: Dial<T>
                      attached: Source<any, T> | null }
interface Source<P, Out> { kind: 'source'; def: SourceDef<P, Out>
                           params: { [K in keyof P]: Slot<P[K]> }
                           body: (p: P, ctx: Ctx) => Out
                           /* _buf, _keys: internal */ }
interface SourceDef<P, Out> { kind: 'sourceDef'; name: string; outType: string
                              params: { [K in keyof P]: { type: string
                                        makeSlot: () => Slot<P[K]> } }
                              body:  Body<P,Out> | BodyFactory<P,Out>
                              stateful: boolean }

type Dials              = Record<string, Slot<unknown>>
type DialsOut<D extends Dials> = { [K in keyof D]: SlotOut<D[K]> }
type Body<P, Out>       = (params: P, ctx: Ctx) => Out
type BodyFactory<P,Out> = () => Body<P, Out>
```

## Constructors

```ts
dial(value: number, meta?): Slot<number>
typedDial<T>(type: string, value: T, meta?): Slot<T>

defineSource({ name, outType, params, body })          → SourceDef    // stateless
defineStatefulSource({ name, outType, params, body })  → SourceDef    // body is factory

instantiate(def: SourceDef): Source                     // fresh slots + state
```

`params` schema:

```ts
{ [paramName]: { type: string, slot: () => Slot<T> } }
```

The `slot` thunk runs at every `instantiate()` so each instance gets fresh
sub-slots. For stateful sources, the body is `() => (p, ctx) => out` — the
outer fn runs once per instance and the inner closes over per-instance state.

## Registry

```ts
registerSource(def)         → def         // idempotent on name
getSource(name)             → def | undefined
sourcesForType(outType)     → def[]       // used by the panel picker
clearRegistry()             → void        // tests / HMR
```

## Attach

```ts
attach(slot, source)        → slot        // throws on outType mismatch
attachFrom(slot, def)       → source      // instantiate + attach
detach(slot)                → void        // dial value preserved
```

## Sample

```ts
read(dials, ctx?)           → DialsOut<D> // SHARED buffer; valid until next read()
sampleSlot(slot, ctx)       → T           // one slot
sampleSource(source, ctx)   → T           // one source
```

## Mutate

```ts
setDial(slot, value)        → void        // clamps if min/max set and T = number
```

## Persistence

```ts
toJSON(dials)               → DialsSnap
fromJSON(dials, snap)       → void        // throws on missing registered source

type SlotSnap   = { value: unknown; attached?: SourceSnap }
type SourceSnap = { name: string; params: Record<string, SlotSnap> }
type DialsSnap  = Record<string, SlotSnap>
```

Snapshots store dial values and the structure of attached sources by name.
Source defs and type tags live in code; the named source must be registered
before `fromJSON()`.

## Standard library (auto-registered)

All produce `number`. Read `ctx.t` (seconds), `ctx.dt` (seconds), or
`ctx.phase` (`[0,1]`) as noted. Stateful means per-instance closure state.

| Name | Stateful | Reads | Params |
|---|---|---|---|
| `const` | no | – | `value` |
| `sine` | no | `t` | `center, depth, freq, phase` |
| `lfo` | no | `t` | `center, depth, rate, phase` |
| `tri` | no | `t` | `center, depth, freq, phase` |
| `saw` | no | `t` | `center, depth, freq, phase` |
| `square` | no | `t` | `center, depth, freq, duty, phase` |
| `whiteNoise` | yes | – | `seed, center, depth` |
| `valueNoise` | yes | `t` | `seed, center, depth, rate` |
| `ramp` | yes | `dt` | `rate, reset` |
| `smooth` | yes | `dt` | `signal, tau` |
| `add` | no | – | `a, b` |
| `mul` | no | – | `a, b` |
| `lerp` | no | – | `a, b, t` |
| `clamp` | no | – | `signal, lo, hi` |
| `remap` | no | – | `signal, inLo, inHi, outLo, outHi` |
| `gate` | no | `t` | `signal, closed, period, lo, hi` |
| `phaseGate` | no | `phase` | `signal, closed, lo, hi` |

## React panel

```tsx
import { Panel, type SlotEditor } from '@ldlework/dials/react'

<Panel dials={params} title="..." editors={{ rgb: MyColorEditor }} />
```

Walks the dials object, renders one row per slot. Numeric slots → range +
number inputs. Non-numeric slots use `editors[outType]` or fall back to
read-only display. Every slot row has an "↻ modulate…" picker built from
`sourcesForType(slot.outType)`. Attach → nested sub-panel for the source's
params, recursively. Detach restores the dial's prior value.

Markup is unstyled. Stable hooks:
`data-dials-panel`, `data-dials-slot`, `data-dials-attached`,
`data-dials-source`, `data-dials-number`, `data-dials-readonly`,
`data-dials-attach`, `data-dials-detach`.

## Performance

`read()` and every `sampleSource()` reuse buffers — zero allocations per
frame. Each dials object's result buffer is cached in a WeakMap, so multiple
dials objects can coexist without interfering. The returned object is the
same reference every call; valid until the next `read()` on the same dials
object.

## Constraints

- One source instance per slot. No DAG sharing. Drive multiple slots from one
  signal by defining a source and attaching independent instances.
- No clock, no scheduler, no subscriptions. You drive the frame loop.
- `ctx` is whatever you pass. Sources read fields by name; missing fields
  default per-source (typically `0`).
- Non-numeric dial values pass through `JSON.stringify` as-is; supply your
  own (de)serializer pair if you use non-JSON-friendly types.

## License

MIT
