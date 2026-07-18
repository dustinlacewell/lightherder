import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        // Shiki is a hard dependency for CodeBlock but stays out of the
        // bundle — consumers get it transitively via pnpm, so the install
        // story is zero-config while the library output stays small for
        // consumers who don't use CodeBlock.
        'shiki/core',
        'shiki/engine/javascript',
        /^@shikijs\/langs\//,
      ],
      output: {
        // Emit the aggregated stylesheet at a stable name so consumers
        // can `import '@ldlework/phosphor/styles.css'`.
        assetFileNames: (info) => (info.name?.endsWith('.css') ? 'styles.css' : '[name][extname]'),
      },
    },
    sourcemap: true,
    cssCodeSplit: false,
    emptyOutDir: true,
  },
})
