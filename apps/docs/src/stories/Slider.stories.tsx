import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Slider, Panel } from '@ldlework/phosphor'

const meta: Meta<typeof Slider> = {
  title: 'Primitives/Slider',
  component: Slider,
}
export default meta

export const Default: StoryObj<typeof Slider> = {
  render: () => {
    const [value, setValue] = useState(0.5)
    return (
      <Panel style={{ padding: 20, width: 280 }}>
        <Slider value={value} min={0} max={1} onChange={setValue} />
      </Panel>
    )
  },
}

/**
 * `scale="log"` maps the slider's linear drag position onto a
 * logarithmic value range — useful for frequency/rate dials where
 * low-end precision matters more than high-end. Requires `min > 0`.
 */
export const LogScale: StoryObj<typeof Slider> = {
  render: () => {
    const [value, setValue] = useState(600)
    return (
      <Panel style={{ padding: 20, width: 280 }}>
        <Slider value={value} min={50} max={3000} scale="log" onChange={setValue} />
      </Panel>
    )
  },
}

export const Disabled: StoryObj<typeof Slider> = {
  render: () => (
    <Panel style={{ padding: 20, width: 280 }}>
      <Slider value={0.3} min={0} max={1} onChange={() => {}} disabled />
    </Panel>
  ),
}
