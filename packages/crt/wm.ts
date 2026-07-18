import { defineProject } from '@ldlework/workmark/define'

export default defineProject({
  name: 'crt',
  tags: ['rendering'],
  has: {
    buildable: { command: 'pnpm build' },
    testable: { typecheck: 'pnpm typecheck' },
    publishable: { npmName: '@ldlework/crt' },
  },
})
