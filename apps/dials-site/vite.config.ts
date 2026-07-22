import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Deployed at https://<user>.github.io/dials/ — set the base via
// VITE_BASE at build time.
//
// Resolve `@ldlework/dials` to its TS source (not the built dist) so
// HMR picks up library changes instantly in dev. The published package
// still consumes from `dist/` — this alias only affects this site.
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
    ],
  },
})
