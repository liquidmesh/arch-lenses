import { useEffect, useMemo, useState } from 'react'
import { db } from '../db'
import { LENSES, type ItemRecord, type LensKey, type RelationshipRecord } from '../types'
import { Modal } from './Modal'

interface GraphModalProps {
  open: boolean
  onClose: () => void
  visible: Record<LensKey, boolean>
}

type PositionedItem = ItemRecord & { x: number; y: number }

export function GraphModal({ open, onClose, visible }: GraphModalProps) {
  const [items, setItems] = useState<ItemRecord[]>([])
  const [rels, setRels] = useState<RelationshipRecord[]>([])
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [fieldFilter, setFieldFilter] = useState<{ field: string; value: string } | null>(null)

  useEffect(() => {
    function update() {
      setDims({ w: window.innerWidth, h: window.innerHeight })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    if (!open) {
      setSelectedItemId(null)
      setFieldFilter(null)
      return
    }
    ;(async () => {
      const [allItems, allRels] = await Promise.all([db.items.toArray(), db.relationships.toArray()])
      // Filter items to only visible lenses
      const filteredItems = allItems.filter(item => visible[item.lens])
      setItems(filteredItems)
      setRels(allRels)
    })()
  }, [open, visible])

  // Filter items based on field filter (e.g., filter by primaryArchitect, businessContact, etc.)
  const filteredItems = useMemo(() => {
    if (!fieldFilter) return items
    return items.filter(item => {
      const fieldValue = item[fieldFilter.field as keyof ItemRecord]
      if (Array.isArray(fieldValue)) {
        return fieldValue.some(v => v === fieldFilter.value || v.includes(fieldFilter.value))
      }
      return fieldValue === fieldFilter.value || String(fieldValue || '').includes(fieldFilter.value)
    })
  }, [items, fieldFilter])

  // Filter relationships to only show those related to selected item
  const visibleRels = useMemo(() => {
    if (!selectedItemId) return []
    return rels.filter(r => r.fromItemId === selectedItemId || r.toItemId === selectedItemId)
  }, [rels, selectedItemId])

  // Only include visible lenses in layout
  const visibleLenses = useMemo(() => LENSES.filter(l => visible[l.key]), [visible])
  const layout = useMemo(() => computeLayout(filteredItems, dims.w, dims.h, visibleLenses), [filteredItems, dims, visibleLenses])

  function posFor(id?: number) {
    if (!id) return { x: 0, y: 0 }
    const p = layout.positions.get(id)
    return p || { x: 0, y: 0 }
  }

  return (
    <Modal open={open} onClose={onClose} title="Architecture Relationship Diagram" fullScreen>
      <div className="absolute top-2 left-2 z-10 bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded px-2 py-1 text-sm flex items-center gap-3">
        {fieldFilter ? (
          <div className="flex items-center gap-2">
            <span>Filtered by {fieldFilter.field}: {fieldFilter.value}</span>
            <button onClick={() => setFieldFilter(null)} className="px-1 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">Clear filter</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {selectedItemId ? (
              <span>Showing relationships for selected item. Click again to deselect.</span>
            ) : (
              <span>Click an item to see its relationships. Click field values to filter.</span>
            )}
          </div>
        )}
      </div>
      <svg width={layout.width} height={layout.height} className="block" style={{ width: '100%', height: '100%' }}>
        {/* Lens column headers */}
        {layout.lensColumns.map(col => (
          <g key={col.key}>
            <rect x={col.x} y={0} width={col.colWidth} height={layout.height} fill="transparent" stroke="#e2e8f0" />
            <text x={col.x + col.colWidth / 2} y={24} textAnchor="middle" className="fill-slate-700" style={{ fontSize: 14, fontWeight: 600 }}>{col.label}</text>
            <line x1={col.x} y1={32} x2={col.x + col.colWidth} y2={32} stroke="#e2e8f0" />
          </g>
        ))}
        {/* Links */}
        {visibleRels.map((r, i) => {
          const a = posFor(r.fromItemId)
          const b = posFor(r.toItemId)
          const midX = (a.x + b.x) / 2
          return (
            <path key={i} d={`M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`} fill="none" stroke="#3b82f6" strokeWidth={2} />
          )
        })}
        {/* Nodes */}
        {layout.nodes.map(n => {
          const isSelected = selectedItemId === n.id
          const handleFieldClick = (e: React.MouseEvent, field: string, value: string) => {
            e.stopPropagation()
            if (value && value.trim()) {
              setFieldFilter({ field, value })
              setSelectedItemId(null) // Clear item selection when filtering
            }
          }
          return (
            <g key={n.id} onClick={() => setSelectedItemId(isSelected ? null : (n.id || null))} style={{ cursor: 'pointer' }}>
              <rect x={n.x - layout.nodeWidth / 2} y={n.y - layout.nodeHeight / 2} width={layout.nodeWidth} height={layout.nodeHeight} rx={6} ry={6} fill={isSelected ? "#bfdbfe" : "#e0f2fe"} stroke={isSelected ? "#2563eb" : "#3b82f6"} strokeWidth={isSelected ? 2 : 1} />
              <text x={n.x} y={n.y - 12} textAnchor="middle" className="fill-slate-800" style={{ fontSize: 12 }}>{n.name}</text>
              {n.businessContact && (
                <text 
                  x={n.x} 
                  y={n.y - 2} 
                  textAnchor="middle" 
                  className="fill-blue-600 hover:underline" 
                  style={{ fontSize: 10, cursor: 'pointer' }}
                  onClick={(e) => handleFieldClick(e, 'businessContact', n.businessContact || '')}
                >
                  {n.businessContact}
                </text>
              )}
              {n.techContact && (
                <text 
                  x={n.x} 
                  y={n.y + 8} 
                  textAnchor="middle" 
                  className="fill-blue-600 hover:underline" 
                  style={{ fontSize: 10, cursor: 'pointer' }}
                  onClick={(e) => handleFieldClick(e, 'techContact', n.techContact || '')}
                >
                  {n.techContact}
                </text>
              )}
              {n.primaryArchitect && (
                <text 
                  x={n.x} 
                  y={n.y + 18} 
                  textAnchor="middle" 
                  className="fill-blue-600 hover:underline" 
                  style={{ fontSize: 10, cursor: 'pointer' }}
                  onClick={(e) => handleFieldClick(e, 'primaryArchitect', n.primaryArchitect || '')}
                >
                  {n.primaryArchitect}
                </text>
              )}
              {n.secondaryArchitects.length > 0 && (
                <text 
                  x={n.x} 
                  y={n.y + 28} 
                  textAnchor="middle" 
                  className="fill-blue-600 hover:underline" 
                  style={{ fontSize: 10, cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    // For secondary architects array, filter by the first one clicked
                    setFieldFilter({ field: 'secondaryArchitects', value: n.secondaryArchitects[0] })
                    setSelectedItemId(null)
                  }}
                >
                  {n.secondaryArchitects.join(', ')}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </Modal>
  )
}

function computeLayout(items: ItemRecord[], windowW: number, windowH: number, visibleLenses: typeof LENSES) {
  const padding = 16
  const availableW = Math.max(320, windowW - padding * 2)
  const availableH = Math.max(240, windowH - padding * 2)

  const n = visibleLenses.length
  const colGap = 20
  let colWidth = Math.floor((availableW - colGap * (n - 1)) / n)
  colWidth = Math.max(150, colWidth)
  const nodeHeight = 66
  const rowGap = 12
  const topOffset = 48

  const nodes: PositionedItem[] = []
  const positions = new Map<number, { x: number; y: number }>()

  let maxRows = 0
  const lensColumns = visibleLenses.map((l, idx) => {
    const colItems = items.filter(i => i.lens === l.key)
    maxRows = Math.max(maxRows, colItems.length)
    colItems.forEach((it, row) => {
      const x = padding + idx * (colWidth + colGap) + colWidth / 2
      const y = topOffset + row * (nodeHeight + rowGap) + nodeHeight
      if (it.id) positions.set(it.id, { x, y })
      nodes.push({ ...it, x, y })
    })
    return { key: l.key as LensKey, label: l.label, x: padding + idx * (colWidth + colGap), colWidth }
  })

  const contentH = topOffset + Math.max(1, maxRows) * (nodeHeight + rowGap) + padding
  const width = availableW
  const height = Math.max(availableH, contentH)
  const nodeWidth = Math.min(200, Math.floor(colWidth * 0.9))

  return { width, height, nodes, positions, lensColumns, nodeWidth, nodeHeight }
}
