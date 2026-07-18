import { z } from 'zod'
import { defineTrait } from '@ldlework/workmark/define'

/** Has a typecheck command — used by `wm typecheck`. */
export const testable = defineTrait({
  name: 'testable',
  schema: z.object({
    typecheck: z.string().default('pnpm typecheck'),
  }),
})
