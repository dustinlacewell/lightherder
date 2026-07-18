import { z } from 'zod'
import { defineTrait } from '@ldlework/workmark/define'

/** Hosts a Storybook docs site. Filter for `wm storybook`. */
export const storybook = defineTrait({
  name: 'storybook',
  schema: z.object({
    devPort: z.number().default(6006),
  }),
})
