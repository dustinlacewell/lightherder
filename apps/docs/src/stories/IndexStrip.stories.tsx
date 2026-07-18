import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { IndexStrip, Panel } from '@ldlework/phosphor'

const meta: Meta<typeof IndexStrip> = {
  title: 'Primitives/IndexStrip',
  component: IndexStrip,
}
export default meta

export const Default: StoryObj<typeof IndexStrip> = {
  render: () => {
    const [active, setActive] = useState(1)
    return (
      <Panel style={{ padding: 20, width: 320 }}>
        <IndexStrip count={4} active={active} onSelect={setActive} />
      </Panel>
    )
  },
}

/** Caller-supplied action tiles anchor to the right of the chip strip. */
export const WithActions: StoryObj<typeof IndexStrip> = {
  render: () => {
    const [count, setCount] = useState(3)
    const [active, setActive] = useState(0)
    return (
      <Panel style={{ padding: 20, width: 360 }}>
        <IndexStrip
          count={count}
          active={Math.min(active, count - 1)}
          onSelect={setActive}
          actions={[
            { icon: '🎲', label: 'randomize', onClick: () => {} },
            { icon: '+', label: 'add', onClick: () => setCount((c) => c + 1) },
            {
              icon: '−',
              label: 'remove',
              onClick: () => setCount((c) => Math.max(1, c - 1)),
              disabled: count <= 1,
            },
          ]}
        />
      </Panel>
    )
  },
}

/** `chipState` tags chips with a `data-chip-state` attribute for custom CSS hooks (e.g. muting). */
export const WithChipState: StoryObj<typeof IndexStrip> = {
  render: () => {
    const [active, setActive] = useState(0)
    return (
      <Panel style={{ padding: 20, width: 320 }}>
        <IndexStrip
          count={4}
          active={active}
          onSelect={setActive}
          chipState={(i) => (i === 2 ? 'muted' : undefined)}
        />
      </Panel>
    )
  },
}
