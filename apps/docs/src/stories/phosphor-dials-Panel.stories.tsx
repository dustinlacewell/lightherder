import { useEffect } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { dial, read, type Dials } from '@ldlework/dials'
import { Panel } from '@ldlework/dials/react'
import { dialPanelComponents } from '@ldlework/phosphor-dials'
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
