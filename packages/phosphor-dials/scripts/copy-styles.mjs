/*
 * Copy CSS assets from src/ to dist/ post-tsc — tsc only emits JS/dts.
 */
import { cp, mkdir, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const srcDir = join(root, '..', 'src')
const dstDir = join(root, '..', 'dist')

await mkdir(dstDir, { recursive: true })
for (const name of await readdir(srcDir)) {
  if (!name.endsWith('.css')) continue
  await cp(join(srcDir, name), join(dstDir, name))
}
