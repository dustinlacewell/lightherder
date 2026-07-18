import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { SidePanel, Display } from '@ldlework/phosphor'

const meta: Meta<typeof SidePanel> = {
  title: 'Primitives/SidePanel',
  component: SidePanel,
  parameters: {
    // Docks via fixed positioning against the viewport edge — needs
    // room around it rather than the centered padded-canvas default.
    layout: 'fullscreen',
  },
}
export default meta

export const Default: StoryObj<typeof SidePanel> = {
  render: () => {
    const [open, setOpen] = useState(true)
    return (
      <div style={{ height: '80vh', position: 'relative' }}>
        <SidePanel open={open} onToggle={() => setOpen((o) => !o)}>
          <Display>
            <div className="screen-row">
              <span className="screen-row-label">Tuning</span>
            </div>
          </Display>
        </SidePanel>
      </div>
    )
  },
}

export const DockedLeft: StoryObj<typeof SidePanel> = {
  render: () => {
    const [open, setOpen] = useState(true)
    return (
      <div style={{ height: '80vh', position: 'relative' }}>
        <SidePanel open={open} onToggle={() => setOpen((o) => !o)} side="left" width={280}>
          <Display>
            <div className="screen-row">
              <span className="screen-row-label">Presets</span>
            </div>
          </Display>
        </SidePanel>
      </div>
    )
  },
}
