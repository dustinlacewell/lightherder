import { cmd } from '@ldlework/workmark/define'
import { testable } from '../traits/testable.js'

/** Typecheck one or more packages. */
export default cmd({
  needs: [testable],
  handler: (_, { traits, sh }) => sh(traits.testable.typecheck),
})
