import { defineProject } from '@ldlework/workmark/define'

export default defineProject({
  name: 'gl',
  tags: ['foundation'],
  has: {
    buildable: { command: 'pnpm build' },
    testable: { typecheck: 'pnpm typecheck' },
    publishable: { npmName: '@ldlework/gl' },
  },
})
