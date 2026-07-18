import { z } from 'zod'
import { defineTrait } from '@ldlework/workmark/define'

/** Anything that runs a build step via pnpm in its own project dir. */
export const buildable = defineTrait({
  name: 'buildable',
  schema: z.object({
    command: z.string().default('pnpm build'),
  }),
})
