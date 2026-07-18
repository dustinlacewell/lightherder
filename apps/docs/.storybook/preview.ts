import type { Preview } from '@storybook/react'
import '@ldlework/phosphor/styles.css'
import './preview.css'

const preview: Preview = {
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'shelf',
      values: [
        // A warm low-key backdrop reminiscent of a wood hi-fi shelf —
        // so the chrome plates look like they're sitting on furniture,
        // not floating on white.
        { name: 'shelf', value: '#1a1512' },
        { name: 'rack', value: '#0a0a0a' },
        { name: 'lab', value: '#222' },
      ],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
}

export default preview
