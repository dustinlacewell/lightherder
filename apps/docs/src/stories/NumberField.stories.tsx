import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { NumberField, Panel } from '@ldlework/phosphor'

const meta: Meta<typeof NumberField> = {
  title: 'Primitives/NumberField',
  component: NumberField,
}
export default meta

export const Default: StoryObj<typeof NumberField> = {
  render: () => {
    const [value, setValue] = useState(440)
    return (
      <Panel style={{ padding: 20, width: 200 }}>
        <NumberField value={value} onChange={setValue} />
      </Panel>
    )
  },
}

export const MinMaxStep: StoryObj<typeof NumberField> = {
  render: () => {
    const [value, setValue] = useState(0.5)
    return (
      <Panel style={{ padding: 20, width: 200 }}>
        <NumberField value={value} min={0} max={1} step={0.01} onChange={setValue} />
      </Panel>
    )
  },
}

export const ExplicitWidth: StoryObj<typeof NumberField> = {
  render: () => {
    const [value, setValue] = useState(12)
    return (
      <Panel style={{ padding: 20, width: 200 }}>
        <NumberField value={value} width={64} onChange={setValue} />
      </Panel>
    )
  },
}

export const Disabled: StoryObj<typeof NumberField> = {
  render: () => (
    <Panel style={{ padding: 20, width: 200 }}>
      <NumberField value={7} onChange={() => {}} disabled />
    </Panel>
  ),
}
