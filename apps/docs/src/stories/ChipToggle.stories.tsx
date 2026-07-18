import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { ChipToggle, Display } from '@ldlework/phosphor'

const meta: Meta<typeof ChipToggle> = {
  title: 'Primitives/ChipToggle',
  component: ChipToggle,
}
export default meta

export const Default: StoryObj<typeof ChipToggle> = {
  render: () => {
    const [on, setOn] = useState(true)
    return (
      <Display>
        <div className="screen-chip-row">
          <ChipToggle value={on} onChange={setOn} onLabel="ON" offLabel="OFF" />
        </div>
      </Display>
    )
  },
}

/** Without onLabel/offLabel the chip's width follows `children` and
 *  may resize as state toggles. Useful when both states have the
 *  same number of characters anyway. */
export const Unstable: StoryObj<typeof ChipToggle> = {
  render: () => {
    const [on, setOn] = useState(true)
    return (
      <Display>
        <div className="screen-chip-row">
          <ChipToggle value={on} onChange={setOn}>{on ? 'YES' : 'NOPE'}</ChipToggle>
        </div>
      </Display>
    )
  },
}
