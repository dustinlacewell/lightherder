/*
 * Generate a `.glsl.ts` module next to each `.glsl` source, exporting
 * its contents as a plain string constant. Runs before `tsc` so the
 * generated modules compile like any other TS source — no bundler-
 * specific import query, no post-build asset copy.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const shadersDir = join(root, '..', 'src', 'shaders')

for (const name of await readdir(shadersDir)) {
  if (!name.endsWith('.glsl')) continue
  const src = await readFile(join(shadersDir, name), 'utf8')
  const out = `// Generated from ${name} by scripts/gen-shaders.mjs — do not edit.\nexport default ${JSON.stringify(src)}\n`
  await writeFile(join(shadersDir, `${name}.gen.ts`), out)
}
