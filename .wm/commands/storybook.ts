import { cmd } from '@ldlework/workmark/define'
import { storybook } from '../traits/storybook.js'

/** Launch the Storybook dev server for the docs site. */
export default cmd({
  needs: [storybook],
  select: 'one',
  interactive: true,
  handler: (_, { sh }) => sh('pnpm dev'),
})
