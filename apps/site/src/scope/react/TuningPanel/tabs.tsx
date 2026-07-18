import type { ReactNode } from 'react'

export interface TabSpec {
  key: string
  label: string
  isAdd?: boolean
}

export function Tabs({
  tabs, active, onSelect,
}: {
  tabs: TabSpec[]
  active: string
  onSelect: (key: string) => void
}) {
  return (
    <div className="hero-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={t.key === active}
          className={
            'hero-tab' +
            (t.key === active ? ' is-active' : '') +
            (t.isAdd ? ' is-add' : '')
          }
          onClick={() => onSelect(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function ChildTabbed<T>({
  items, activeIdx, onSelect, onAdd, onRemove, renderActive, emptyHint,
}: {
  items: T[]
  activeIdx: number
  onSelect: (i: number) => void
  onAdd: () => void
  onRemove?: (() => void) | undefined
  renderActive: (item: T) => ReactNode
  emptyHint?: string | undefined
}) {
  return (
    <>
      <Tabs
        tabs={[
          ...items.map((_, i) => ({ key: String(i), label: String(i) })),
          { key: '+', label: '+', isAdd: true },
        ]}
        active={String(activeIdx)}
        onSelect={(k) => {
          if (k === '+') onAdd()
          else onSelect(Number(k))
        }}
      />
      {items.length > 0 ? (
        <>
          {onRemove ? (
            <div className="hero-actions">
              <button type="button" onClick={onRemove}>remove</button>
            </div>
          ) : null}
          {renderActive(items[activeIdx]!)}
        </>
      ) : (
        <div className="hero-empty">{emptyHint ?? 'Empty.'}</div>
      )}
    </>
  )
}
