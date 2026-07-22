import { defineProject } from '@ldlework/workmark/define'

export default defineProject({
  name: 'dials-site',
  tags: ['app'],
  has: {
    buildable: { command: 'pnpm build' },
    testable: { typecheck: 'pnpm typecheck' },
    devable: { command: 'pnpm dev' },
  },
})
