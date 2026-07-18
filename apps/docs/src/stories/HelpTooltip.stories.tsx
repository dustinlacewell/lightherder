import type { Meta, StoryObj } from '@storybook/react'
import { HelpTooltip, Panel } from '@ldlework/phosphor'

const meta: Meta<typeof HelpTooltip> = {
  title: 'Primitives/HelpTooltip',
  component: HelpTooltip,
}
export default meta

/**
 * Hover or focus the "?" glyph to open the popover. It's portaled to
 * `document.body`, so it escapes this panel's own stacking/overflow —
 * try it near the edge of the preview frame.
 */
export const Default: StoryObj<typeof HelpTooltip> = {
  render: () => (
    <Panel style={{ padding: 40, width: 280, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span>Beam intensity</span>
      <HelpTooltip
        title="Beam intensity"
        description="Scales how brightly the trace deposits into the phosphor accumulator each frame."
      />
    </Panel>
  ),
}

export const NearViewportEdge: StoryObj<typeof HelpTooltip> = {
  render: () => (
    <Panel style={{ padding: 20, width: 280, textAlign: 'right' }}>
      <HelpTooltip
        title="Flip behavior"
        description="When there isn't enough room below the trigger, the popover flips above it. Horizontal position clamps to the viewport."
      />
    </Panel>
  ),
}
