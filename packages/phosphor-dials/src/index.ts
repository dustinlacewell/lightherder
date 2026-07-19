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
import { LerpControl } from './LerpControl'
import { Row } from './Row'
import { Heading } from './Heading'
import { AttachControl } from './AttachControl'

export { KnobSlider } from './KnobSlider'
export { LerpControl } from './LerpControl'
export { Row } from './Row'
export { Heading } from './Heading'
export { AttachControl } from './AttachControl'
export { SourcePreview } from './SourcePreview'
export { sourceIcon, SOURCE_ICONS, fallbackIcon, noneIcon } from './SourceIcons'

/**
 * Phosphor-styled `PanelComponents` bundle. Pass directly to
 * `<Panel components={...}>` or spread to override individual slots.
 * The numeric-slot editor is a Knob rather than phosphor's linear
 * Slider — value-only when nothing is attached, riding the live
 * modulated output while a source drives the slot; the lerp control
 * is an ArcGauge.
 */
/**
 * Layout mode for the modulation picker. `true` tucks the picker glyph
 * inside the knob face (center-bottom) and lets a right-click on the
 * dial open it; `false` restores the original layout with the picker in
 * the row's top-right corner. Flip this one flag to switch — the knob,
 * the Row, and the Panel's attach routing all key off it (via
 * `sliderHostsAttach`).
 */
export const GLYPH_IN_DIAL = true

/** Options for `makeDialPanelComponents`. */
export interface DialPanelOptions {
  /** Knob face diameter in px (default 56). */
  knobSize?: number
}

/**
 * Build a phosphor-styled `PanelComponents` bundle. Pass `knobSize` to
 * fit tighter node UIs (herder's drawer knobs are 44px, globals 38px).
 * Zero-config `dialPanelComponents` is `makeDialPanelComponents()`.
 */
export function makeDialPanelComponents(
  opts: DialPanelOptions = {},
): PanelComponents {
  return {
    Slider: sizedKnobSlider(opts.knobSize),
    NumberField,
    Dropdown,
    HelpTooltip,
    Row,
    Heading,
    LerpControl,
    // Icon-based source picker: glyph trigger + popover glyph grid,
    // replicating the default's attach/swap/detach (and depth-carrying)
    // logic over phosphor's IconPicker.
    AttachControl,
    // The Knob carries its own lit readout, so numeric rows skip the
    // separate NumberField. It stays registered above for any contract
    // consumer that still wants one.
    sliderShowsValue: true,
    // When on, the Knob hosts the attach picker in its face and the Row
    // drops its corner cell (see GLYPH_IN_DIAL).
    sliderHostsAttach: GLYPH_IN_DIAL,
  }
}

/** Phosphor-styled bundle at the default knob size. */
export const dialPanelComponents: PanelComponents = makeDialPanelComponents()
