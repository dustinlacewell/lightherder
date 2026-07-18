/*
 * Copy beam .glsl assets from src/beam/shaders/ to dist/beam/shaders/
 * post-tsc — same rationale as crt's copy-shaders script.
 */
import { mkdir, cp, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const srcDir = join(root, '..', 'src', 'beam', 'shaders')
const dstDir = join(root, '..', 'dist', 'beam', 'shaders')

await mkdir(dstDir, { recursive: true })
for (const name of await readdir(srcDir)) {
  if (!name.endsWith('.glsl')) continue
  await cp(join(srcDir, name), join(dstDir, name))
}
