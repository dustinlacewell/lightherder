/*
 * @ldlework/crt/react — the React mount.
 *
 * Split from the core entrypoint so non-React hosts (server-side
 * rendering, a game loop, another renderer sharing a GL context) can
 * depend on `@ldlework/crt` without pulling in React. Construct
 * `Pipeline` directly from the core export for that case.
 */
export { CrtSurface } from './CrtSurface'
export type { CrtPreset, CrtSurfaceProps, DrawCtx, PassFactory } from '../types'
