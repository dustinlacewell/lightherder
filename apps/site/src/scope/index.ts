/*
 * Site's scope layer — composes @ldlework/scope (signal modeling),
 * @ldlework/dials (parameters), and @ldlework/crt (rendering) into a
 * hero-shaped experience.
 *
 * The plain wave model + pumper stays in @ldlework/scope. Dials-side
 * types that mirror it, the hero preset, the panel, and the React
 * composer all live here.
 */

export * from './signal'
export * from './preset'
export * from './react'
