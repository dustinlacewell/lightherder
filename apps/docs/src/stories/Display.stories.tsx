import type { Meta, StoryObj } from '@storybook/react'
import { Display, SegmentedDisplay } from '@ldlework/phosphor'

const meta: Meta<typeof Display> = {
  title: 'Primitives/Display',
  component: Display,
}
export default meta

export const Default: StoryObj<typeof Display> = {
  render: () => (
    <Display>
      <div className="screen-chip-row">
        <span className="screen-chip" data-lit="true">ON AIR</span>
        <span className="screen-chip" data-lit="false">CUE</span>
        <span className="screen-chip" data-lit="alt">SOLO</span>
      </div>
    </Display>
  ),
}

export const WithHeaderAndFooter: StoryObj<typeof Display> = {
  render: () => (
    <Display
      header={
        <>
          <SegmentedDisplay>00:42</SegmentedDisplay>
          <SegmentedDisplay>−06.4</SegmentedDisplay>
        </>
      }
      footer={
        <span className="chrome-emboss" style={{ fontSize: 11, letterSpacing: '0.2em' }}>
          PHOSPHOR · MK II
        </span>
      }
    >
      <div className="screen-chip-row">
        <span className="screen-chip" data-lit="true">A</span>
        <span className="screen-chip" data-lit="false">B</span>
        <span className="screen-chip" data-lit="false">C</span>
      </div>
    </Display>
  ),
}

export const WithReadout: StoryObj<typeof Display> = {
  render: () => (
    <Display readout={<span className="screen-readout">H 248°</span>}>
      <div style={{ minHeight: 120 }} />
    </Display>
  ),
}
