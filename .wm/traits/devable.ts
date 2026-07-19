import { z } from 'zod'
import { defineTrait } from '@ldlework/workmark/define'

/** Runs a dev server. Filter for `wm dev`. */
export const devable = defineTrait({
  name: 'devable',
  schema: z.object({
    command: z.string().default('pnpm dev'),
  }),
})
