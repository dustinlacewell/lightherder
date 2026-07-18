import { defineProject } from '@ldlework/workmark/define'

export default defineProject({
  name: 'phosphor-dials',
  tags: ['design-system'],
  has: {
    buildable: { command: 'pnpm build' },
    testable: { typecheck: 'pnpm typecheck' },
    publishable: { npmName: '@ldlework/phosphor-dials' },
  },
})
