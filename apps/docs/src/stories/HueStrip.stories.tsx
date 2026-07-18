import type { Meta, StoryObj } from '@storybook/react'
import { useEffect, useState } from 'react'
import { HueStrip, Display, Panel } from '@ldlework/phosphor'

const meta: Meta<typeof HueStrip> = {
  title: 'Primitives/HueStrip',
  component: HueStrip,
}
export default meta

/**
 * The HueStrip drives the global `--theme-hue` CSS variable. Dragging
 * re-skins every chrome primitive across the whole page in real time
 * — open another primitive's story in a second tab while you drag.
 */
export const Default: StoryObj<typeof HueStrip> = {
  render: () => {
    const [hue, setHue] = useState(82)
    useEffect(() => {
      document.documentElement.style.setProperty('--theme-hue', String(hue))
    }, [hue])
    return (
      <Panel style={{ padding: 20, width: 360 }}>
        <Display>
          <div className="screen-row">
            <span className="screen-row-label">Hue</span>
            <span className="screen-row-readout">
              H {Math.round(hue).toString().padStart(3, '0')}°
            </span>
          </div>
        </Display>
        <div style={{ height: 12 }} />
        <HueStrip hue={hue} onChange={setHue} />
      </Panel>
    )
  },
}
