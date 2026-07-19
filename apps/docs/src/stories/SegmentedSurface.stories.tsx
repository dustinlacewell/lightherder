import type { Meta, StoryObj } from '@storybook/react'
import { Panel, SegmentedSurface } from '@ldlework/phosphor'

const meta: Meta<typeof SegmentedSurface> = {
  title: 'Primitives/SegmentedSurface',
  component: SegmentedSurface,
}
export default meta

/**
 * `SegmentedSurface` is the bare two-layer cutout `SegmentedDisplay`
 * is built on. Where `SegmentedDisplay` assumes "lit text + optional
 * ghost text" in the segment font, `lit`/`ghost` here accept any
 * ReactNode — mixed fonts, icons, arbitrary markup.
 */
export const MixedContent: StoryObj<typeof SegmentedSurface> = {
  render: () => (
    <Panel style={{ padding: 20 }}>
      <SegmentedSurface
        lit={
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontFamily: 'inherit', fontSize: 12 }}>REC</span>
            <span>03:14</span>
          </span>
        }
      />
    </Panel>
  ),
}

export const WithGhost: StoryObj<typeof SegmentedSurface> = {
  render: () => (
    <Panel style={{ padding: 20 }}>
      <SegmentedSurface lit="03:14" ghost="88:88" />
    </Panel>
  ),
}

export const GhostOffset: StoryObj<typeof SegmentedSurface> = {
  render: () => (
    <Panel style={{ padding: 20 }}>
      <SegmentedSurface lit="-06.4" ghost="-88.8" ghostOffset={{ x: 2, y: 2 }} />
    </Panel>
  ),
}

/**
 * `color` hue-locks this display regardless of the surrounding theme
 * — e.g. a green clock that stays green on a blue-themed page.
 */
export const HueLocked: StoryObj<typeof SegmentedSurface> = {
  render: () => (
    <Panel style={{ padding: 20, display: 'flex', gap: 12 }}>
      <SegmentedSurface lit="12:00" color="#33ff66" />
      <SegmentedSurface lit="AM" color="#ff9933" />
    </Panel>
  ),
}
