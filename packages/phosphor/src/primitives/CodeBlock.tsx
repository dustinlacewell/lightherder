import { useEffect, useState, type HTMLAttributes } from 'react'
import {
  createHighlighterCore,
  type HighlighterCore,
  type ThemeRegistration,
} from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { Display } from './Display'

/**
 * Languages CodeBlock can highlight. Adding a new one means:
 *   1. Add the literal to this union.
 *   2. Add a lazy `import('@shikijs/langs/<name>')` to `getHighlighter`.
 * Both happen in this file — nothing leaks out.
 */
export type CodeLang = 'tsx' | 'ts' | 'jsx' | 'js' | 'css' | 'bash' | 'json' | 'html'

/**
 * A Shiki theme whose token colors are CSS variables. The variables
 * are defined in codeblock.css as OKLCH expressions of --theme-hue,
 * so dragging a HueStrip (or otherwise updating the theme) re-tints
 * every keyword, string, and comment across every CodeBlock in
 * lockstep with the rest of the phosphor chassis.
 *
 * Token roles map to the chrome brightness ladder:
 *   --code-keyword   bright lit (like an active control)
 *   --code-string    mid lit
 *   --code-number    mid lit, slightly different hue offset
 *   --code-comment   faint (dim, low chroma, italic)
 *   --code-fn        bright lit
 *   --code-type      bright lit, hue-shifted
 *   --code-punct     dim
 *   --code-tag       bright lit
 *   --code-attr      mid lit, hue-shifted
 *   --code-plain     fg
 */
const phosphorTheme: ThemeRegistration = {
  name: 'phosphor',
  type: 'dark',
  // Shiki requires hex fallbacks for bg/fg; the inline-style spans
  // use whatever color: we set in `tokenColors`. The bg here is only
  // used if the consumer doesn't override it, which our CSS does.
  bg: '#0a0a0a',
  fg: '#cccccc',
  colors: {
    'editor.background': '#0a0a0a',
    'editor.foreground': '#cccccc',
  },
  tokenColors: [
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: 'var(--code-comment)', fontStyle: 'italic' } },
    { scope: ['string', 'string.quoted', 'string.template'], settings: { foreground: 'var(--code-string)' } },
    { scope: ['constant.numeric', 'constant.language'], settings: { foreground: 'var(--code-number)' } },
    {
      scope: [
        'keyword',
        'keyword.control',
        'keyword.operator.new',
        'storage.type',
        'storage.modifier',
      ],
      settings: { foreground: 'var(--code-keyword)' },
    },
    { scope: ['keyword.operator'], settings: { foreground: 'var(--code-punct)' } },
    {
      scope: [
        'entity.name.function',
        'support.function',
        'meta.function-call entity.name.function',
      ],
      settings: { foreground: 'var(--code-fn)' },
    },
    {
      scope: [
        'entity.name.type',
        'entity.name.class',
        'support.class',
        'support.type',
      ],
      settings: { foreground: 'var(--code-type)' },
    },
    { scope: ['entity.name.tag', 'punctuation.definition.tag'], settings: { foreground: 'var(--code-tag)' } },
    { scope: ['entity.other.attribute-name'], settings: { foreground: 'var(--code-attr)' } },
    { scope: ['variable', 'variable.other', 'variable.parameter'], settings: { foreground: 'var(--code-plain)' } },
    { scope: ['punctuation', 'meta.brace', 'meta.delimiter'], settings: { foreground: 'var(--code-punct)' } },
    // CSS specifics
    { scope: ['support.type.property-name.css'], settings: { foreground: 'var(--code-attr)' } },
    { scope: ['entity.name.tag.css'], settings: { foreground: 'var(--code-tag)' } },
    { scope: ['support.constant.property-value.css'], settings: { foreground: 'var(--code-keyword)' } },
    // Shell
    { scope: ['support.function.builtin.shell', 'variable.parameter.shell'], settings: { foreground: 'var(--code-fn)' } },
  ],
}

/**
 * Lazy singleton highlighter. Created on the first <CodeBlock> render,
 * shared by every subsequent one. Grammars are dynamic imports so
 * the consumer's bundler can code-split them.
 */
let highlighterPromise: Promise<HighlighterCore> | null = null
function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [phosphorTheme],
      langs: [
        import('@shikijs/langs/tsx'),
        import('@shikijs/langs/typescript'),
        import('@shikijs/langs/jsx'),
        import('@shikijs/langs/javascript'),
        import('@shikijs/langs/css'),
        import('@shikijs/langs/bash'),
        import('@shikijs/langs/json'),
        import('@shikijs/langs/html'),
      ],
      engine: createJavaScriptRegexEngine(),
    })
  }
  return highlighterPromise
}

interface CodeBlockProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Source to highlight. Whitespace is preserved verbatim. */
  code: string
  /** Grammar to highlight with. */
  lang: CodeLang
}

/**
 * A self-mounted code display: a Display (chrome Lip + black Bezel ring
 * + dark Screen) with syntax-highlighted source on the Screen. Reads
 * as a piece of hardware on any background — works bare, inside a
 * Panel, inside another Display.
 *
 * The Bezel ring IS the OLED-style content padding around the code;
 * the inner `.codeblock-pre` only adds a small (10×12) breathing room
 * so the code doesn't kiss the glass chamfer.
 *
 * Tokens are colored via CSS variables (`--code-*`) that resolve from
 * `--theme-hue`, so the highlighting re-skins live along with the rest
 * of the chassis when the theme hue changes.
 */
export function CodeBlock({ code, lang, className, ...rest }: CodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    getHighlighter().then((hl) => {
      if (cancelled) return
      setHtml(hl.codeToHtml(code, { lang, theme: 'phosphor' }))
    })
    return () => {
      cancelled = true
    }
  }, [code, lang])

  // Pre-highlight fallback so layout doesn't jump when the
  // highlighter resolves. Same wrapper class either way; the
  // rendered content swaps from a plain <pre> to Shiki's spans.
  const content =
    html === null ? (
      <pre className="codeblock-pre">
        <code>{code}</code>
      </pre>
    ) : (
      <div
        className="codeblock-pre"
        data-shiki
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )

  return (
    <Display
      {...rest}
      className={className ? `codeblock ${className}` : 'codeblock'}
    >
      {content}
    </Display>
  )
}
