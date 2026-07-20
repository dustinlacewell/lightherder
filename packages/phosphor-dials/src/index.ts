/*
 * @ldlework/phosphor-dials — phosphor-styled adapter for dials' Panel.
 *
 * Usage:
 *
 *   import '@ldlework/phosphor/styles.css'
 *   import '@ldlework/phosphor-dials/dist/styles.css'  // layout-only
 *   import { Panel } from '@ldlework/dials/react'
 *   import { dialPanelComponents } from '@ldlework/phosphor-dials'
 *
 *   <Panel dials={mySurface} components={dialPanelComponents} />
 *
 * The bundle conforms phosphor's primitives to dials' PanelComponents
 * contract. AttachControl is an IconPicker-backed adapter — a compact
 * chrome trigger showing the attached source's waveform glyph, opening
 * a popover grid of glyphs — rather than dials' default text dropdown.
 */

import {
  NumberField,
  Dropdown,
  HelpTooltip,
} from '@ldlework/phosphor'
import { type PanelComponents } from '@ldlework/dials/react'

import { sizedKnobSlider } from './KnobSlider'
import { Row, makeRow, type Caption } from './Row'
import { Heading } from './Heading'
import { AttachControl } from './AttachControl'

export { KnobSlider } from './KnobSlider'
export { Row, makeRow, type Caption } from './Row'
export { Heading } from './Heading'
export { AttachControl } from './AttachControl'
export { SourcePreview } from './SourcePreview'
export { sourceIcon, SOURCE_ICONS, fallbackIcon, noneIcon } from './SourceIcons'

/** Options for `makeDialPanelComponents`. */
export interface DialPanelOptions {
  /** Knob face diameter in px (default 56). */
  knobSize?: number
  /**
   * Where each slot's caption sits. `'above'` (default) is the classic
   * title-over-dial strip. `'below'` suppresses that strip and lets the
   * knob engrave its own label + value beneath its face — the compact
   * layout a dense node UI wants. See `Caption`.
   */
  caption?: Caption
  /**
   * Where the modulation picker lives. `'dial'` (default) tucks the
   * picker glyph inside the knob face (center-bottom) and lets a
   * right-click on the dial open it; `'row'` keeps the standalone
   * trigger in the row's corner. The knob, the Row, and the Panel's
   * attach routing all key off this (via `sliderHostsAttach`).
   */
  attachPlacement?: 'dial' | 'row'
  /**
   * The glide (`slot.glide`) in seconds that reads as a full glide bar
   * under the knob. The host's own idea of "maximum glide" (herder: 3s);
   * default 2s. dials/phosphor stay unitless — this is where the time
   * scale is set.
   */
  glideMax?: number
}

/**
 * Build a phosphor-styled `PanelComponents` bundle. Pass `knobSize` to
 * fit tighter node UIs (herder's drawer knobs are 44px, globals 38px).
 * The numeric-slot editor is a Knob rather than phosphor's linear
 * Slider — value-only when nothing is attached, riding the live
 * modulated output while a source drives the slot; the glide amount
 * shows as a thin bar under the knob (the Knob's `glide` prop), edited
 * by shift+right-drag when the slot opts in (`meta.glidable`).
 * Zero-config `dialPanelComponents` is `makeDialPanelComponents()`.
 */
export function makeDialPanelComponents(
  opts: DialPanelOptions = {},
): PanelComponents {
  const below = opts.caption === 'below'
  return {
    Slider: sizedKnobSlider(opts.knobSize, below, opts.glideMax),
    NumberField,
    Dropdown,
    HelpTooltip,
    Row: below ? makeRow('below') : Row,
    Heading,
    // Icon-based source picker: glyph trigger + popover glyph grid — a
    // pure view over phosphor's IconPicker (dials binds the semantics).
    AttachControl,
    // The Knob carries its own lit readout, so numeric rows skip the
    // separate NumberField. It stays registered above for any contract
    // consumer that still wants one.
    sliderShowsValue: true,
    // In 'dial' placement the Knob hosts the attach picker in its face
    // and the Row drops its corner cell.
    sliderHostsAttach: opts.attachPlacement !== 'row',
  }
}

/** Phosphor-styled bundle at the default knob size. */
export const dialPanelComponents: PanelComponents = makeDialPanelComponents()
