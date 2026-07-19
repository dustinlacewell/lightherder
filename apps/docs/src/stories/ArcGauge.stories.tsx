import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { ArcGauge, Panel } from '@ldlework/phosphor'

const meta: Meta<typeof ArcGauge> = {
  title: 'Primitives/ArcGauge',
  component: ArcGauge,
}
export default meta

/**
 * The Knob's quiet sibling: same sweep, no cap, thin fill in the
 * secondary accent. Drag vertically (Shift = fine), arrows/Home on
 * the keyboard, double-click to reset to `defaultValue`.
 */
export const Default: StoryObj<typeof ArcGauge> = {
  render: () => {
    const [v, setV] = useState(0.25)
    return (
      <Panel style={{ padding: 20 }}>
        <ArcGauge
          value={v}
          range={[0, 2]}
          step={0.01}
          defaultValue={0}
          label="lerp"
          format={(x) => `${x.toFixed(2)}s`}
          onChange={setV}
        />
      </Panel>
    )
  },
}

/**
 * Bare gauge, no label, built-in readout — the smallest form it takes
 * when tucked beside a main control.
 */
export const Bare: StoryObj<typeof ArcGauge> = {
  render: () => {
    const [v, setV] = useState(0.6)
    return (
      <Panel style={{ padding: 20 }}>
        <ArcGauge value={v} range={[0, 1]} onChange={setV} />
      </Panel>
    )
  },
}
