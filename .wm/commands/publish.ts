import { cmd } from '@ldlework/workmark/define'
import { publishable } from '../traits/publishable.js'

/** Publish a package to npm. Builds first via pnpm publish's prepublish hook. */
export default cmd({
  needs: [publishable],
  select: 'one',
  handler: (_, { sh }) => sh('pnpm publish --access public'),
})
