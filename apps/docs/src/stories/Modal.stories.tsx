import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Modal, Display, PushButton, ChipToggle } from '@ldlework/phosphor'

const meta: Meta<typeof Modal> = {
  title: 'Primitives/Modal',
  component: Modal,
}
export default meta

export const Default: StoryObj<typeof Modal> = {
  render: () => {
    const [open, setOpen] = useState(false)
    const [confirmed, setConfirmed] = useState(false)
    return (
      <>
        <PushButton onClick={() => setOpen(true)}>Open dialog</PushButton>
        <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Example">
          <Display>
            <div className="screen-chip-row">
              <span className="screen-chip" data-lit="true">ARE YOU SURE?</span>
            </div>
            <div className="screen-divider" />
            <div className="screen-row">
              <span className="screen-row-label">Confirm</span>
              <ChipToggle value={confirmed} onChange={setConfirmed}>
                {confirmed ? 'YES' : 'NO'}
              </ChipToggle>
            </div>
          </Display>
        </Modal>
      </>
    )
  },
}
