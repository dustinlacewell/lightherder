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
 * contract. AttachControl is reused from dials' defaults — its logic
 * (detach + fresh attachFrom on source swap) is independent of styling,
 * and it delegates the actual <select> rendering to the configured
 * Dropdown via context, so swapping `Dropdown` for phosphor's is
 * sufficient to restyle the attach UI.
 */

import {
  Slider,
  NumberField,
  Dropdown,
  HelpTooltip,
} from '@ldlework/phosphor'
import {
  defaultPanelComponents,
  type PanelComponents,
} from '@ldlework/dials/react'

import { Row } from './Row'
import { Heading } from './Heading'

export { Row } from './Row'
export { Heading } from './Heading'

/**
 * Phosphor-styled `PanelComponents` bundle. Pass directly to
 * `<Panel components={...}>` or spread to override individual slots.
 */
export const dialPanelComponents: PanelComponents = {
  Slider,
  NumberField,
  Dropdown,
  HelpTooltip,
  Row,
  Heading,
  // AttachControl logic is styling-independent; reuse dials' default,
  // which routes through the (now phosphor-styled) Dropdown via context.
  AttachControl: defaultPanelComponents.AttachControl,
  // LerpControl is likewise styling-independent; reuse dials' default.
  LerpControl: defaultPanelComponents.LerpControl,
}
