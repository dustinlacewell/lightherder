import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { presetStore } from './vite-plugin-preset-store'

// Site is deployed at https://<user>.github.io/phosphor/ — set the base via
// VITE_BASE at build time. Storybook lives at /phosphor/storybook/.
//
// Resolve `@ldlework/phosphor` to its TS source (not the built dist) so
// HMR picks up primitive changes instantly in dev. The published package
// still consumes from `dist/` — this alias only affects this site.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    // Dev-only: serves GET/POST /__preset/scope so the lil-gui overlay
    // can read and write the hero-scope preset JSON. Inactive in build.
    presetStore({
      endpoint: '/__preset/scope',
      targetPath: 'scope-preset.json',
    }),
  ],
  resolve: {
    alias: [
      // Subpath alias must come first — Vite matches in order. The bare
      // `@ldlework/phosphor` → TS entry; `/styles.css` goes through to
      // the source CSS aggregator so the site sees library CSS changes
      // without a library rebuild.
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
