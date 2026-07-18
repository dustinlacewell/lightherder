import type { Meta, StoryObj } from '@storybook/react'
import { Panel } from '@ldlework/phosphor'

const meta: Meta<typeof Panel> = {
  title: 'Primitives/Panel',
  component: Panel,
}
export default meta

export const Default: StoryObj<typeof Panel> = {
  render: () => (
    <Panel style={{ padding: '24px 32px', width: 380 }}>
      <div className="chrome-emboss" style={{ fontSize: 14, letterSpacing: '0.15em' }}>
        DECK A
      </div>
    </Panel>
  ),
}

export const Empty: StoryObj<typeof Panel> = {
  render: () => (
    <Panel style={{ width: 240, height: 80 }}>
      <span aria-hidden />
    </Panel>
  ),
}
