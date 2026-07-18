import { defineProject } from '@ldlework/workmark/define'

export default defineProject({
  name: 'docs',
  tags: ['app'],
  has: {
    buildable: { command: 'pnpm build' },
    testable: { typecheck: 'pnpm typecheck' },
    storybook: { devPort: 6006 },
  },
})
