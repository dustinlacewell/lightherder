import { useEffect, useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { dial, read, type Dials } from '@ldlework/dials'
import {
  Panel,
  defaultSlotActions,
  type SlotActions,
  type SlotChromeProps,
} from '@ldlework/dials/react'
import { dialPanelComponents, makeDialPanelComponents } from '@ldlework/phosphor-dials'
import '@ldlework/phosphor-dials/styles.css'

/**
 * `dialPanelComponents` conforms phosphor's primitives to dials'
 * `PanelComponents` contract — pass it to `<Panel components={...}>`
 * and the whole dial tree (row layout, heading, slider, number field,
 * dropdown, help tooltip) renders in the phosphor design language.
 * This is the composed, real-world usage of `phosphor-dials`' `Row`
 * and `Heading`, which have no meaningful appearance in isolation.
 */
const meta: Meta<typeof Panel> = {
  title: 'Phosphor-Dials/Panel',
  component: Panel,
}
export default meta

const synthDials: Dials = {
  freq: dial(600, { min: 50, max: 3000, scale: 'log', description: 'Oscillator pitch, in Hz.' }),
  amp: dial(0.5, { min: 0, max: 1, description: 'Output level, 0 to full.' }),
  detune: dial(0, { min: -100, max: 100, lerp: 0, description: 'Pitch offset in cents.' }),
}

export const Default: StoryObj<typeof Panel> = {
  render: () => (
    <Panel title="Synth" dials={synthDials} components={dialPanelComponents} />
  ),
}

const modDials: Dials = {
  amp: dial(0.5, {
    min: 0,
    max: 1,
    description: 'Attach a source and watch the knob ride it.',
  }),
}

/**
 * Host-app usage pattern: the app samples its dials every frame via
 * `read(dials, { t, dt })` — that sampling is what fills each slot's
 * `lastSample` stash, which the knob polls to display the live
 * modulated value. The story runs that host loop itself.
 */
function LiveModulationPanel() {
  useEffect(() => {
    let last = performance.now()
    let raf = requestAnimationFrame(function tick(now: number) {
      const dt = (now - last) / 1000
      last = now
      read(modDials, { t: now / 1000, dt })
      raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <Panel
      title="Modulatable"
      dials={modDials}
      components={dialPanelComponents}
    />
  )
}

/**
 * The attach picker (top-right of each row) is a compact glyph button
 * opening a grid of waveform icons — one per registered stdlib source
 * for that slot's type. Attach `sine` to `amp` — the
 * row expands into a nested sub-panel for the source's own
 * (themselves modulatable) params, and the knob rides the additive
 * output `base + depth·signal`: the white band shows the modulation
 * envelope around the user's value, right-drag on the knob sets the
 * depth (band width), and left-dragging the knob slides the whole
 * envelope with the base value. Depth lives on the slot, so right-drag
 * works before any source is attached — pre-arming the white envelope
 * band (it reads as "armed"), which the source then drives through once
 * attached. The picker popover always carries a footer — a three-option
 * segment (center ± / up + / down −) selecting the modulation mode,
 * reshaping the envelope to swing both ways, only above, or only below
 * the base. Because mode is slot-level, the shape can be pre-set before
 * any source is attached, alongside the pre-armable depth.
 *
 * The picker also carries hover popups throughout: the closed trigger
 * explains modulation, each source cell shows the source's name and
 * one-liner plus a live sparkline preview actually running a private
 * instance of that source, and each mode cell gets a one-line card.
 */
export const WithModulation: StoryObj<typeof Panel> = {
  render: () => <LiveModulationPanel />,
}

// ─── Consumer seams (Phase 1 extension points) ───────────────────────
//
// The story below exercises the three seams a host app (herder) needs:
// `actions` (mediated mutation), `liveOverride` (an external effective
// value riding on top of the slot), and `SlotChrome` (per-slot app
// adornment around the editor). It stands in for the herder integration
// before that lands, so the seams are eyeball-able in isolation.

const seamDials: Dials = {
  zoom: dial(0.5, { min: 0, max: 1, description: 'Recursion zoom.' }),
  rot: dial(0, { min: -1, max: 1, description: 'Recursion rotation.' }),
}

/**
 * A per-slot chrome adornment: a small dot beside the knob whose title
 * shows the slot's path — proof the path threads through and that a host
 * can hang app UI around the editor without forking it.
 */
function DotChrome({ path, children }: SlotChromeProps) {
  return (
    <div style={{ position: 'relative' }}>
      {children}
      <span
        title={`slot path: ${path.join(' / ')}`}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: 'var(--chrome-accent-mod, #6cf)',
          boxShadow: '0 0 4px var(--chrome-accent-mod-glow, #6cf)',
        }}
      />
    </div>
  )
}

/**
 * Wires the three seams. `actions` logs each mutation to a running tape
 * (visible below the panel) and then applies the default in-place
 * mutation — the mediation is observable without changing behavior.
 * `liveOverride` rides `zoom` with a slow synthetic sine, so its knob
 * shows a moving "ridden" value with no source attached (the control-
 * port ride herder needs). `SlotChrome` hangs the DotChrome on each row.
 */
function SeamPanel() {
  const [tape, setTape] = useState<string[]>([])
  const t = useRef(0)
  useEffect(() => {
    let raf = requestAnimationFrame(function tick() {
      t.current += 0.02
      raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  const log = (msg: string) =>
    setTape((tp) => [msg, ...tp].slice(0, 6))

  const actions: Partial<SlotActions> = {
    setValue: (path, slot, v) => {
      log(`setValue ${path.join('/')} = ${Number(v).toFixed(3)}`)
      defaultSlotActions.setValue(path, slot, v)
    },
    attach: (path, slot, name) => {
      log(`attach ${path.join('/')} <- ${name ?? 'none'}`)
      defaultSlotActions.attach(path, slot, name)
    },
    setDepth: (path, slot, d) => {
      log(`depth ${path.join('/')} = ${d.toFixed(2)}`)
      defaultSlotActions.setDepth(path, slot, d)
    },
    setMode: (path, slot, m) => {
      log(`mode ${path.join('/')} = ${m}`)
      defaultSlotActions.setMode(path, slot, m)
    },
  }

  const liveOverride = (path: string[]) =>
    path.length === 1 && path[0] === 'zoom'
      ? () => 0.5 + 0.4 * Math.sin(t.current)
      : undefined

  return (
    <div style={{ width: 260 }}>
      <Panel
        title="Seams"
        id="demo"
        dials={seamDials}
        components={{ ...dialPanelComponents, SlotChrome: DotChrome }}
        actions={actions}
        liveOverride={liveOverride}
      />
      <pre
        style={{
          marginTop: 12,
          padding: 8,
          fontSize: 10,
          lineHeight: 1.5,
          minHeight: 90,
          background: 'rgba(0,0,0,0.3)',
          borderRadius: 4,
          color: 'var(--chrome-text-muted, #9a9)',
        }}
      >
        {tape.length ? tape.join('\n') : 'drag a knob, attach a source…'}
      </pre>
    </div>
  )
}

/**
 * The consumer extension seams in isolation: mediated `actions` (each
 * mutation is logged then applied), a `liveOverride` riding `zoom`
 * externally, per-slot `SlotChrome` dots carrying the slot path, and a
 * smaller knob size via `makeDialPanelComponents({ knobSize })`.
 */
export const ConsumerSeams: StoryObj<typeof Panel> = {
  render: () => <SeamPanel />,
}

/** The knob-size factory: a tighter 40px bundle for dense node UIs. */
export const SmallKnobs: StoryObj<typeof Panel> = {
  render: () => (
    <Panel
      title="Compact"
      dials={{
        a: dial(0.5, { min: 0, max: 1, description: 'A.' }),
        b: dial(0.5, { min: 0, max: 1, description: 'B.' }),
      }}
      components={makeDialPanelComponents({ knobSize: 40 })}
    />
  ),
}
