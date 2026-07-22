import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Deployed at https://<user>.github.io/phosphor-dials/ — set the base via
// VITE_BASE at build time.
//
// Resolve the workspace libraries to their TS/CSS source (not the built
// dist) so HMR picks up library changes instantly in dev. Published
// packages still consume from `dist/` — these aliases only affect this
// site. Subpath aliases come FIRST — Vite matches in order, so the bare
// package alias must not shadow its `/react` or `/styles.css` subpath.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: '@ldlework/dials/react',
        replacement: resolve(__dirname, '../../packages/dials/src/react/index.ts'),
      },
      {
        find: '@ldlework/dials',
        replacement: resolve(__dirname, '../../packages/dials/src/index.ts'),
      },
      {
        find: '@ldlework/phosphor/styles.css',
        replacement: resolve(__dirname, '../../packages/phosphor/src/styles/index.css'),
      },
      {
        find: '@ldlework/phosphor',
        replacement: resolve(__dirname, '../../packages/phosphor/src/index.ts'),
      },
      {
        find: '@ldlework/phosphor-dials/styles.css',
        replacement: resolve(__dirname, '../../packages/phosphor-dials/src/styles.css'),
      },
      {
        find: '@ldlework/phosphor-dials',
        replacement: resolve(__dirname, '../../packages/phosphor-dials/src/index.ts'),
      },
    ],
  },
})
