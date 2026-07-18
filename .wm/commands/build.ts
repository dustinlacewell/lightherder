import { cmd } from '@ldlework/workmark/define'
import { buildable } from '../traits/buildable.js'

/** Build one or more packages. */
export default cmd({
  needs: [buildable],
  handler: (_, { traits, sh }) => sh(traits.buildable.command),
})
