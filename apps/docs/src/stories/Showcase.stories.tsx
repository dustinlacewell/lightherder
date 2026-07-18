import type { Meta, StoryObj } from '@storybook/react'
import { SettingsModalShowcase } from '../showcase/SettingsModalShowcase'
import { TapeDeckShowcase } from '../showcase/TapeDeckShowcase'

const meta: Meta = {
  title: 'Showcase',
}
export default meta

export const SettingsModal: StoryObj = {
  render: () => <SettingsModalShowcase />,
}

export const TapeDeck: StoryObj = {
  render: () => <TapeDeckShowcase />,
}
