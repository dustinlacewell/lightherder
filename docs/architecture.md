# Architecture

A pnpm monorepo of WebGL rendering + oscilloscope-simulation packages and a
React design system, plus two apps that compose them.

## The conceit (phosphor design system)

`@ldlework/phosphor` is a React design system in the shape of late-80s /
early-90s high-end audio equipment: milled chrome chassis with raised plates,
recessed OLED glass, emitted-light pixel typography, a single-hue theme knob.

Two material languages, layered:

- **Chrome chassis.** Raised plates, rolled chamfers, rim catch-light, sanded
  grain. Built from one shared substrate (`.chrome-raised` — shadow / edge /
  front spans) so panels and push buttons share the same depth illusion.
- **OLED glass.** Recessed dark surface inside a black bezel. *Nothing physical
  lives on the glass* — every UI element on it is an emitted-light pixel in the
  active theme hue.

One CSS variable (`--theme-hue`) re-skins the entire chrome family. Colour math
is OKLCH so perceptual brightness stays constant across hues.

## Layer graph

```
foundation      gl        @ldlework/gl              WebGL2 substrate — programs, textures, FBOs, geometry, camera
                dials     @ldlework/dials           parameter machine — dials driven by nested modulation sources
                            │
rendering       crt       @ldlework/crt             WebGL beam renderer — accumulator, persistence, halation, tonemap
                            │        (depends on gl)
                scope     @ldlework/scope           wave/sweep/burst signal modeling — emits BeamSamples to a CrtSurface
                            │        (depends on crt, gl)
design-system   phosphor        @ldlework/phosphor        chrome chassis, OLED glass, chips, fonts, theming
                phosphor-dials  @ldlework/phosphor-dials  phosphor-styled component set for the dials Panel
                            │        (depends on dials, phosphor)
apps            docs           @ldlework/phosphor-docs   Storybook playground for phosphor
                phosphor-site  @ldlework/phosphor-site   hero demo — composes scope + dials + crt + phosphor
```

## Package responsibilities

- **`gl`** — WebGL2 substrate: programs, textures, framebuffers, geometry, pass
  orchestration, camera, dynamic vertex buffers. Depends on nothing else in the
  monorepo.
- **`dials`** — a parameter machine: dials whose values can be driven by nested
  modulation sources. Independent, React-optional.
- **`crt`** — the renderer. It knows about WebGL, accumulator FBOs, ping-pong,
  the deposit/decay/halation/present pipeline. It does NOT know about
  oscilloscopes, sweep state machines, fundamentals, bursts, or dials. Depends
  only on `gl`. React surface (`CrtSurface`, was `PhosphorSurface`) included.
- **`scope`** — the application of `crt` to oscilloscope-simulation. It builds
  dial trees that describe waves/bursts/sweeps, walks them at frame rate, and
  emits BeamSamples to `<CrtSurface>`. Depends on `crt` (consumes the renderer)
  and `dials` (its parameters).
- **`phosphor`** — the design system: chrome / chips / glass / fonts. Keeps its
  name; the *display physics* live in `crt`.
- **`phosphor-dials`** — phosphor-styled component set for the dials `Panel`.
  Pass `dialPanelComponents` to `<Panel components={...}>` and the dial tree
  renders in the phosphor design language. Depends on `dials` and `phosphor`.

## Why two packages, not one (crt + scope)

- **`crt`** is the renderer — display physics only.
- **`scope`** is the application of `crt` to oscilloscope-simulation — signal
  modeling that emits beam paths into the renderer.

Keeping them apart lets `crt` be reused independently of oscilloscope semantics
(e.g. a future generative-art port that wants CRT treatment on arbitrary
content), and lets `scope` grow additional pumper types without dragging the
renderer along.

## Naming rationale

- Package names: `@ldlework/crt`, `@ldlework/scope`. (Considered `cathode`,
  `vector`, `vectorscope`, `beam`, `traces` — landed on `crt` + `scope`.)
- The renderer's main component is `CrtSurface` (was `PhosphorSurface`); the
  pipeline class and React component follow, plus types like `CrtPreset` (was
  `PhosphorPreset`). The phosphor *design system* keeps its name; the *display
  physics* moved to `crt`.
- `PHOSPHOR_P31` / `PHOSPHOR_P7` / `PHOSPHOR_P39` / `PHOSPHOR_BEAUTY` keep their
  names — they're phosphor-coating-type identifiers, describing the kind of
  phosphor coating, which is exactly what they are.
