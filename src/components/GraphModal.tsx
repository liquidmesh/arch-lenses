import { useEffect, useMemo, useState } from 'react'
import { db } from '../db'
import { LENSES, type ItemRecord, type LensKey, type RelationshipRecord, type LifecycleStatus } from '../types'
import { ItemDialog } from './ItemDialog'
import { getOrderedLenses } from '../utils/lensOrder'

type ViewType = 'main' | 'diagram' | 'architects' | 'stakeholders' | 'manage-team' | 'meeting-notes'

interface GraphModalProps {
  visible: Record<LensKey, boolean>
  lensOrderKey?: number
  onNavigate: (view: ViewType) => void
}

type PositionedItem = ItemRecord & { x: number; y: number }

export function GraphModal({ visible, lensOrderKey, onNavigate: _onNavigate }: GraphModalProps) {
  const [items, setItems] = useState<ItemRecord[]>([])
  const [rels, setRels] = useState<RelationshipRecord[]>([])
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [hoveredItemId, setHoveredItemId] = useState<number | null>(null)
  const [fieldFilter, setFieldFilter] = useState<{ field: string; value: string } | null>(null)
  const [layoutMode, setLayoutMode] = useState<'columns' | 'rows'>('columns')
  const [viewMode, setViewMode] = useState<'skillGaps' | 'tags' | 'summary'>('summary')
  const [zoom, setZoom] = useState(1)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<ItemRecord | null>(null)
  const [showInstructions, setShowInstructions] = useState(true)
  const [filterToRelated, setFilterToRelated] = useState(false)
  const [showParentBoxes, setShowParentBoxes] = useState(true)

  // Delay showing instructions by 1 second when selection/hover changes
  useEffect(() => {
    setShowInstructions(false)
    const timer = setTimeout(() => {
      setShowInstructions(true)
    }, 1000)
    return () => clearTimeout(timer)
  }, [selectedItemId, hoveredItemId])

  useEffect(() => {
    function update() {
      setDims({ w: window.innerWidth, h: window.innerHeight })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  async function loadItems() {
    const [allItems, allRels] = await Promise.all([db.items.toArray(), db.relationships.toArray()])
    // Filter items to only visible lenses
    const filteredItems = allItems.filter(item => visible[item.lens])
    setItems(filteredItems)
    setRels(allRels)
  }

  useEffect(() => {
    setShowInstructions(true)
    loadItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  // Clear filter when item is deselected
  useEffect(() => {
    if (!selectedItemId) {
      setFilterToRelated(false)
    }
  }, [selectedItemId])

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

  // Filter items based on field filter and/or related items filter
  const filteredItems = useMemo(() => {
    let result = items

    // Apply field filter if active
    if (fieldFilter) {
      result = result.filter(item => {
        const fieldValue = item[fieldFilter.field as keyof ItemRecord]
        if (Array.isArray(fieldValue)) {
          // Handle arrays of strings (tags, secondaryArchitects) or objects (hyperlinks)
          return fieldValue.some(v => {
            if (typeof v === 'string') {
              return v === fieldFilter.value || v.includes(fieldFilter.value)
            } else if (v && typeof v === 'object' && 'label' in v && 'url' in v) {
              // Handle Hyperlink objects
              const link = v as { label: string; url: string }
              return link.label.includes(fieldFilter.value) || link.url.includes(fieldFilter.value)
            }
            return false
          })
        }
        return fieldValue === fieldFilter.value || String(fieldValue || '').includes(fieldFilter.value)
      })
    }

    // Apply related items filter if active
    if (filterToRelated && selectedItemId) {
      result = result.filter(item => relatedItemIds.has(item.id!))
    }

    return result
  }, [items, fieldFilter, filterToRelated, selectedItemId, relatedItemIds])

  // Only include visible lenses in layout, using custom order
  // When filtering to related items, only show lenses that have items in the filtered set
  const visibleLenses = useMemo(() => {
    const ordered = getOrderedLenses().filter(l => visible[l.key])
    if (filterToRelated && selectedItemId) {
      // Only include lenses that have at least one item in filteredItems
      const filteredLensKeys = new Set(filteredItems.map(item => item.lens))
      return ordered.filter(l => filteredLensKeys.has(l.key))
    }
    return ordered
  }, [visible, lensOrderKey, filterToRelated, selectedItemId, filteredItems])
  const layout = useMemo(() => computeLayout(filteredItems, dims.w, dims.h, visibleLenses, layoutMode, showParentBoxes), [filteredItems, dims, visibleLenses, layoutMode, showParentBoxes])

  function posFor(id?: number) {
    if (!id) return { x: 0, y: 0 }
    const p = layout.positions.get(id)
    return p || { x: 0, y: 0 }
  }

  // Generate color from tag string
  function getTagColor(tag: string): string {
    // Simple hash function to generate consistent colors
    let hash = 0
    for (let i = 0; i < tag.length; i++) {
      hash = tag.charCodeAt(i) + ((hash << 5) - hash)
    }
    // Generate a color with good contrast
    const hue = Math.abs(hash) % 360
    return `hsl(${hue}, 70%, 85%)`
  }

  // Get border color for tag view
  function getTagBorderColor(tag: string): string {
    let hash = 0
    for (let i = 0; i < tag.length; i++) {
      hash = tag.charCodeAt(i) + ((hash << 5) - hash)
    }
    const hue = Math.abs(hash) % 360
    return `hsl(${hue}, 70%, 50%)`
  }

  // Get colors based on lifecycle status
  function getLifecycleColor(status?: LifecycleStatus): { fill: string; stroke: string } {
    switch (status) {
      case 'Plan':
        return { fill: '#f3f4f6', stroke: '#9ca3af' } // Grey
      case 'Emerging':
        return { fill: '#fef3c7', stroke: '#f59e0b' } // Yellow/amber
      case 'Invest':
        return { fill: '#d1fae5', stroke: '#10b981' } // Green
      case 'Divest':
        return { fill: '#fee2e2', stroke: '#ef4444' } // Red
      case 'Stable':
        return { fill: '#f0f9ff', stroke: '#38bdf8' } // Blue (default)
      default:
        return { fill: '#f0f9ff', stroke: '#38bdf8' } // Light blue (default)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-900">
      <div className="flex-1 relative overflow-auto">
      <div className="absolute top-0 left-2 z-10 bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded px-2 py-1 text-sm flex items-center gap-3">
        {fieldFilter ? (
          <div className="flex items-center gap-2">
            <span>Filtered by {fieldFilter.field}: {fieldFilter.value}</span>
            <button onClick={() => setFieldFilter(null)} className="px-1 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">Clear filter</button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs">
                <span className="mr-1">View:</span>
                <select 
                  value={viewMode} 
                  onChange={e => setViewMode(e.target.value as 'skillGaps' | 'tags' | 'summary')}
                  className="px-2 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="skillGaps">Architecture coverage</option>
                  <option value="tags">Tags</option>
                  <option value="summary">Summary</option>
                </select>
              </label>
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={layoutMode === 'rows'} onChange={e => setLayoutMode(e.target.checked ? 'rows' : 'columns')} />
                Row layout
              </label>
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={showParentBoxes} onChange={e => setShowParentBoxes(e.target.checked)} />
                Show parent boxes
              </label>
              <div className="flex items-center gap-1 border-l border-slate-300 dark:border-slate-700 pl-2">
                <button onClick={() => setZoom(z => Math.max(0.25, z - 0.1))} className="px-1.5 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">−</button>
                <span className="text-xs min-w-[3rem] text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="px-1.5 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">+</button>
                <button onClick={() => setZoom(1)} className="px-1.5 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">Reset</button>
              </div>
            </div>
            {showInstructions && (
              <div className="flex items-center gap-2">
                {selectedItemId ? (
                  <span>
                    Showing relationships for {items.find(i => i.id === selectedItemId)?.name || 'selected item'}. Click again to deselect.
                    {filterToRelated && ' Filtered to related items only.'}
                  </span>
                ) : hoveredItemId ? (
                  <span>Hovering over item - showing relationships. Click to select.</span>
                ) : (
                  <span>Hover over an item to see its relationships. Click to select. Click field values to filter.</span>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <div className="w-full" style={{ paddingTop: '48px' }}>
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
        {/* Parent group boxes - render before links and nodes so they appear as background */}
        {showParentBoxes && layout.parentGroups && layout.parentGroups.map((group, idx) => (
          <g key={`parent-${group.lens}-${group.parent}-${idx}`}>
            <rect 
              x={group.x} 
              y={group.y} 
              width={group.width} 
              height={group.height} 
              fill="rgba(241, 245, 249, 0.5)" 
              stroke="#cbd5e1" 
              strokeWidth={2}
              rx={4}
            />
            <text 
              x={group.x + 8} 
              y={group.y + 16} 
              className="fill-slate-700 dark:fill-slate-300" 
              style={{ fontSize: 12, fontWeight: 600 }}
            >
              {group.parent}
            </text>
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
          const descriptionLines = n.description ? wrapText(n.description, maxTextWidth, 9) : []
          
          const isSelected = selectedItemId === n.id
          const isHovered = hoveredItemId === n.id
          const isRelated = n.id !== undefined && relatedItemIds.has(n.id)
          const isActive = isSelected || isHovered || isRelated
          
          // Determine colors and stroke based on view mode
          let fillColor: string
          let strokeColor: string
          let strokeWidth: number
          
          if (viewMode === 'tags') {
            // Tags view: color by first tag, or default if no tags
            if (n.tags.length > 0) {
              fillColor = isActive ? getTagColor(n.tags[0]) : getTagColor(n.tags[0])
              strokeColor = isActive ? getTagBorderColor(n.tags[0]) : getTagBorderColor(n.tags[0])
            } else {
              fillColor = isActive ? "#e5e7eb" : "#f3f4f6"
              strokeColor = isActive ? "#9ca3af" : "#d1d5db"
            }
            strokeWidth = isHovered || isSelected ? 2 : (isRelated ? 2 : 1)
          } else if (viewMode === 'summary') {
            // Summary view: color by lifecycle status
            const lifecycleColors = getLifecycleColor(n.lifecycleStatus)
            fillColor = isActive ? lifecycleColors.fill : lifecycleColors.fill
            strokeColor = isActive ? lifecycleColors.stroke : lifecycleColors.stroke
            strokeWidth = isHovered || isSelected ? 2 : (isRelated ? 2 : 1)
          } else {
            // Architecture coverage view: color logic
            const hasSkillsGap = !!n.skillsGaps?.trim()
            const hasPrimaryArchitect = !!n.primaryArchitect?.trim()
            const hasSecondaryArchitects = n.secondaryArchitects.length > 0
            
            // Red: has skills gap OR (no primaryArchitect AND no secondaryArchitects)
            // Orange: no skills gap AND has secondaryArchitects BUT no primaryArchitect
            // Blue: normal (has primaryArchitect)
            if (hasSkillsGap || (!hasPrimaryArchitect && !hasSecondaryArchitects)) {
              fillColor = isActive ? "#fecaca" : "#fee2e2"
              strokeColor = isActive ? "#dc2626" : "#ef4444"
            } else if (!hasSkillsGap && hasSecondaryArchitects && !hasPrimaryArchitect) {
              fillColor = isActive ? "#fed7aa" : "#ffedd5"
              strokeColor = isActive ? "#ea580c" : "#f97316"
            } else {
              fillColor = isActive ? "#bfdbfe" : "#e0f2fe"
              strokeColor = isActive ? "#2563eb" : "#3b82f6"
            }
            strokeWidth = isHovered || isSelected ? 2 : (isRelated ? 2 : 1)
          }
          
          return (
            <g 
              key={n.id} 
              onClick={() => setSelectedItemId(isSelected ? null : (n.id || null))} 
              onMouseEnter={() => setHoveredItemId(n.id || null)}
              onMouseLeave={() => setHoveredItemId(null)}
              style={{ cursor: 'pointer' }}
            >
              <rect x={n.x - layout.nodeWidth / 2} y={n.y - layout.nodeHeight / 2} width={layout.nodeWidth} height={layout.nodeHeight} rx={6} ry={6} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />
              
              {/* Filter icon for selected items - top right corner */}
              {isSelected && (
                <foreignObject
                  x={n.x + layout.nodeWidth / 2 - 20}
                  y={n.y - layout.nodeHeight / 2 + 2}
                  width={18}
                  height={18}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setFilterToRelated(!filterToRelated)
                    }}
                    className="w-full h-full flex items-center justify-center rounded border border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700"
                    title={filterToRelated ? "Show all items" : "Show only related items"}
                    style={{ padding: 0, cursor: 'pointer' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={filterToRelated ? "text-blue-600 dark:text-blue-400" : "text-slate-600 dark:text-slate-400"}>
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                    </svg>
                  </button>
                </foreignObject>
              )}
              
              {/* Name (wrapped) - always shown, clickable to edit */}
              {nameLines.map((line, idx) => (
                <text 
                  key={`name-${idx}`} 
                  x={n.x} 
                  y={n.y - 22 + idx * 11} 
                  textAnchor="middle" 
                  className="fill-slate-800 dark:fill-slate-200 hover:fill-blue-600 dark:hover:fill-blue-400" 
                  style={{ fontSize: 12, cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditItem(n)
                    setEditDialogOpen(true)
                  }}
                >
                  {line}
                </text>
              ))}
              
              {viewMode === 'summary' && (
                <>
                  {/* Description (wrapped) - always shown */}
                  {descriptionLines.map((line, idx) => {
                    const baseY = n.y - 22 + nameLines.length * 11 + 4
                    return (
                      <text
                        key={`desc-${idx}`}
                        x={n.x}
                        y={baseY + idx * 8}
                        textAnchor="middle"
                        className="fill-slate-700 dark:fill-slate-300"
                        style={{ fontSize: 9 }}
                      >
                        {line}
                      </text>
                    )
                  })}
                  
                  {/* Business Contact, Tech Contact, Primary Architect, Secondary Architects - only shown when active (hovered or selected) */}
                  {isActive && (
                    <>
                      {/* Business Contact (wrapped, clickable) */}
                      {businessLines.map((line, idx) => {
                        const baseY = n.y - 22 + nameLines.length * 11 + descriptionLines.length * 8 + 6
                        return (
                          <text
                            key={`biz-${idx}`}
                            x={n.x}
                            y={baseY + idx * 8}
                            textAnchor="middle"
                            className="fill-blue-600 hover:underline"
                            style={{ fontSize: 9, cursor: 'pointer' }}
                            onClick={(e) => handleFieldClick(e, 'businessContact', n.businessContact || '')}
                          >
                            {line}
                          </text>
                        )
                      })}
                      
                      {/* Tech Contact (wrapped, clickable) */}
                      {techLines.map((line, idx) => {
                        const baseY = n.y - 22 + nameLines.length * 11 + descriptionLines.length * 8 + 6 + businessLines.length * 8
                        return (
                          <text
                            key={`tech-${idx}`}
                            x={n.x}
                            y={baseY + idx * 8}
                            textAnchor="middle"
                            className="fill-blue-600 hover:underline"
                            style={{ fontSize: 9, cursor: 'pointer' }}
                            onClick={(e) => handleFieldClick(e, 'techContact', n.techContact || '')}
                          >
                            {line}
                          </text>
                        )
                      })}
                      
                      {/* Primary Architect (wrapped, clickable) */}
                      {primaryLines.map((line, idx) => {
                        const baseY = n.y - 22 + nameLines.length * 11 + descriptionLines.length * 8 + 6 + (businessLines.length + techLines.length) * 8
                        return (
                          <text
                            key={`primary-${idx}`}
                            x={n.x}
                            y={baseY + idx * 8}
                            textAnchor="middle"
                            className="fill-blue-600 hover:underline"
                            style={{ fontSize: 9, cursor: 'pointer' }}
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
                          y={n.y - 22 + nameLines.length * 11 + descriptionLines.length * 8 + 6 + (businessLines.length + techLines.length + primaryLines.length) * 8}
                          width={layout.nodeWidth - 8}
                          height={14}
                        >
                          <div style={{ fontSize: 9, textAlign: 'center', wordWrap: 'break-word' }}>
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
                    </>
                  )}
                </>
              )}
              
              {viewMode === 'tags' && (
                <>
                  {/* Tags - show all tags */}
                  {n.tags.length > 0 && (
                    <foreignObject
                      x={n.x - layout.nodeWidth / 2 + 4}
                      y={n.y - 10 + nameLines.length * 11}
                      width={layout.nodeWidth - 8}
                      height={Math.min(40, n.tags.length * 12)}
                    >
                      <div className="flex flex-wrap gap-1 justify-center text-[8px] leading-tight">
                        {n.tags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300"
                            style={{ 
                              backgroundColor: getTagColor(tag),
                              border: `1px solid ${getTagBorderColor(tag)}`
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </foreignObject>
                  )}
                </>
              )}
              
              {viewMode === 'skillGaps' && (
                <>
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
                </>
              )}
            </g>
          )
        })}
      </svg>
      </div>
      
      {/* Edit Dialog */}
      <ItemDialog
        onOpenMeetingNote={(noteId) => {
          window.dispatchEvent(new CustomEvent('openMeetingNote', { detail: { noteId } }))
        }}
        open={editDialogOpen}
        onClose={() => {
          setEditDialogOpen(false)
          setEditItem(null)
        }}
        lens={editItem?.lens || 'domains'}
        item={editItem}
        onSaved={() => {
          loadItems()
        }}
      />
      </div>
    </div>
  )
}

function computeLayout(items: ItemRecord[], windowW: number, windowH: number, visibleLenses: typeof LENSES, mode: 'columns' | 'rows', showParentBoxes: boolean = true) {
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
  const parentGroups: Array<{ parent: string; x: number; y: number; width: number; height: number; lens: LensKey }> = []

  if (mode === 'columns') {
    const n = visibleLenses.length
    let colWidth = Math.floor((availableW - colGap * (n - 1)) / n)
    colWidth = Math.max(160, colWidth)

    let maxRows = 0
    visibleLenses.forEach((l, idx) => {
      const colItems = items.filter(i => i.lens === l.key)
      
      headers.push({
        key: l.key as LensKey,
        label: l.label,
        x: padding + idx * (colWidth + colGap),
        y: 0,
        width: colWidth,
        height: topOffset
      })
      
      if (showParentBoxes) {
        // Group items by parent
        const itemsByParent = new Map<string | null, ItemRecord[]>()
        colItems.forEach(item => {
          const parentKey = item.parent || null
          if (!itemsByParent.has(parentKey)) {
            itemsByParent.set(parentKey, [])
          }
          itemsByParent.get(parentKey)!.push(item)
        })
        // Sort parents (null first, then alphabetically)
        const sortedParents = Array.from(itemsByParent.keys()).sort((a, b) => {
          if (a === null) return -1
          if (b === null) return 1
          return a.localeCompare(b)
        })
        
        let currentY = topOffset
        const parentGroupPadding = 2
        const parentGroupHeaderHeight = 20
        
        sortedParents.forEach(parent => {
          const parentItems = itemsByParent.get(parent)!
          
          if (parent !== null && parentItems.length > 0) {
            // Create parent group box
            const groupHeight = parentItems.length * (nodeHeight + rowGap) + parentGroupPadding * 2 + parentGroupHeaderHeight
            const groupX = padding + idx * (colWidth + colGap)
            const groupY = currentY
            const groupWidth = colWidth
            
            parentGroups.push({
              parent,
              x: groupX,
              y: groupY,
              width: groupWidth,
              height: groupHeight,
              lens: l.key as LensKey
            })
            
            // Position items within parent group
            parentItems.forEach((it, itemIdx) => {
              const x = groupX + groupWidth / 2
              const y = currentY + parentGroupHeaderHeight + parentGroupPadding + itemIdx * (nodeHeight + rowGap) + nodeHeight / 2
              if (it.id) positions.set(it.id, { x, y })
              nodes.push({ ...it, x, y })
            })
            
            currentY += groupHeight + rowGap
          } else {
            // Items without parent - position normally
            parentItems.forEach((it, itemIdx) => {
              const x = padding + idx * (colWidth + colGap) + colWidth / 2
              const y = currentY + itemIdx * (nodeHeight + rowGap) + nodeHeight / 2
              if (it.id) positions.set(it.id, { x, y })
              nodes.push({ ...it, x, y })
            })
            currentY += parentItems.length * (nodeHeight + rowGap)
          }
          
          maxRows = Math.max(maxRows, Math.ceil((currentY - topOffset) / (nodeHeight + rowGap)))
        })
      } else {
        // Flat list - no parent grouping
        colItems.forEach((it, row) => {
          const x = padding + idx * (colWidth + colGap) + colWidth / 2
          const y = topOffset + row * (nodeHeight + rowGap) + nodeHeight / 2
          if (it.id) positions.set(it.id, { x, y })
          nodes.push({ ...it, x, y })
        })
        maxRows = Math.max(maxRows, colItems.length)
      }
    })

    const contentH = topOffset + Math.max(1, maxRows) * (nodeHeight + rowGap) + padding
    // Ensure width accounts for all columns
    const calculatedWidth = padding + n * colWidth + (n - 1) * colGap + padding
    const width = Math.max(availableW, calculatedWidth)
    const height = Math.max(availableH, contentH)
    const nodeWidth = Math.min(200, Math.floor(colWidth * 0.9))

    return { width, height, nodes, positions, headers, nodeWidth, nodeHeight, parentGroups }
  } else {
    // Row layout: lenses as rows
    const rowHeight = nodeHeight + rowGap
    const headerHeight = 30
    const headerGap = 10 // Gap between header and items
    let currentY = 0
    
    visibleLenses.forEach((l) => {
      const rowItems = items.filter(i => i.lens === l.key)
      
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
      
      const itemsPerRow = Math.max(1, Math.floor((availableW - padding * 2) / 170))
      const itemWidth = Math.floor((availableW - padding * 2 - colGap * (itemsPerRow - 1)) / itemsPerRow)
      
      if (showParentBoxes) {
        // Group items by parent
        const itemsByParent = new Map<string | null, ItemRecord[]>()
        rowItems.forEach(item => {
          const parentKey = item.parent || null
          if (!itemsByParent.has(parentKey)) {
            itemsByParent.set(parentKey, [])
          }
          itemsByParent.get(parentKey)!.push(item)
        })
        // Sort parents (null first, then alphabetically)
        const sortedParents = Array.from(itemsByParent.keys()).sort((a, b) => {
          if (a === null) return -1
          if (b === null) return 1
          return a.localeCompare(b)
        })
        
        const parentGroupPadding = 2
        const parentGroupHeaderHeight = 20
        const parentGroupGap = 10 // Gap between parent boxes
        
        let currentX = padding
        let maxYInRow = currentY
        
        sortedParents.forEach((parent) => {
          const parentItems = itemsByParent.get(parent)!
          
          if (parent !== null && parentItems.length > 0) {
            // Calculate items per row within this parent box (use standard item width)
            const itemsPerRowInBox = Math.max(1, Math.floor((availableW - padding * 2) / 170))
            const itemWidthInBox = 160 // Standard item width
            const numItemRows = Math.ceil(parentItems.length / itemsPerRowInBox)
            
            // Calculate actual width needed for items (wrap tightly around items)
            // Use the number of items in the widest row
            const itemsInWidestRow = Math.min(itemsPerRowInBox, parentItems.length)
            const itemsWidth = itemsInWidestRow * itemWidthInBox + (itemsInWidestRow - 1) * colGap
            const groupWidth = itemsWidth + parentGroupPadding * 2
            const groupHeight = numItemRows * rowHeight + parentGroupPadding * 2 + parentGroupHeaderHeight
            
            // Check if we need to start a new row (if this box would overflow)
            if (currentX + groupWidth > availableW - padding) {
              currentX = padding
              currentY = maxYInRow + parentGroupGap
              maxYInRow = currentY
            }
            
            const groupX = currentX
            const groupY = currentY
            
            parentGroups.push({
              parent,
              x: groupX,
              y: groupY,
              width: groupWidth,
              height: groupHeight,
              lens: l.key as LensKey
            })
            
            // Position items within parent group
            parentItems.forEach((it, colIdx) => {
              const col = colIdx % itemsPerRowInBox
              const row = Math.floor(colIdx / itemsPerRowInBox)
              const x = groupX + parentGroupPadding + col * (itemWidthInBox + colGap) + itemWidthInBox / 2
              const y = groupY + parentGroupHeaderHeight + parentGroupPadding + row * rowHeight + nodeHeight / 2
              if (it.id) positions.set(it.id, { x, y })
              nodes.push({ ...it, x, y })
            })
            
            // Update max Y for this row
            maxYInRow = Math.max(maxYInRow, groupY + groupHeight)
            
            // Move to next position
            currentX += groupWidth + parentGroupGap
          } else {
            // Items without parent - position normally
            parentItems.forEach((it, colIdx) => {
              const col = colIdx % itemsPerRow
              const row = Math.floor(colIdx / itemsPerRow)
              const x = padding + col * (itemWidth + colGap) + itemWidth / 2
              const y = currentY + row * rowHeight + nodeHeight / 2
              if (it.id) positions.set(it.id, { x, y })
              nodes.push({ ...it, x, y })
            })
            
            const numItemRows = Math.ceil(parentItems.length / itemsPerRow)
            if (numItemRows > 0) {
              currentY += numItemRows * rowHeight + 10 // Gap after items
              maxYInRow = Math.max(maxYInRow, currentY)
            }
          }
        })
        
        // Update currentY to the bottom of the last row of parent boxes
        currentY = maxYInRow
      } else {
        // Flat list - no parent grouping
        rowItems.forEach((it, colIdx) => {
          const col = colIdx % itemsPerRow
          const row = Math.floor(colIdx / itemsPerRow)
          const x = padding + col * (itemWidth + colGap) + itemWidth / 2
          const y = currentY + row * rowHeight + nodeHeight / 2
          if (it.id) positions.set(it.id, { x, y })
          nodes.push({ ...it, x, y })
        })
        
        const numItemRows = Math.ceil(rowItems.length / itemsPerRow)
        if (numItemRows > 0) {
          currentY += numItemRows * rowHeight + 10 // Gap after items
        }
      }
    })

    const width = availableW
    // Ensure height accounts for all content - currentY is at the bottom of the last item + gap
    // Add generous padding at the bottom to ensure nothing is cut off
    const calculatedHeight = currentY + padding + 30 // Extra padding to ensure last row is fully visible
    const height = Math.max(availableH, calculatedHeight)

    return { width, height, nodes, positions, headers, nodeWidth: 160, nodeHeight, parentGroups }
  }
}
