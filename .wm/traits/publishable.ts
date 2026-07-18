import { z } from 'zod'
import { defineTrait } from '@ldlework/workmark/define'

/** Publishes to npm. Filter for `wm publish`. */
export const publishable = defineTrait({
  name: 'publishable',
  schema: z.object({
    npmName: z.string(),
  }),
})
