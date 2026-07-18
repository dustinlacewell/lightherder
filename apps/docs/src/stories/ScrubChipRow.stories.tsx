import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Display, ScrubChipRow } from '@ldlework/phosphor'

const meta: Meta<typeof ScrubChipRow> = {
  title: 'Primitives/ScrubChipRow',
  component: ScrubChipRow,
}
export default meta

type Note = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'
const NOTES: ReadonlyArray<Note> = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

export const Default: StoryObj<typeof ScrubChipRow> = {
  render: () => {
    const [picked, setPicked] = useState<Note>('C')
    return (
      <Display>
        <ScrubChipRow<Note>
          items={NOTES.map((n) => ({ key: n, lit: n === picked, content: n }))}
          onSelect={(k) => setPicked(k)}
        />
        <div className="screen-row" style={{ marginTop: 12 }}>
          <span className="screen-row-label">Drag across</span>
          <span className="screen-row-readout">{picked}</span>
        </div>
      </Display>
    )
  },
}
