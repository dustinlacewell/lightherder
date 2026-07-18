/*
 * Skeuomorphic Heading — chrome-engraved label for the top of a panel.
 * Just a styled title; no chrome plate of its own (the host wraps the
 * panel in <SidePanel> or similar chassis if it wants).
 */

import type { ReactNode } from 'react'
import type { HeadingProps } from '@ldlework/dials/react'

export function Heading({ title }: HeadingProps): ReactNode {
  return <div className="pd-heading">{title}</div>
}
