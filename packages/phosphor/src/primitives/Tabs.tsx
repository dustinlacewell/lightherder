import type { ReactNode } from 'react'
import { PushButton } from './PushButton'

interface TabItem {
  key: string
  label: ReactNode
  disabled?: boolean
}

interface TabsProps {
  tabs: TabItem[]
  active: string
  onSelect: (key: string) => void
  className?: string
}

/**
 * Horizontal radio group of PushButtons. The active tab renders with
 * PushButton's `selected` state (the same depressed-and-recolored
 * treatment chrome buttons already use everywhere); inactive tabs are
 * regular raised PushButtons. Reuses the existing chrome-button press
 * visuals so tabs feel mechanically identical to every other button
 * in the system.
 *
 * Markup carries tablist ARIA semantics on the underlying button so
 * screen readers + keyboard handling work. Composers wire tab keys to
 * whatever content they render below.
 */
export function Tabs({ tabs, active, onSelect, className = '' }: TabsProps) {
  return (
    <div role="tablist" className={`chrome-tabs ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.key === active
        return (
          <PushButton
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            aria-disabled={tab.disabled || undefined}
            disabled={tab.disabled}
            selected={isActive}
            className="chrome-tab"
            onClick={() => {
              if (tab.disabled || isActive) return
              onSelect(tab.key)
            }}
          >
            {tab.label}
          </PushButton>
        )
      })}
    </div>
  )
}

export type { TabsProps, TabItem }
