import { cmd } from '@ldlework/workmark/define'
import { devable } from '../traits/devable.js'

/** Launch a dev server. */
export default cmd({
  needs: [devable],
  select: 'one',
  interactive: true,
  handler: (_, { traits, sh }) => sh(traits.devable.command),
})
