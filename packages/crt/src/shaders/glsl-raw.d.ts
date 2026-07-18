/// <reference types="vite/client" />
// Ambient type for Vite's `?raw` query-string imports of GLSL.
// Lets `import src from './foo.frag.glsl?raw'` resolve as a string.
// The vite/client reference above also brings `import.meta.hot` into
// scope for any module under this package.
declare module '*.glsl?raw' {
  const src: string
  export default src
}
