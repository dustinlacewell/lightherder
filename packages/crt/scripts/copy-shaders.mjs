/*
 * Copy .glsl assets from src/shaders/ to dist/shaders/ post-tsc.
 *
 * Consumers (Vite apps) import shader strings via `?raw` query, and
 * the JS emitted from tsc preserves the same relative path it had in
 * source — `../shaders/foo.glsl?raw`. So the files have to live next
 * to the compiled JS at the same relative offset, hence this copy.
 */
import { mkdir, cp, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const srcDir = join(root, '..', 'src', 'shaders')
const dstDir = join(root, '..', 'dist', 'shaders')

await mkdir(dstDir, { recursive: true })
for (const name of await readdir(srcDir)) {
  if (!name.endsWith('.glsl')) continue
  await cp(join(srcDir, name), join(dstDir, name))
}
