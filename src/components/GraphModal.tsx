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
  const [hoveredItemId, setHoveredItemId] = useState<number | null>(null)
  const [fieldFilter, setFieldFilter] = useState<{ field: string; value: string } | null>(null)
  const [layoutMode, setLayoutMode] = useState<'columns' | 'rows'>('columns')
  const [zoom, setZoom] = useState(1)

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

  // Filter relationships to only show those related to selected or hovered item
  const visibleRels = useMemo(() => {
    const activeItemId = hoveredItemId || selectedItemId
    if (!activeItemId) return []
    return rels.filter(r => r.fromItemId === activeItemId || r.toItemId === activeItemId)
  }, [rels, selectedItemId, hoveredItemId])

  // Get set of related item IDs for highlighting
  const relatedItemIds = useMemo(() => {
    const activeItemId = hoveredItemId || selectedItemId
    if (!activeItemId) return new Set<number>()
    const relatedIds = new Set<number>()
    relatedIds.add(activeItemId) // Include the active item itself
    visibleRels.forEach(rel => {
      if (rel.fromItemId === activeItemId) {
        relatedIds.add(rel.toItemId)
      } else if (rel.toItemId === activeItemId) {
        relatedIds.add(rel.fromItemId)
      }
    })
    return relatedIds
  }, [visibleRels, selectedItemId, hoveredItemId])

  // Only include visible lenses in layout
  const visibleLenses = useMemo(() => LENSES.filter(l => visible[l.key]), [visible])
  const layout = useMemo(() => computeLayout(filteredItems, dims.w, dims.h, visibleLenses, layoutMode), [filteredItems, dims, visibleLenses, layoutMode])

  function posFor(id?: number) {
    if (!id) return { x: 0, y: 0 }
    const p = layout.positions.get(id)
    return p || { x: 0, y: 0 }
  }

  return (
    <Modal open={open} onClose={onClose} title="" fullScreen>
      <div className="absolute top-2 left-0 right-50 mx-auto flex justify-center">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Architecture Relationship Diagram</h2>
      </div>
      <div className="absolute top-10 left-2 z-10 bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded px-2 py-1 text-sm flex items-center gap-3">
        {fieldFilter ? (
          <div className="flex items-center gap-2">
            <span>Filtered by {fieldFilter.field}: {fieldFilter.value}</span>
            <button onClick={() => setFieldFilter(null)} className="px-1 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">Clear filter</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {selectedItemId ? (
              <span>Showing relationships for selected item. Click again to deselect.</span>
            ) : hoveredItemId ? (
              <span>Hovering over item - showing relationships. Click to select.</span>
            ) : (
              <span>Hover over an item to see its relationships. Click to select. Click field values to filter.</span>
            )}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={layoutMode === 'rows'} onChange={e => setLayoutMode(e.target.checked ? 'rows' : 'columns')} />
            Row layout
          </label>
          <div className="flex items-center gap-1 border-l border-slate-300 dark:border-slate-700 pl-2">
            <button onClick={() => setZoom(z => Math.max(0.25, z - 0.1))} className="px-1.5 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">−</button>
            <span className="text-xs min-w-[3rem] text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="px-1.5 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">+</button>
            <button onClick={() => setZoom(1)} className="px-1.5 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">Reset</button>
          </div>
        </div>
      </div>
      <div className="overflow-auto w-full h-full" style={{ marginTop: '48px' }}>
        <svg 
          width={layout.width} 
          height={layout.height} 
          className="block" 
          style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}
        >
        {/* Lens headers */}
        {layout.headers.map(header => (
          <g key={header.key}>
            <rect x={header.x} y={header.y} width={header.width} height={header.height} fill="transparent" stroke="#e2e8f0" />
            <text x={header.x + header.width / 2} y={header.y + 24} textAnchor="middle" className="fill-slate-700" style={{ fontSize: 14, fontWeight: 600 }}>{header.label}</text>
            <line x1={header.x} y1={header.y + 32} x2={header.x + header.width} y2={header.y + 32} stroke="white" />
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
          const handleFieldClick = (e: React.MouseEvent, field: string, value: string) => {
            e.stopPropagation()
            if (value && value.trim()) {
              setFieldFilter({ field, value })
              setSelectedItemId(null)
            }
          }
          
          // Helper to get first name
          const getFirstName = (fullName: string) => fullName.split(' ')[0]
          
          // Helper to wrap text
          const wrapText = (text: string, maxWidth: number, fontSize: number = 10) => {
            const words = text.split(' ')
            const lines: string[] = []
            let currentLine = ''
            
            words.forEach(word => {
              const testLine = currentLine ? `${currentLine} ${word}` : word
              // Approximate width: ~0.6 * fontSize per character
              const width = testLine.length * fontSize * 0.6
              if (width > maxWidth && currentLine) {
                lines.push(currentLine)
                currentLine = word
              } else {
                currentLine = testLine
              }
            })
            if (currentLine) lines.push(currentLine)
            return lines.length > 0 ? lines : [text]
          }
          
          const maxTextWidth = layout.nodeWidth - 8
          const nameLines = wrapText(n.name, maxTextWidth, 12)
          const businessLines = n.businessContact ? wrapText(n.businessContact, maxTextWidth, 10) : []
          const techLines = n.techContact ? wrapText(n.techContact, maxTextWidth, 10) : []
          const primaryLines = n.primaryArchitect ? wrapText(n.primaryArchitect, maxTextWidth, 10) : []
          
          const hasSkillsGap = !!n.skillsGaps?.trim()
          const isSelected = selectedItemId === n.id
          const isHovered = hoveredItemId === n.id
          const isRelated = n.id !== undefined && relatedItemIds.has(n.id)
          const isActive = isSelected || isHovered || isRelated
          const fillColor = hasSkillsGap ? (isActive ? "#fecaca" : "#fee2e2") : (isActive ? "#bfdbfe" : "#e0f2fe")
          const strokeColor = hasSkillsGap ? (isActive ? "#dc2626" : "#ef4444") : (isActive ? "#2563eb" : "#3b82f6")
          
          // Determine stroke width: thicker for hovered/selected, medium for related, thin for others
          const strokeWidth = isHovered || isSelected ? 2 : (isRelated ? 2 : 1)
          
          return (
            <g 
              key={n.id} 
              onClick={() => setSelectedItemId(isSelected ? null : (n.id || null))} 
              onMouseEnter={() => setHoveredItemId(n.id || null)}
              onMouseLeave={() => setHoveredItemId(null)}
              style={{ cursor: 'pointer' }}
            >
              <rect x={n.x - layout.nodeWidth / 2} y={n.y - layout.nodeHeight / 2} width={layout.nodeWidth} height={layout.nodeHeight} rx={6} ry={6} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />
              
              {/* Name (wrapped) */}
              {nameLines.map((line, idx) => (
                <text key={`name-${idx}`} x={n.x} y={n.y - 22 + idx * 11} textAnchor="middle" className="fill-slate-800" style={{ fontSize: 12 }}>{line}</text>
              ))}
              
              {/* Business Contact (wrapped, clickable) */}
              {businessLines.map((line, idx) => {
                const baseY = n.y - 20 + nameLines.length * 11
                return (
                  <text
                    key={`biz-${idx}`}
                    x={n.x}
                    y={baseY + idx * 9}
                    textAnchor="middle"
                    className="fill-blue-600 hover:underline"
                    style={{ fontSize: 10, cursor: 'pointer' }}
                    onClick={(e) => handleFieldClick(e, 'businessContact', n.businessContact || '')}
                  >
                    {line}
                  </text>
                )
              })}
              
              {/* Tech Contact (wrapped, clickable) */}
              {techLines.map((line, idx) => {
                const baseY = n.y - 18 + nameLines.length * 11 + businessLines.length * 9
                return (
                  <text
                    key={`tech-${idx}`}
                    x={n.x}
                    y={baseY + idx * 9}
                    textAnchor="middle"
                    className="fill-blue-600 hover:underline"
                    style={{ fontSize: 10, cursor: 'pointer' }}
                    onClick={(e) => handleFieldClick(e, 'techContact', n.techContact || '')}
                  >
                    {line}
                  </text>
                )
              })}
              
              {/* Primary Architect (wrapped, clickable) */}
              {primaryLines.map((line, idx) => {
                const baseY = n.y - 16 + nameLines.length * 11 + (businessLines.length + techLines.length) * 9
                return (
                  <text
                    key={`primary-${idx}`}
                    x={n.x}
                    y={baseY + idx * 9}
                    textAnchor="middle"
                    className="fill-blue-600 hover:underline"
                    style={{ fontSize: 10, cursor: 'pointer' }}
                    onClick={(e) => handleFieldClick(e, 'primaryArchitect', n.primaryArchitect || '')}
                  >
                    {line}
                  </text>
                )
              })}
              
              {/* Secondary Architects - show first names only, make each clickable */}
              {n.secondaryArchitects.length > 0 && (
                <foreignObject
                  x={n.x - layout.nodeWidth / 2 + 4}
                  y={n.y - 24 + nameLines.length * 11 + (businessLines.length + techLines.length + primaryLines.length) * 9}
                  width={layout.nodeWidth - 8}
                  height={16}
                >
                  <div style={{ fontSize: 10, textAlign: 'center', wordWrap: 'break-word' }}>
                    {n.secondaryArchitects.map((arch, idx) => (
                      <span key={idx}>
                        <span
                          className="text-grey-600 hover:underline cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation()
                            setFieldFilter({ field: 'secondaryArchitects', value: arch.trim() })
                            setSelectedItemId(null)
                          }}
                        >
                          {getFirstName(arch.trim())}
                        </span>
                        {idx < n.secondaryArchitects.length - 1 && ', '}
                      </span>
                    ))}
                  </div>
                </foreignObject>
              )}
            </g>
          )
        })}
      </svg>
      </div>
    </Modal>
  )
}

function computeLayout(items: ItemRecord[], windowW: number, windowH: number, visibleLenses: typeof LENSES, mode: 'columns' | 'rows') {
  const padding = 16
  const availableW = Math.max(320, windowW - padding * 2)
  const availableH = Math.max(240, windowH - padding * 2)
  const topOffset = 30
  const nodeHeight = 70 // Increased for wrapped text
  const rowGap = 6
  const colGap = 5

  const nodes: PositionedItem[] = []
  const positions = new Map<number, { x: number; y: number }>()
  const headers: Array<{ key: LensKey; label: string; x: number; y: number; width: number; height: number }> = []

  if (mode === 'columns') {
    const n = visibleLenses.length
    let colWidth = Math.floor((availableW - colGap * (n - 1)) / n)
    colWidth = Math.max(160, colWidth)

    let maxRows = 0
    visibleLenses.forEach((l, idx) => {
      const colItems = items.filter(i => i.lens === l.key)
      maxRows = Math.max(maxRows, colItems.length)
      
      headers.push({
        key: l.key as LensKey,
        label: l.label,
        x: padding + idx * (colWidth + colGap),
        y: 0,
        width: colWidth,
        height: topOffset
      })
      
      colItems.forEach((it, row) => {
        const x = padding + idx * (colWidth + colGap) + colWidth / 2
        const y = topOffset + row * (nodeHeight + rowGap) + nodeHeight / 2
        if (it.id) positions.set(it.id, { x, y })
        nodes.push({ ...it, x, y })
      })
    })

    const contentH = topOffset + Math.max(1, maxRows) * (nodeHeight + rowGap) + padding
    // Ensure width accounts for all columns
    const calculatedWidth = padding + n * colWidth + (n - 1) * colGap + padding
    const width = Math.max(availableW, calculatedWidth)
    const height = Math.max(availableH, contentH)
    const nodeWidth = Math.min(200, Math.floor(colWidth * 0.9))

    return { width, height, nodes, positions, headers, nodeWidth, nodeHeight }
  } else {
    // Row layout: lenses as rows
    const rowHeight = nodeHeight + rowGap
    const headerHeight = 30
    const headerGap = 10 // Gap between header and items
    let currentY = 0
    
    visibleLenses.forEach((l) => {
      const rowItems = items.filter(i => i.lens === l.key)
      
      // Calculate how many rows of items are needed for this lens
      const itemsPerRow = Math.max(1, Math.floor((availableW - padding * 2) / 170))
      const numItemRows = Math.ceil(rowItems.length / itemsPerRow)
      
      // Position header for this lens
      headers.push({
        key: l.key as LensKey,
        label: l.label,
        x: 0,
        y: currentY,
        width: availableW,
        height: headerHeight
      })
      
      currentY += headerHeight + headerGap
      
      // Position items for this lens
      const itemWidth = Math.floor((availableW - padding * 2 - colGap * (itemsPerRow - 1)) / itemsPerRow)
      
      rowItems.forEach((it, colIdx) => {
        const col = colIdx % itemsPerRow
        const row = Math.floor(colIdx / itemsPerRow)
        const x = padding + col * (itemWidth + colGap) + itemWidth / 2
        const y = currentY + row * rowHeight + nodeHeight / 2
        if (it.id) positions.set(it.id, { x, y })
        nodes.push({ ...it, x, y })
      })
      
      // Move to next lens position
      // Items are positioned with center at: currentY + row * rowHeight + nodeHeight / 2
      // For the last row (row = numItemRows - 1):
      //   Center: currentY + (numItemRows - 1) * rowHeight + nodeHeight / 2
      //   Bottom: currentY + (numItemRows - 1) * rowHeight + nodeHeight / 2 + nodeHeight / 2
      //         = currentY + (numItemRows - 1) * rowHeight + nodeHeight
      if (numItemRows > 0) {
        // Calculate the actual bottom edge of the last item in this lens section
        const lastItemCenterY = currentY + (numItemRows - 1) * rowHeight + nodeHeight / 2
        const lastItemBottom = lastItemCenterY + nodeHeight / 2
        currentY = lastItemBottom + 10 // Gap between lens sections
      } else {
        currentY += 10 // Just gap if no items
      }
    })

    const width = availableW
    // Ensure height accounts for all content - currentY is at the bottom of the last item + gap
    // Add generous padding at the bottom to ensure nothing is cut off
    const calculatedHeight = currentY + padding + 30 // Extra padding to ensure last row is fully visible
    const height = Math.max(availableH, calculatedHeight)

    return { width, height, nodes, positions, headers, nodeWidth: 160, nodeHeight }
  }
}
