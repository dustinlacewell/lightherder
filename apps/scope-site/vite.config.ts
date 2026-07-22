import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Deployed at https://<user>.github.io/scope/ — set the base via
// VITE_BASE at build time.
//
// Resolve `@ldlework/scope` (and its crt/gl deps) to their TS sources
// (not the built dist) so HMR picks up library changes instantly in
// dev. The published packages still consume from `dist/` — these
// aliases only affect this site. More-specific subpaths (crt/react)
// come first: Vite matches aliases in array order.
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
        find: '@ldlework/scope',
        replacement: resolve(__dirname, '../../packages/scope/src/index.ts'),
      },
      // gl subpath entries (crt + scope import @ldlework/gl/substrate).
      // These must precede the bare '@ldlework/gl' alias so the
      // more-specific subpath wins — Vite matches aliases in array order.
      {
        find: '@ldlework/gl/substrate',
        replacement: resolve(__dirname, '../../packages/gl/src/substrate/index.ts'),
      },
      {
        find: '@ldlework/gl/camera',
        replacement: resolve(__dirname, '../../packages/gl/src/camera/index.ts'),
      },
      {
        find: '@ldlework/gl/dynamic-buffer',
        replacement: resolve(__dirname, '../../packages/gl/src/dynamic-buffer/index.ts'),
      },
      {
        find: '@ldlework/gl',
        replacement: resolve(__dirname, '../../packages/gl/src/index.ts'),
      },
    ],
  },
})
