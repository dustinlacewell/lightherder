import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Dropdown, Panel } from '@ldlework/phosphor'

const meta: Meta<typeof Dropdown> = {
  title: 'Primitives/Dropdown',
  component: Dropdown,
}
export default meta

const OPTIONS = [
  { value: 'sine', label: 'Sine' },
  { value: 'tri', label: 'Triangle' },
  { value: 'saw', label: 'Sawtooth' },
  { value: 'square', label: 'Square' },
]

export const Default: StoryObj<typeof Dropdown> = {
  render: () => {
    const [value, setValue] = useState('sine')
    return (
      <Panel style={{ padding: 20, width: 220 }}>
        <Dropdown value={value} options={OPTIONS} onChange={setValue} />
      </Panel>
    )
  },
}

export const Disabled: StoryObj<typeof Dropdown> = {
  render: () => (
    <Panel style={{ padding: 20, width: 220 }}>
      <Dropdown value="sine" options={OPTIONS} onChange={() => {}} disabled />
    </Panel>
  ),
}
