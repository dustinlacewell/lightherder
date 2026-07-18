# @ldlework/gl

WebGL2 substrate — the boring-but-essential infrastructure layer underneath any non-trivial WebGL2 renderer. No engine, no scene graph, no framework. Just the primitives you keep re-writing every time you reach for `gl.createShader`.

## What's in it

- **`substrate`** — `compileShader`, `createProgram`, `shaderSrc` (define injection), `createTexture2D` / `resizeTexture2D`, `RenderTarget` + `createRenderTarget` / `toTarget` / `toScreen`, `createFullscreenQuad` / `createClipspaceQuad` / `createMapQuad`, and a minimal `Pass` interface convention.
- **`camera`** — a pan-and-zoom 2D camera producing a `mat3` for `uniformMatrix3fv`. Pure math, no DOM event handling.
- **`dynamic-buffer`** — `DynamicInstanceBuffer`, the grow-on-demand instance VBO pattern you write once and then copy into every project.

## Usage

```ts
import { createProgram, createRenderTarget, toTarget, toScreen, Camera } from '@ldlework/gl'

const gl = canvas.getContext('webgl2')!
const program = createProgram(gl, vertSrc, fragSrc)
const target = createRenderTarget(gl, { width: 1024, height: 1024, internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filter: gl.LINEAR })
toTarget(gl, target, () => {
  gl.useProgram(program)
  // ... draw into the target
})
toScreen(gl, canvas.width, canvas.height, () => {
  // ... composite `target.tex` to the screen
})
```

## License

MIT.
