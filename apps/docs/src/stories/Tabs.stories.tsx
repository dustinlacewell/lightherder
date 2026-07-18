import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Tabs, Panel } from '@ldlework/phosphor'

const meta: Meta<typeof Tabs> = {
  title: 'Primitives/Tabs',
  component: Tabs,
}
export default meta

const TAB_ITEMS = [
  { key: 'screen', label: 'Screen' },
  { key: 'waves', label: 'Waves' },
  { key: 'noise', label: 'Noise' },
]

export const Default: StoryObj<typeof Tabs> = {
  render: () => {
    const [active, setActive] = useState('waves')
    return (
      <Panel style={{ padding: 20, width: 320 }}>
        <Tabs tabs={TAB_ITEMS} active={active} onSelect={setActive} />
      </Panel>
    )
  },
}

export const WithDisabledTab: StoryObj<typeof Tabs> = {
  render: () => {
    const [active, setActive] = useState('screen')
    const tabs = [...TAB_ITEMS.slice(0, 2), { key: 'locked', label: 'Locked', disabled: true }]
    return (
      <Panel style={{ padding: 20, width: 320 }}>
        <Tabs tabs={tabs} active={active} onSelect={setActive} />
      </Panel>
    )
  },
}
