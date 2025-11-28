import { useEffect, useMemo, useState } from 'react'
import { db, getAllLenses } from '../db'
import { LENSES, type ItemRecord, type LensKey, type RelationshipRecord, type LifecycleStatus, type LensDefinition, type Task, type TeamMember } from '../types'
import { ItemDialog } from './ItemDialog'
import { getLensOrderSync } from '../utils/lensOrder'

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
  const [selectedManager, setSelectedManager] = useState<string | null>(null)
  const [hoveredManager, setHoveredManager] = useState<string | null>(null)
  const [fieldFilter, setFieldFilter] = useState<{ field: string; value: string } | null>(null)
  
  // Load settings from localStorage
  const [layoutMode, setLayoutMode] = useState<'columns' | 'rows'>(() => {
    const saved = localStorage.getItem('graph-layout-mode')
    return (saved === 'rows' || saved === 'columns') ? saved : 'columns'
  })
  const [viewMode, setViewMode] = useState<'skillGaps' | 'tags' | 'summary' | 'tasks'>(() => {
    const saved = localStorage.getItem('graph-view-mode')
    return (saved === 'skillGaps' || saved === 'tags' || saved === 'summary' || saved === 'tasks') ? saved : 'summary'
  })
  const [zoom, setZoom] = useState(() => {
    const saved = localStorage.getItem('graph-zoom')
    const parsed = saved ? parseFloat(saved) : 1
    return isNaN(parsed) || parsed <= 0 ? 1 : parsed
  })
  const [showParentBoxes, setShowParentBoxes] = useState(() => {
    const saved = localStorage.getItem('graph-show-parent-boxes')
    return saved === 'true'
  })
  
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<ItemRecord | null>(null)
  const [showInstructions, setShowInstructions] = useState(true)
  const [filterToRelated, setFilterToRelated] = useState(false)
  const [filterToManager, setFilterToManager] = useState(false)
  const [selectedManagerForFilter, setSelectedManagerForFilter] = useState<string | null>(null)
  const [lenses, setLenses] = useState<LensDefinition[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])

  // Load lenses from database
  useEffect(() => {
    async function loadLenses() {
      const dbLenses = await getAllLenses()
      setLenses(dbLenses.length > 0 ? dbLenses : LENSES)
    }
    loadLenses()
    
    // Listen for lens updates
    function handleLensesUpdated() {
      loadLenses()
    }
    window.addEventListener('lensesUpdated', handleLensesUpdated)
    return () => {
      window.removeEventListener('lensesUpdated', handleLensesUpdated)
    }
  }, [])

  // Persist layout mode to localStorage
  useEffect(() => {
    localStorage.setItem('graph-layout-mode', layoutMode)
  }, [layoutMode])

  // Persist view mode to localStorage
  useEffect(() => {
    localStorage.setItem('graph-view-mode', viewMode)
  }, [viewMode])

  // Persist zoom to localStorage
  useEffect(() => {
    localStorage.setItem('graph-zoom', zoom.toString())
  }, [zoom])

  // Persist show parent boxes to localStorage
  useEffect(() => {
    localStorage.setItem('graph-show-parent-boxes', showParentBoxes.toString())
  }, [showParentBoxes])


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
    const [allItems, allRels, allTasks, allTeamMembers] = await Promise.all([
      db.items.toArray(), 
      db.relationships.toArray(),
      db.tasks.toArray(),
      db.teamMembers.toArray()
    ])
    // Filter items to only visible lenses
    const filteredItems = allItems.filter(item => visible[item.lens])
    setItems(filteredItems)
    setRels(allRels)
    setTasks(allTasks)
    // Filter to only Architecture team members
    const architectureTeam = allTeamMembers.filter(m => (m.team || 'Architecture') === 'Architecture')
    setTeamMembers(architectureTeam)
  }

  useEffect(() => {
    setShowInstructions(true)
    loadItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])
  
  // Reload tasks periodically to catch updates
  useEffect(() => {
    async function loadTasks() {
      const allTasks = await db.tasks.toArray()
      setTasks(allTasks)
    }
    loadTasks()
    const interval = setInterval(loadTasks, 2000) // Poll every 2 seconds
    return () => clearInterval(interval)
  }, [])
  
  // Listen for lens updates to reload items
  useEffect(() => {
    function handleLensesUpdated() {
      loadItems()
    }
    window.addEventListener('lensesUpdated', handleLensesUpdated)
    return () => {
      window.removeEventListener('lensesUpdated', handleLensesUpdated)
    }
  }, [])

  // Clear filter when item is deselected
  useEffect(() => {
    if (!selectedItemId) {
      setFilterToRelated(false)
    }
  }, [selectedItemId])

  // Clear manager filter when manager is deselected
  useEffect(() => {
    if (!selectedManager) {
      setFilterToManager(false)
      setSelectedManagerForFilter(null)
    }
  }, [selectedManager])

  // Helper function to recursively get all reports for a manager
  function getAllReports(managerName: string, teamMembers: TeamMember[]): Set<string> {
    const reports = new Set<string>()
    const directReports = teamMembers.filter(m => m.manager === managerName)
    
    directReports.forEach(report => {
      reports.add(report.name)
      // Recursively get reports of this report
      const subReports = getAllReports(report.name, teamMembers)
      subReports.forEach(subReport => reports.add(subReport))
    })
    
    return reports
  }


  // Generate manager colors with hierarchical relationships (for all managers)
  // Each manager gets a unique color, but sub-managers have variations of their parent's color
  function generateManagerColors(teamMembers: TeamMember[]): Map<string, { fill: string; stroke: string }> {
    const colors = new Map<string, { fill: string; stroke: string }>()

    // Get all managers in the Architecture team (those who have people reporting to them)
    const allManagers = new Set<string>()
    teamMembers.forEach(member => {
      const isManager = teamMembers.some(m => m.manager === member.name)
      if (isManager) {
        allManagers.add(member.name)
      }
    })

    // Identify top-level managers (those with no manager in the Architecture team)
    const topLevelManagers = new Set<string>()
    allManagers.forEach(managerName => {
      const manager = teamMembers.find(m => m.name === managerName)
      if (!manager || !manager.manager || !allManagers.has(manager.manager)) {
        topLevelManagers.add(managerName)
      }
    })

    // Build hierarchy: map each manager to their direct reports
    const managerHierarchy = new Map<string, string[]>()
    allManagers.forEach(managerName => {
      const reports = teamMembers
        .filter(m => m.manager === managerName && allManagers.has(m.name))
        .map(m => m.name)
      managerHierarchy.set(managerName, reports)
    })

    // Assign unique hues to all managers
    // Use a wider range of hues for better distinction
    const baseHues: number[] = []
    // Generate more hues for better distribution (every 30 degrees gives 12 distinct colors)
    for (let i = 0; i < 360; i += 30) {
      baseHues.push(i)
    }
    
    const managerHues = new Map<string, number>()
    const usedHues = new Set<number>()
    
    // First, assign hues to top-level managers
    const topLevelArray = Array.from(topLevelManagers)
    topLevelArray.forEach((managerName, idx) => {
      const hue = baseHues[idx % baseHues.length]
      managerHues.set(managerName, hue)
      usedHues.add(hue)
    })

    // Then assign unique hues to sub-managers, using variations of their parent's hue
    function assignHueToSubManagers(parentName: string, parentHue: number, depth: number = 0) {
      const reports = managerHierarchy.get(parentName) || []
      if (reports.length === 0) return
      
      // For each sub-manager, assign a unique hue that's a variation of the parent
      // Use a shift that ensures uniqueness while maintaining visual relationship
      const hueShift = 15 // Shift by 15 degrees for each level
      const maxDepth = 3 // Limit depth to avoid too many shifts
      const actualDepth = Math.min(depth, maxDepth)
      
      reports.forEach((subManagerName, idx) => {
        if (managerHues.has(subManagerName)) return // Already assigned
        
        // Calculate a variation of the parent hue
        // For first sub-manager: shift by hueShift
        // For subsequent sub-managers: shift by additional amounts
        const shift = (actualDepth + 1) * hueShift + (idx * 10) // Additional shift for multiple siblings
        let subHue = (parentHue + shift) % 360
        
        // Ensure uniqueness: if this hue is already used, find the next available one
        let attempts = 0
        while (usedHues.has(subHue) && attempts < 36) {
          subHue = (subHue + 10) % 360 // Try next 10-degree increment
          attempts++
        }
        
        // If still not unique, find any unused hue
        if (usedHues.has(subHue)) {
          for (let i = 0; i < 360; i += 5) {
            const candidateHue = (parentHue + i) % 360
            if (!usedHues.has(candidateHue)) {
              subHue = candidateHue
              break
            }
          }
        }
        
        managerHues.set(subManagerName, subHue)
        usedHues.add(subHue)
        
        // Recursively assign to their sub-managers
        assignHueToSubManagers(subManagerName, subHue, actualDepth + 1)
      })
    }

    // Assign hues to all sub-managers starting from top-level managers
    topLevelArray.forEach(managerName => {
      const parentHue = managerHues.get(managerName)!
      assignHueToSubManagers(managerName, parentHue, 0)
    })

    // Generate colors for all managers
    allManagers.forEach(managerName => {
      const hue = managerHues.get(managerName) || 0
      
      // Top-level: full saturation, medium lightness
      // Sub-managers: same hue family, adjusted saturation/lightness to show hierarchy
      const manager = teamMembers.find(m => m.name === managerName)
      const isSubManager = manager && manager.manager && allManagers.has(manager.manager)
      
      let saturation = 70
      let fillLightness = 85
      let strokeLightness = 50
      
      if (isSubManager) {
        // Sub-manager: lighter shade, slightly less saturation to show it's a variation
        fillLightness = 90
        strokeLightness = 55
        saturation = 60
      } else {
        // Top-level: more vibrant
        fillLightness = 80
        strokeLightness = 45
        saturation = 75
      }

      colors.set(managerName, {
        fill: `hsl(${hue}, ${saturation}%, ${fillLightness}%)`,
        stroke: `hsl(${hue}, ${saturation}%, ${strokeLightness}%)`
      })
    })

    return colors
  }

  // Calculate item coverage by manager (find which manager covers this item)
  function getItemManagerCoverage(
    item: ItemRecord, 
    teamMembers: TeamMember[]
  ): { manager: string | null; strength: 'primary' | 'secondary' | 'none' } {
    // Find which manager covers this item
    const allManagers = new Set<string>()
    teamMembers.forEach(member => {
      const isManager = teamMembers.some(m => m.manager === member.name)
      if (isManager) {
        allManagers.add(member.name)
      }
    })
    
    // Check each manager to see if they cover this item
    for (const managerName of allManagers) {
      const allReports = getAllReports(managerName, teamMembers)
      const reportNames = Array.from(allReports)
      
      // Check for primary coverage
      if (item.primaryArchitect && reportNames.includes(item.primaryArchitect.trim())) {
        return { manager: managerName, strength: 'primary' }
      }
      
      // Check for secondary coverage
      const hasSecondary = item.secondaryArchitects.some(arch => 
        reportNames.includes(arch.trim())
      )
      if (hasSecondary) {
        return { manager: managerName, strength: 'secondary' }
      }
    }
    
    return { manager: null, strength: 'none' }
  }

  // Create a set of visible item IDs (items in visible lenses)
  const visibleItemIds = useMemo(() => {
    return new Set(items.map(item => item.id).filter((id): id is number => !!id))
  }, [items])

  // Generate manager colors for all managers
  const managerColors = useMemo(() => {
    return generateManagerColors(teamMembers)
  }, [teamMembers])

  // Get list of managers for dropdown (only Architecture team members who are managers)
  const managerList = useMemo(() => {
    const managers = new Set<string>()
    teamMembers.forEach(member => {
      // Check if this person is a manager (has people reporting to them)
      const isManager = teamMembers.some(m => m.manager === member.name)
      if (isManager) {
        managers.add(member.name)
      }
    })
    return Array.from(managers).sort()
  }, [teamMembers])

  // Filter relationships to only show those related to selected or hovered item
  // When filterToRelated is active, only use selectedItemId (ignore hover)
  // Also filter out relationships where either item is in a hidden lens
  const visibleRels = useMemo(() => {
    // When filter is active, only show relationships for selected item, not hovered
    const activeItemId = filterToRelated ? selectedItemId : (hoveredItemId || selectedItemId)
    if (!activeItemId) return []
    
    // Filter relationships to only include those where:
    // 1. They're related to the active item (selected/hovered)
    // 2. Both items are in visible lenses
    return rels.filter(r => {
      const isRelated = r.fromItemId === activeItemId || r.toItemId === activeItemId
      const bothVisible = visibleItemIds.has(r.fromItemId) && visibleItemIds.has(r.toItemId)
      return isRelated && bothVisible
    })
  }, [rels, selectedItemId, hoveredItemId, filterToRelated, visibleItemIds])

  // Get set of related item IDs for highlighting
  // When filterToRelated is active, only use selectedItemId (ignore hover)
  const relatedItemIds = useMemo(() => {
    // When filter is active, only show relationships for selected item, not hovered
    const activeItemId = filterToRelated ? selectedItemId : (hoveredItemId || selectedItemId)
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
  }, [visibleRels, selectedItemId, hoveredItemId, filterToRelated])

  // Get items covered by a manager's team
  const getManagerCoveredItems = useMemo(() => {
    if (!filterToManager || !selectedManagerForFilter) return new Set<number>()
    
    const allReports = getAllReports(selectedManagerForFilter, teamMembers)
    const reportNames = Array.from(allReports)
    const coveredItemIds = new Set<number>()
    
    items.forEach(item => {
      const isPrimary = item.primaryArchitect && reportNames.includes(item.primaryArchitect.trim())
      const isSecondary = item.secondaryArchitects.some(arch => reportNames.includes(arch.trim()))
      if (isPrimary || isSecondary) {
        if (item.id !== undefined) {
          coveredItemIds.add(item.id)
        }
      }
    })
    
    return coveredItemIds
  }, [filterToManager, selectedManagerForFilter, teamMembers, items])

  // Filter items based on field filter, related items filter, or manager filter
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

    // Apply manager filter if active
    if (filterToManager && selectedManagerForFilter) {
      result = result.filter(item => getManagerCoveredItems.has(item.id!))
    }

    return result
  }, [items, fieldFilter, filterToRelated, selectedItemId, relatedItemIds, filterToManager, selectedManagerForFilter, getManagerCoveredItems])

  // Only include visible lenses in layout, using custom order
  // When filtering to related items, only show lenses that have items in the filtered set
  const visibleLenses = useMemo(() => {
    const order = getLensOrderSync()
    const orderMap = new Map(order.map((key, idx) => [key, idx]))
    const ordered = [...lenses].sort((a, b) => {
      const aIdx = orderMap.get(a.key) ?? 999
      const bIdx = orderMap.get(b.key) ?? 999
      return aIdx - bIdx
    }).filter(l => visible[l.key])
    if (filterToRelated && selectedItemId) {
      // Only include lenses that have at least one item in filteredItems
      const filteredLensKeys = new Set(filteredItems.map(item => item.lens))
      return ordered.filter(l => filteredLensKeys.has(l.key))
    }
    if (filterToManager && selectedManagerForFilter) {
      // Only include lenses that have at least one item covered by the manager
      const filteredLensKeys = new Set(filteredItems.map(item => item.lens))
      return ordered.filter(l => filteredLensKeys.has(l.key))
    }
    return ordered
  }, [lenses, visible, lensOrderKey, filterToRelated, selectedItemId, filteredItems, filterToManager, selectedManagerForFilter])
  
  // Get manager positions (only in Architecture Coverage view)
  const managerPositions = useMemo(() => {
    if (viewMode !== 'skillGaps') return new Map<string, { x: number; y: number }>()
    
    const positions = new Map<string, { x: number; y: number }>()
    const managers = managerList
    if (managers.length === 0) return positions
    
    const managerRowHeight = 70
    const managerGap = 5
    const managerWidth = 160
    const padding = 16
    const availableW = Math.max(320, (dims.w / zoom) - padding * 2)
    
    // Calculate how many managers fit per row
    const managersPerRow = Math.floor((availableW - padding * 2) / (managerWidth + managerGap))
    const actualManagersPerRow = Math.max(1, managersPerRow)
    
    // Position manager boxes with minimal spacing (2px gap above and below)
    // Menu/header is positioned absolutely at top-0, SVG has paddingTop: 48px
    // Menu is approximately 30-35px tall, but SVG starts at 48px, so menu bottom is at ~35px from viewport top
    // In SVG coordinates (starting at 48px), menu bottom is at 35-48 = -13px, so we position at 0 + 2px gap
    // First box top = 2px from SVG top (which is 50px from viewport top, just below menu)
    const topGap = 2
    const rowGap = 2 // Minimal gap between rows
    const firstBoxTop = topGap // Top edge of first box in SVG coordinates (2px from SVG start)
    
    managers.forEach((manager, idx) => {
      const row = Math.floor(idx / actualManagersPerRow)
      const col = idx % actualManagersPerRow
      const x = padding + col * (managerWidth + managerGap) + managerWidth / 2
      // Box center = first box top + row offset + half box height
      const y = firstBoxTop + row * (managerRowHeight + rowGap) + managerRowHeight / 2
      positions.set(manager, { x, y })
    })
    
    return positions
  }, [viewMode, managerList, dims.w, zoom])

  const layout = useMemo(() => {
    const layoutResult = computeLayout(filteredItems, dims.w, dims.h, visibleLenses, layoutMode, showParentBoxes, zoom)
    // Adjust layout to account for manager row if in Architecture Coverage view
    if (viewMode === 'skillGaps' && managerPositions.size > 0) {
      const managerRowCount = Math.ceil(managerList.length / Math.max(1, Math.floor((Math.max(320, (dims.w / zoom) - 32)) / 165)))
      const managerRowHeight = 70
      const topGap = 2
      const rowGap = 2
      const bottomGap = 2
      const firstBoxTop = topGap
      // Calculate total height: first box top + all rows + bottom gap
      const additionalHeight = firstBoxTop + managerRowCount * managerRowHeight + (managerRowCount - 1) * rowGap + bottomGap
      return {
        ...layoutResult,
        height: layoutResult.height + additionalHeight,
        // Adjust all item positions down by the manager row height
        positions: new Map(Array.from(layoutResult.positions.entries()).map(([id, pos]) => [
          id,
          { x: pos.x, y: pos.y + additionalHeight }
        ])),
        nodes: layoutResult.nodes.map(node => ({
          ...node,
          y: node.y + additionalHeight
        })),
        headers: layoutResult.headers.map(header => ({
          ...header,
          y: header.y + additionalHeight
        })),
        parentGroups: layoutResult.parentGroups.map(group => ({
          ...group,
          y: group.y + additionalHeight
        }))
      }
    }
    return layoutResult
  }, [filteredItems, dims, visibleLenses, layoutMode, showParentBoxes, zoom, viewMode, managerPositions, managerList])

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
                  onChange={e => setViewMode(e.target.value as 'skillGaps' | 'tags' | 'summary' | 'tasks')}
                  className="px-2 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="skillGaps">Architecture coverage</option>
                  <option value="tags">Tags</option>
                  <option value="summary">Summary</option>
                  <option value="tasks">Tasks</option>
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
                {filterToManager && selectedManagerForFilter ? (
                  <span>
                    Filtered to items covered by {selectedManagerForFilter}. Click filter button again to show all.
                  </span>
                ) : selectedItemId ? (
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
      <div style={{ paddingTop: '48px', width: Math.max(dims.w, layout.width * zoom) + 'px', minWidth: '100%' }}>
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
        
        {/* Manager boxes (only in Architecture Coverage view) */}
        {viewMode === 'skillGaps' && Array.from(managerPositions.entries()).map(([managerName, pos]) => {
          const managerColor = managerColors.get(managerName)
          const fillColor = managerColor?.fill || "#e5e7eb"
          const strokeColor = managerColor?.stroke || "#9ca3af"
          const nodeWidth = layout.nodeWidth
          const nodeHeight = layout.nodeHeight
          const isSelected = selectedManager === managerName
          const isHovered = hoveredManager === managerName
          const isActive = isSelected || isHovered
          const isFiltered = filterToManager && selectedManagerForFilter === managerName
          
          return (
            <g 
              key={`manager-${managerName}`}
              onClick={() => setSelectedManager(isSelected ? null : managerName)}
              onMouseEnter={() => setHoveredManager(managerName)}
              onMouseLeave={() => setHoveredManager(null)}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={pos.x - nodeWidth / 2}
                y={pos.y - nodeHeight / 2}
                width={nodeWidth}
                height={nodeHeight}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={isActive ? 3 : 2}
                rx={6}
                ry={6}
              />
              <text
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                className="fill-slate-800 dark:fill-slate-200"
                style={{ fontSize: 12, fontWeight: 600 }}
              >
                {managerName}
              </text>
              {/* Filter button */}
              {(isSelected || isHovered) && (
                <foreignObject
                  x={pos.x + nodeWidth / 2 - 22}
                  y={pos.y - nodeHeight / 2 + 2}
                  width={18}
                  height={18}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      const newFilterState = !filterToManager || selectedManagerForFilter !== managerName
                      if (newFilterState) {
                        setSelectedManagerForFilter(managerName)
                        setFilterToManager(true)
                        setSelectedManager(managerName) // Also select the manager
                      } else {
                        setFilterToManager(false)
                        setSelectedManagerForFilter(null)
                        setSelectedManager(null) // Also deselect the manager
                      }
                    }}
                    className="w-full h-full flex items-center justify-center rounded border border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700"
                    title={isFiltered ? "Show all items" : "Show only items covered by this manager"}
                    style={{ padding: 0, cursor: 'pointer' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={isFiltered ? "text-blue-600 dark:text-blue-400" : "text-slate-600 dark:text-slate-400"}>
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                    </svg>
                  </button>
                </foreignObject>
              )}
            </g>
          )
        })}
        
        {/* Relationship lines from managers to items (only in Architecture Coverage view, only when manager is hovered or selected) */}
        {viewMode === 'skillGaps' && Array.from(managerPositions.entries())
          .filter(([managerName]) => {
            const isSelected = selectedManager === managerName
            const isHovered = hoveredManager === managerName
            return isSelected || isHovered
          })
          .map(([managerName, managerPos]) => {
            const allReports = getAllReports(managerName, teamMembers)
            const reportNames = Array.from(allReports)
            const managerColor = managerColors.get(managerName)
            const lineColor = managerColor?.stroke || "#9ca3af"
            const nodeHeight = layout.nodeHeight
            
            return layout.nodes.map(item => {
              // Check if this item is covered by this manager's team
              const isPrimary = item.primaryArchitect && reportNames.includes(item.primaryArchitect.trim())
              const isSecondary = item.secondaryArchitects.some(arch => reportNames.includes(arch.trim()))
              
              if (!isPrimary && !isSecondary) return null
              
              const strokeWidth = isPrimary ? 2 : 1
              const startY = managerPos.y + nodeHeight / 2
              const endY = item.y - nodeHeight / 2
              const midX = (managerPos.x + item.x) / 2
              
              return (
                <path
                  key={`manager-line-${managerName}-${item.id}`}
                  d={`M ${managerPos.x} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${item.x} ${endY}`}
                  fill="none"
                  stroke={lineColor}
                  strokeWidth={strokeWidth}
                />
              )
            }).filter(Boolean)
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
          
          // Get open tasks for this item
          const itemOpenTasks = n.id !== undefined 
            ? tasks.filter(t => !t.completedAt && t.itemReferences && t.itemReferences.filter((id): id is number => id !== undefined).includes(n.id!))
            : []
          const openTaskCount = itemOpenTasks.length
          
          // Determine colors and stroke based on view mode
          let fillColor: string
          let strokeColor: string
          let strokeWidth: number
          
          if (viewMode === 'tasks') {
            // Tasks view: color by open task count
            // 0 tasks: green, 1 task: orange, 2+ tasks: red
            if (openTaskCount === 0) {
              fillColor = isActive ? "#bbf7d0" : "#dcfce7"
              strokeColor = isActive ? "#16a34a" : "#22c55e"
            } else if (openTaskCount === 1) {
              fillColor = isActive ? "#fed7aa" : "#ffedd5"
              strokeColor = isActive ? "#ea580c" : "#f97316"
            } else {
              fillColor = isActive ? "#fecaca" : "#fee2e2"
              strokeColor = isActive ? "#dc2626" : "#ef4444"
            }
            strokeWidth = isHovered || isSelected ? 2 : (isRelated ? 2 : 1)
          } else if (viewMode === 'tags') {
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
            
            // Determine if item is red (skills gap or no coverage)
            const isRed = hasSkillsGap || (!hasPrimaryArchitect && !hasSecondaryArchitects)
            
            // Get manager coverage for this item
            const managerCoverage = getItemManagerCoverage(n, teamMembers)
            const managerColor = managerCoverage.manager ? managerColors.get(managerCoverage.manager) : null
            
            // Base colors (used when item is red and has manager coverage)
            let baseFillColor: string
            
            if (isRed) {
              baseFillColor = isActive ? "#fecaca" : "#fee2e2"
            } else if (!hasSkillsGap && hasSecondaryArchitects && !hasPrimaryArchitect) {
              baseFillColor = isActive ? "#fed7aa" : "#ffedd5"
            } else {
              baseFillColor = isActive ? "#bfdbfe" : "#e0f2fe"
            }
            
            // Apply manager colors if available
            if (managerColor && managerCoverage.strength !== 'none') {
              if (isRed) {
                // Keep red fill, apply manager color to border
                fillColor = baseFillColor
                strokeColor = managerColor.stroke
              } else {
                // Apply manager colors to both fill and stroke
                fillColor = managerColor.fill
                strokeColor = managerColor.stroke
              }
              
              // Set border thickness based on coverage strength
              if (managerCoverage.strength === 'primary') {
                strokeWidth = isHovered || isSelected ? 4 : (isRelated ? 3 : 3)
              } else if (managerCoverage.strength === 'secondary') {
                strokeWidth = isHovered || isSelected ? 3 : (isRelated ? 2 : 2)
              } else {
                strokeWidth = isHovered || isSelected ? 2 : (isRelated ? 2 : 1)
              }
            } else {
              // No manager coverage, make grey
              fillColor = isActive ? "#e5e7eb" : "#f3f4f6"
              strokeColor = isActive ? "#9ca3af" : "#d1d5db"
              strokeWidth = isHovered || isSelected ? 2 : (isRelated ? 2 : 1)
            }
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
              
              {/* Filter icon for selected or hovered items - top right corner */}
              {(isSelected || isHovered) && (
                <foreignObject
                  x={n.x + layout.nodeWidth / 2 - 20}
                  y={n.y - layout.nodeHeight / 2 + 2}
                  width={18}
                  height={18}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      const newFilterState = !filterToRelated
                      // If turning filter off, also deselect the item
                      if (newFilterState === false) {
                        setSelectedItemId(null)
                      } else {
                        // If turning filter on, select the item (same action as clicking on the item)
                        setSelectedItemId(n.id || null)
                      }
                      // Toggle the filter
                      setFilterToRelated(newFilterState)
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
              
              {/* Tasks view: show task names or count */}
              {viewMode === 'tasks' && openTaskCount > 0 && (
                <>
                  {openTaskCount <= 2 ? (
                    // Show task names for 1-2 tasks
                    (() => {
                      let currentY = n.y - 22 + nameLines.length * 11 + 4
                      return itemOpenTasks.slice(0, 2).flatMap((task) => {
                        const taskLines = wrapText(task.description, maxTextWidth, 9)
                        const result = taskLines.map((line, lineIdx) => (
                          <text
                            key={`task-${task.id}-${lineIdx}`}
                            x={n.x}
                            y={currentY + lineIdx * 8}
                            textAnchor="middle"
                            className="fill-slate-700 dark:fill-slate-300"
                            style={{ fontSize: 9 }}
                          >
                            {line}
                          </text>
                        ))
                        currentY += taskLines.length * 8
                        return result
                      })
                    })()
                  ) : (
                    // Show count for 3+ tasks
                    <text
                      x={n.x}
                      y={n.y - 22 + nameLines.length * 11 + 4}
                      textAnchor="middle"
                      className="fill-slate-700 dark:fill-slate-300"
                      style={{ fontSize: 9 }}
                    >
                      {openTaskCount} open tasks
                    </text>
                  )}
                </>
              )}
              
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
        onEditPerson={(personName) => {
          window.dispatchEvent(new CustomEvent('editPerson', { detail: { personName } }))
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

function computeLayout(items: ItemRecord[], windowW: number, windowH: number, visibleLenses: typeof LENSES, mode: 'columns' | 'rows', showParentBoxes: boolean = true, zoom: number = 1) {
  const padding = 16
  // When zoomed in (zoom > 1), calculate layout with more space to fit more items per row
  // Divide by zoom to account for the fact that we'll scale up, so we need less base space
  // When zoom is 2.0, we want 2x the items, so we calculate with 1/2 the space, then scale 2x
  const availableW = Math.max(320, (windowW / zoom) - padding * 2)
  const availableH = Math.max(240, (windowH / zoom) - padding * 2)
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
      
      // Calculate items per row based on available width, accounting for zoom
      // When zoomed in, we have more effective space, so fit more items
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
