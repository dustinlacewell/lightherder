import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Deployed at https://<user>.github.io/crt/ — set the base via
// VITE_BASE at build time.
//
// Resolve `@ldlework/crt` (and its `/react` subpath) to their TS source
// (not the built dist) so HMR picks up library changes instantly in dev.
// The published package still consumes from `dist/` — this alias only
// affects this site. Alias the more specific subpath first.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: '@ldlework/crt/react',
        replacement: resolve(__dirname, '../../packages/crt/src/react/index.ts'),
      },
      {
        find: '@ldlework/crt',
        replacement: resolve(__dirname, '../../packages/crt/src/index.ts'),
      },
      {
        find: '@ldlework/phosphor/styles.css',
        replacement: resolve(__dirname, '../../packages/phosphor/src/styles/index.css'),
      },
      {
        find: '@ldlework/phosphor',
        replacement: resolve(__dirname, '../../packages/phosphor/src/index.ts'),
      },
    ],
  },
})
