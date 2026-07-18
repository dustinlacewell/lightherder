import type { Meta, StoryObj } from '@storybook/react'
import { Panel, SegmentedDisplay } from '@ldlework/phosphor'

const meta: Meta<typeof SegmentedDisplay> = {
  title: 'Primitives/SegmentedDisplay',
  component: SegmentedDisplay,
}
export default meta

export const Green: StoryObj<typeof SegmentedDisplay> = {
  render: () => (
    <Panel style={{ padding: 20 }}>
      <SegmentedDisplay>03:14</SegmentedDisplay>
    </Panel>
  ),
}

export const Accent: StoryObj<typeof SegmentedDisplay> = {
  render: () => (
    <Panel style={{ padding: 20 }}>
      <SegmentedDisplay>-06.4</SegmentedDisplay>
    </Panel>
  ),
}

export const Side: StoryObj<typeof SegmentedDisplay> = {
  render: () => (
    <Panel style={{ padding: 20, display: 'flex', gap: 12 }}>
      <SegmentedDisplay>03:14</SegmentedDisplay>
      <SegmentedDisplay>-06.4</SegmentedDisplay>
    </Panel>
  ),
}
