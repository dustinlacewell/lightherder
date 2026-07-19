import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* two entries: the bench (index.html) and the read-only viewer
   (viewer.html). The viewer imports session/runtime/patch/engine but
   never React Flow, so rollup gives it its own lean chunk. */
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        viewer: resolve(__dirname, 'viewer.html'),
      },
    },
  },
});
