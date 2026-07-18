import type { HTMLAttributes, ReactNode } from 'react'

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional. An empty Panel is just the chassis itself; useful as
   *  a backdrop or as a placeholder you'll mount controls onto. */
  children?: ReactNode
}

/**
 * Raised chrome plate. Built on the same shared raised-object
 * substrate (`.chrome-raised`) that PushButton uses, just larger and
 * with a flatter thrust ratio. Sanded-plastic grain paints onto the
 * front face.
 */
export function Panel({ className = '', children, ...rest }: PanelProps) {
  return (
    <div {...rest} className={`panel chrome-raised ${className}`}>
      <span className="chrome-raised-shadow" aria-hidden="true" />
      <span className="chrome-raised-edge" aria-hidden="true" />
      <span className="chrome-raised-front" aria-hidden="true" />
      {children}
    </div>
  )
}
