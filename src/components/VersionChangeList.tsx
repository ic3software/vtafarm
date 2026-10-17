import type { ReactNode } from 'react'

export interface VersionChangeItem {
  key: string
  title: ReactNode
  badge?: ReactNode
  current: string
  next: string
}

interface VersionChangeListProps {
  items: VersionChangeItem[]
  labelWidth?: number
  maxHeight?: number
}

export function VersionChangeList({ items, labelWidth = 80, maxHeight }: VersionChangeListProps) {
  return (
    <div role="list" style={{ maxHeight, overflowY: maxHeight ? 'auto' : undefined, paddingRight: maxHeight ? 4 : 0 }}>
      {items.map((item, index) => (
        <div key={item.key} role="listitem" style={{
          display: 'grid',
          gridTemplateColumns: `${labelWidth}px max-content minmax(0, 1fr)`,
          columnGap: 8,
          alignItems: 'stretch',
          padding: '9px 0',
          borderTop: index === 0 ? 'none' : '1px solid hsl(var(--border))',
        }}>
          <div className="p-row center" style={{ minWidth: 0, alignSelf: 'stretch', flexWrap: 'wrap' }}>
            <span style={{ minWidth: 0, fontSize: 13, fontWeight: 500, overflowWrap: 'anywhere' }}>{item.title}</span>
          </div>
          <div className="p-row center" style={{ alignSelf: 'stretch' }}>
            {item.badge}
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '45px minmax(0, 1fr)',
            columnGap: 8,
            rowGap: 3,
            alignItems: 'start',
          }}>
            <span className="p-muted text-xs">Current</span>
            <span className="p-mono" style={{ minWidth: 0, fontSize: 11.5, overflowWrap: 'anywhere' }}>
              {item.current}
            </span>
            <span className="p-muted text-xs">Target</span>
            <span className="p-mono" style={{ minWidth: 0, fontSize: 11.5, fontWeight: 500, overflowWrap: 'anywhere' }}>
              {item.next}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
