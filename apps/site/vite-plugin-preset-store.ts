/*
 * Vite middleware plugin: dev-only POST/GET handlers for the
 * scope preset JSON. Lets the lil-gui overlay in the site write
 * preset changes back to a real file on disk, so live tuning
 * persists across reloads and is reviewable in git.
 *
 * Endpoint layout:
 *   GET  /__preset/scope   → 200 with the current JSON, 404 if
 *                            the file doesn't exist yet (caller
 *                            falls back to in-memory defaults)
 *   POST /__preset/scope   → body is the new JSON; written through
 *                            to disk under `targetPath`
 *
 * The plugin is `apply: 'serve'` so it doesn't ship in production
 * builds. The same JSON file *can* be served as a static asset in
 * prod (Vite picks up files in /public/ automatically); leaving that
 * out of this plugin's responsibility.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'

export interface PresetStoreOptions {
  /** URL path the middleware listens on. */
  endpoint: string
  /** Absolute or relative-to-cwd path to the JSON file on disk. */
  targetPath: string
  /** Hard cap on POST body size in bytes — guards against runaway input. */
  maxBodyBytes?: number
}

const DEFAULT_MAX_BODY = 64 * 1024 // 64 KB — generous; preset is ~1 KB.

export function presetStore(options: PresetStoreOptions): Plugin {
  const maxBody = options.maxBodyBytes ?? DEFAULT_MAX_BODY
  // Resolve once at config time so logs are unambiguous.
  const filePath = resolve(process.cwd(), options.targetPath)

  return {
    name: 'preset-store',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(options.endpoint, (req, res, next) => {
        handle(req, res, filePath, maxBody).catch((err) => {
          server.config.logger.error(
            `[preset-store] handler failed: ${err.message}`,
          )
          if (!res.headersSent) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: err.message }))
          }
        })
        // Don't call next() inside handle — middleware terminates here
        // regardless of method, returning a 405 for anything but GET/POST.
        void next
      })
      server.config.logger.info(
        `[preset-store] mounted ${options.endpoint} → ${filePath}`,
      )
    },
  }
}

async function handle(
  req: IncomingMessage & { originalUrl?: string },
  res: ServerResponse,
  filePath: string,
  maxBody: number,
) {
  if (req.method === 'GET') {
    try {
      const data = await readFile(filePath, 'utf8')
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(data)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        res.statusCode = 404
        res.end('{}')
      } else {
        throw err
      }
    }
    return
  }

  if (req.method === 'POST') {
    const body = await readBody(req, maxBody)
    // Validate it's parseable JSON before touching disk. Don't enforce
    // a shape — that's the schema's job at the call site, and we want
    // additive schema evolution to "just work" without breaking writes.
    try {
      JSON.parse(body)
    } catch (err) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: 'invalid JSON', detail: String(err) }))
      return
    }
    await writeFile(filePath, body, 'utf8')
    res.statusCode = 204
    res.end()
    return
  }

  res.statusCode = 405
  res.setHeader('Allow', 'GET, POST')
  res.end()
}

async function readBody(
  req: Connect.IncomingMessage,
  maxBody: number,
): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = []
    let received = 0
    req.on('data', (chunk: Buffer) => {
      received += chunk.length
      if (received > maxBody) {
        rejectBody(new Error(`body too large (>${maxBody} bytes)`))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      resolveBody(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', rejectBody)
  })
}
