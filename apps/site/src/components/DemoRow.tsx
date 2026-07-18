import type { ReactNode } from 'react'

interface DemoRowProps {
  /** Component name — rendered as the section heading. */
  name: string
  /** One-sentence description. */
  description: string
  /** The live demo. */
  demo: ReactNode
  /** Which side the demo sits on. Alternate per row down the page. */
  side?: 'left' | 'right'
  /** Optional id for anchor linking. */
  id?: string
}

/**
 * One row of the component listing — live demo on one side, prose on
 * the other. The order flips per row so the eye zig-zags down the
 * page. Source examples live in Storybook (one source of truth),
 * not on the marketing site.
 */
export function DemoRow({ name, description, demo, side = 'left', id }: DemoRowProps) {
  return (
    <div className="site-row" data-side={side} id={id}>
      <div className="site-row-demo">{demo}</div>
      <div className="site-row-text">
        <h3 className="site-row-title">{name}</h3>
        <p className="site-prose">{description}</p>
      </div>
    </div>
  )
}
