import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { PushButton, Panel } from '@ldlework/phosphor'

const meta: Meta<typeof PushButton> = {
  title: 'Primitives/PushButton',
  component: PushButton,
}
export default meta

export const Default: StoryObj<typeof PushButton> = {
  render: () => <PushButton>Engage</PushButton>,
}

export const Toggled: StoryObj<typeof PushButton> = {
  render: () => {
    const [on, setOn] = useState(false)
    return (
      <PushButton selected={on} onClick={() => setOn((s) => !s)}>
        {on ? 'On' : 'Off'}
      </PushButton>
    )
  },
}

export const InAPanel: StoryObj<typeof PushButton> = {
  render: () => (
    <Panel style={{ padding: 20, display: 'flex', gap: 12 }}>
      <PushButton>Play</PushButton>
      <PushButton>Pause</PushButton>
      <PushButton selected>Loop</PushButton>
      <PushButton disabled>Mute</PushButton>
    </Panel>
  ),
}
