import { useEffect, useMemo, useState, useRef } from 'react'
import { db, getAllLenses } from '../db'
import { LENSES, type ItemRecord, type LensKey, type RelationshipRecord, type LifecycleStatus, type LensDefinition, type Task, type TeamMember, type MeetingNote } from '../types'
import { ItemDialog } from './ItemDialog'
import { getLensOrderSync } from '../utils/lensOrder'
import { loadTheme, type Theme } from '../utils/theme'

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
  const [viewMode, setViewMode] = useState<'skillGaps' | 'tags' | 'summary' | 'tasks' | 'minimal'>(() => {
    const saved = localStorage.getItem('graph-view-mode')
    return (saved === 'skillGaps' || saved === 'tags' || saved === 'summary' || saved === 'tasks' || saved === 'minimal') ? saved : 'summary'
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
  const [showRelationshipLines, setShowRelationshipLines] = useState(() => {
    const saved = localStorage.getItem('graph-show-relationship-lines')
    return saved !== 'false' // Default to true
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
  const [theme, setTheme] = useState<Theme>(loadTheme())
  const [showDetailsBox, setShowDetailsBox] = useState(true)
  const [relatedNotes, setRelatedNotes] = useState<MeetingNote[]>([])
  const [relatedTasks, setRelatedTasks] = useState<Task[]>([])
  const [relatedItemsMap, setRelatedItemsMap] = useState<Map<number, ItemRecord>>(new Map())
  
  const svgRef = useRef<SVGSVGElement>(null)
  
  // Helper function to get lens label
  function lensLabel(lens: string): string {
    return lenses.find(l => l.key === lens)?.label || lens
  }
  
  // Get selected item for details box
  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null
    return items.find(i => i.id === selectedItemId) || null
  }, [items, selectedItemId])
  
  // Function to toggle task completion
  async function handleToggleTaskComplete(task: Task) {
    if (!task.id) return
    const now = Date.now()
    await db.tasks.update(task.id, {
      completedAt: task.completedAt ? undefined : now,
      updatedAt: now,
    })
    // Reload related tasks
    if (selectedItemId) {
      const allTasks = await db.tasks.toArray()
      const relevantTasks = allTasks.filter(t => t.itemReferences && t.itemReferences.filter((id): id is number => id !== undefined).includes(selectedItemId))
      const sortedTasks = relevantTasks.sort((a, b) => {
        const aCompleted = !!a.completedAt
        const bCompleted = !!b.completedAt
        if (aCompleted !== bCompleted) {
          return aCompleted ? 1 : -1
        }
        return (b.createdAt || 0) - (a.createdAt || 0)
      })
      setRelatedTasks(sortedTasks)
    }
  }
  
  // Load related notes, tasks, and items when selectedItemId changes
  useEffect(() => {
    if (!selectedItemId) {
      setRelatedNotes([])
      setRelatedTasks([])
      setRelatedItemsMap(new Map())
      return
    }
    
    async function loadRelatedData() {
      if (!selectedItemId) return
      
      // Load related notes
      const allTasks = await db.tasks.toArray()
      const relevantTasks = allTasks.filter(t => t.itemReferences && t.itemReferences.filter((id): id is number => id !== undefined).includes(selectedItemId))
      const noteIdsFromTasks = Array.from(new Set(relevantTasks.map(t => t.meetingNoteId).filter((id): id is number => id !== undefined)))
      
      const allNotes = await db.meetingNotes.toArray()
      const notesWithRelatedItem = allNotes.filter(n => n.relatedItems && n.relatedItems.includes(selectedItemId))
      const noteIdsFromRelated = notesWithRelatedItem.map(n => n.id!).filter((id): id is number => id !== undefined)
      
      const allNoteIds = Array.from(new Set([...noteIdsFromTasks, ...noteIdsFromRelated]))
      if (allNoteIds.length > 0) {
        const notes = await db.meetingNotes.bulkGet(allNoteIds)
        setRelatedNotes(notes.filter((n): n is MeetingNote => n !== undefined))
      } else {
        setRelatedNotes([])
      }
      
      // Load related tasks
      const sortedTasks = relevantTasks.sort((a, b) => {
        const aCompleted = !!a.completedAt
        const bCompleted = !!b.completedAt
        if (aCompleted !== bCompleted) {
          return aCompleted ? 1 : -1
        }
        return (b.createdAt || 0) - (a.createdAt || 0)
      })
      setRelatedTasks(sortedTasks)
      
      // Load related items (from relationships)
      const itemRels = rels.filter(r => r.fromItemId === selectedItemId || r.toItemId === selectedItemId)
      const relatedIds = new Set<number>()
      itemRels.forEach(r => {
        if (r.fromItemId === selectedItemId) relatedIds.add(r.toItemId)
        if (r.toItemId === selectedItemId) relatedIds.add(r.fromItemId)
      })
      
      if (relatedIds.size > 0) {
        const relatedItems = await db.items.bulkGet(Array.from(relatedIds))
        const map = new Map<number, ItemRecord>()
        relatedItems.forEach(item => {
          if (item) map.set(item.id!, item)
        })
        setRelatedItemsMap(map)
      } else {
        setRelatedItemsMap(new Map())
      }
    }
    
    loadRelatedData()
  }, [selectedItemId, rels])
  

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

  // Persist show relationship lines to localStorage
  useEffect(() => {
    localStorage.setItem('graph-show-relationship-lines', String(showRelationshipLines))
  }, [showRelationshipLines])

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

  // Listen for theme changes
  useEffect(() => {
    function handleThemeChange() {
      setTheme(loadTheme())
    }
    window.addEventListener('themeUpdated', handleThemeChange)
    return () => {
      window.removeEventListener('themeUpdated', handleThemeChange)
    }
  }, [])

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
      setShowDetailsBox(true) // Reset to show when new item is selected
    } else {
      setShowDetailsBox(true) // Show details box when item is selected
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
    // Completely avoid red hues (0-30 and 330-360) to prevent any red colors
    // Use a safe range: 30-330 degrees (300 degrees of safe color space)
    const managerHues = new Map<string, number>()
    const usedHues = new Set<number>()
    const minHueSeparation = 25 // Minimum degrees between any two manager colors for easy distinction
    
    // Helper function to normalize hue to safe range (30-330)
    function normalizeHue(hue: number): number {
      // Normalize to 0-360 range
      let normalized = ((hue % 360) + 360) % 360
      // If in red range, shift to safe range
      if (normalized >= 0 && normalized <= 30) {
        normalized = 30
      } else if (normalized >= 330 && normalized <= 360) {
        normalized = 330
      }
      return normalized
    }
    
    // Helper function to check if a hue is sufficiently different from all used hues
    function isHueSufficientlyDifferent(hue: number, usedHues: Set<number>, minSeparation: number): boolean {
      for (const usedHue of usedHues) {
        // Calculate the minimum circular distance between hues
        const diff1 = Math.abs(hue - usedHue)
        const diff2 = Math.abs(hue - (usedHue + 360))
        const diff3 = Math.abs(hue - (usedHue - 360))
        const minDiff = Math.min(diff1, diff2, diff3)
        if (minDiff < minSeparation) {
          return false
        }
      }
      return true
    }
    
    // Helper function to find the next available hue that's sufficiently different
    function findDistinctHue(startHue: number, usedHues: Set<number>, minSeparation: number): number {
      // Try the start hue first
      if (isHueSufficientlyDifferent(startHue, usedHues, minSeparation)) {
        return normalizeHue(startHue)
      }
      
      // Try incrementing by minSeparation steps
      for (let offset = minSeparation; offset < 300; offset += minSeparation) {
        const candidate1 = normalizeHue(startHue + offset)
        if (isHueSufficientlyDifferent(candidate1, usedHues, minSeparation)) {
          return candidate1
        }
        const candidate2 = normalizeHue(startHue - offset)
        if (isHueSufficientlyDifferent(candidate2, usedHues, minSeparation)) {
          return candidate2
        }
      }
      
      // If still not found, try every 5 degrees in the safe range
      for (let i = 30; i <= 330; i += 5) {
        if (isHueSufficientlyDifferent(i, usedHues, minSeparation)) {
          return i
        }
      }
      
      // Last resort: return the start hue normalized (will be close but distinct enough)
      return normalizeHue(startHue)
    }
    
    // First, assign hues to top-level managers, evenly distributed
    const topLevelArray = Array.from(topLevelManagers)
    const totalManagers = allManagers.size
    // Calculate spacing to distribute colors evenly across available range
    const hueSpacing = totalManagers > 1 ? Math.floor(300 / totalManagers) : 300
    const baseHueStart = 30
    
    topLevelArray.forEach((managerName, idx) => {
      // Distribute top-level managers evenly across the hue range
      const baseHue = baseHueStart + (idx * hueSpacing)
      const hue = findDistinctHue(baseHue, usedHues, minHueSeparation)
      managerHues.set(managerName, hue)
      usedHues.add(hue)
    })

    // Then assign unique hues to sub-managers, ensuring they're distinct from all other managers
    function assignHueToSubManagers(parentName: string, parentHue: number, depth: number = 0) {
      const reports = managerHierarchy.get(parentName) || []
      if (reports.length === 0) return
      
      // For sub-managers, we want colors that are:
      // 1. Related to parent (but not too close)
      // 2. Distinct from all other managers (including siblings)
      // 3. At least minHueSeparation degrees from any existing color
      const baseShift = minHueSeparation + 10 // Start with a shift larger than minimum separation
      const siblingShift = minHueSeparation + 5 // Additional shift for each sibling
      
      reports.forEach((subManagerName, idx) => {
        if (managerHues.has(subManagerName)) return // Already assigned
        
        // Calculate a starting hue that's related to parent but distinct
        // Shift by baseShift + additional for each sibling
        const shift = baseShift + (idx * siblingShift)
        const startHue = normalizeHue(parentHue + shift)
        
        // Find a hue that's sufficiently different from all used hues
        const subHue = findDistinctHue(startHue, usedHues, minHueSeparation)
        
        managerHues.set(subManagerName, subHue)
        usedHues.add(subHue)
        
        // Recursively assign to their sub-managers
        assignHueToSubManagers(subManagerName, subHue, depth + 1)
      })
    }

    // Assign hues to all sub-managers starting from top-level managers
    topLevelArray.forEach(managerName => {
      const parentHue = managerHues.get(managerName)!
      assignHueToSubManagers(managerName, parentHue, 0)
    })

    // Generate colors for all managers
    allManagers.forEach(managerName => {
      let hue = managerHues.get(managerName)
      
      // Final safety check: ensure hue is in safe range (30-330, avoiding red)
      if (hue === undefined) {
        // Fallback: use a safe blue hue if somehow undefined
        hue = 210
      } else {
        // Normalize to safe range one more time
        hue = ((hue % 360) + 360) % 360
        if (hue >= 0 && hue <= 30) {
          hue = 30
        } else if (hue >= 330 && hue <= 360) {
          hue = 330
        }
      }
      
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

  // Find which manager covers this item (immediate manager)
  function getItemManagerCoverage(
    item: ItemRecord, 
    teamMembers: TeamMember[]
  ): { manager: string | null; strength: 'primary' | 'secondary' | 'none' } {
    // Find all managers
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
  
  // Build manager hierarchy structure
  const managerHierarchy = useMemo(() => {
    if (viewMode !== 'skillGaps') return { topLevel: [], hierarchy: new Map<string, string[]>(), parentMap: new Map<string, string>() }
    
    const allManagers = new Set<string>()
    teamMembers.forEach(member => {
      const isManager = teamMembers.some(m => m.manager === member.name)
      if (isManager) {
        allManagers.add(member.name)
      }
    })
    
    // Identify top-level managers (those with no manager in the Architecture team)
    const topLevelManagers: string[] = []
    allManagers.forEach(managerName => {
      const manager = teamMembers.find(m => m.name === managerName)
      if (!manager || !manager.manager || !allManagers.has(manager.manager)) {
        topLevelManagers.push(managerName)
      }
    })
    
    // Build hierarchy: map each manager to their direct reports (who are also managers)
    const hierarchy = new Map<string, string[]>()
    const parentMap = new Map<string, string>() // Map child to parent
    allManagers.forEach(managerName => {
      const reports = teamMembers
        .filter(m => m.manager === managerName && allManagers.has(m.name))
        .map(m => m.name)
      hierarchy.set(managerName, reports)
      reports.forEach(report => {
        parentMap.set(report, managerName)
      })
    })
    
    return { topLevel: topLevelManagers.sort(), hierarchy, parentMap }
  }, [viewMode, teamMembers])

  // Determine which managers should be visible based on filter state
  const visibleManagers = useMemo(() => {
    if (viewMode !== 'skillGaps') return new Set<string>()
    
    // If no filter is active, show all managers
    if (!filterToManager || !selectedManagerForFilter) {
      const allManagers = new Set<string>()
      teamMembers.forEach(member => {
        const isManager = teamMembers.some(m => m.manager === member.name)
        if (isManager) {
          allManagers.add(member.name)
        }
      })
      return allManagers
    }
    
    // When filter is active, show only the selected manager and all managers in its hierarchy
    const visible = new Set<string>()
    const { hierarchy, parentMap } = managerHierarchy
    
    // Add the selected manager
    visible.add(selectedManagerForFilter)
    
    // Recursively add all children (sub-managers)
    function addChildren(managerName: string) {
      const children = hierarchy.get(managerName) || []
      children.forEach(child => {
        visible.add(child)
        addChildren(child) // Recursively add grandchildren, etc.
      })
    }
    addChildren(selectedManagerForFilter)
    
    // Add all parents up the chain
    function addParents(managerName: string) {
      const parent = parentMap.get(managerName)
      if (parent) {
        visible.add(parent)
        addParents(parent) // Recursively add grandparents, etc.
      }
    }
    addParents(selectedManagerForFilter)
    
    return visible
  }, [viewMode, filterToManager, selectedManagerForFilter, managerHierarchy, teamMembers])

  // Get manager positions (only in Architecture Coverage view)
  // Positions managers hierarchically: top-level in first row, sub-managers below their parent
  const managerPositions = useMemo(() => {
    if (viewMode !== 'skillGaps') return new Map<string, { x: number; y: number }>()
    
    const positions = new Map<string, { x: number; y: number }>()
    const { topLevel, hierarchy } = managerHierarchy
    if (topLevel.length === 0) return positions
    
    // Filter top-level managers to only include visible ones
    const visibleTopLevel = topLevel.filter(name => visibleManagers.has(name))
    if (visibleTopLevel.length === 0) return positions
    
    const managerBoxHeight = 35 // Half the height of regular items (70 / 2)
    const managerGap = 5
    const managerWidth = 160
    const padding = 16
    const availableW = Math.max(320, (dims.w / zoom) - padding * 2)
    const verticalGap = 20 // Gap between parent and child managers
    
    // Position manager boxes with minimal spacing (2px gap above and below)
    const topGap = 2
    const firstBoxTop = topGap
    
    // Recursive function to position managers hierarchically
    function positionManager(managerName: string, startX: number, startY: number, level: number = 0): { x: number; y: number; width: number; height: number } {
      // Only position visible managers
      if (!visibleManagers.has(managerName)) {
        return { x: startX, y: startY, width: 0, height: 0 }
      }
      
      const children = hierarchy.get(managerName) || []
      // Filter children to only include visible ones
      const visibleChildren = children.filter(child => visibleManagers.has(child))
      
      // Position this manager
      const x = startX + managerWidth / 2
      const y = startY + managerBoxHeight / 2
      positions.set(managerName, { x, y })
      
      // If no visible children, return the width needed for just this manager
      if (visibleChildren.length === 0) {
        return { x: startX, y: startY, width: managerWidth, height: managerBoxHeight }
      }
      
      // Position visible children below this manager
      let currentX = startX
      let maxChildY = startY + managerBoxHeight + verticalGap
      let totalWidth = 0
      let maxChildHeight = 0
      
      visibleChildren.forEach((childName, idx) => {
        const childResult = positionManager(childName, currentX, startY + managerBoxHeight + verticalGap, level + 1)
        currentX += childResult.width + managerGap
        maxChildY = Math.max(maxChildY, childResult.y + childResult.height / 2)
        maxChildHeight = Math.max(maxChildHeight, childResult.height)
        totalWidth += childResult.width + (idx > 0 ? managerGap : 0)
      })
      
      // Center the parent above its children if children take more width
      const childrenWidth = totalWidth
      if (childrenWidth > managerWidth) {
        const newX = startX + (childrenWidth - managerWidth) / 2
        positions.set(managerName, { x: newX + managerWidth / 2, y })
      }
      
      const totalHeight = managerBoxHeight + verticalGap + maxChildHeight
      return { x: startX, y: startY, width: Math.max(managerWidth, childrenWidth), height: totalHeight }
    }
    
    // Position visible top-level managers in a row, with their hierarchies below
    // First pass: position all managers (left-aligned for now)
    const managerWidths = new Map<string, number>()
    let currentX = padding
    let currentY = firstBoxTop
    let maxY = currentY
    const rowBreaks: number[] = [0] // Track where each row starts
    
    visibleTopLevel.forEach((managerName, idx) => {
      const result = positionManager(managerName, currentX, currentY, 0)
      managerWidths.set(managerName, result.width)
      currentX += result.width + managerGap
      maxY = Math.max(maxY, result.y + result.height / 2 + managerBoxHeight / 2)
      
      // If we've exceeded available width, start a new row
      if (currentX + managerWidth > availableW - padding) {
        rowBreaks.push(idx + 1)
        currentX = padding
        currentY = maxY + managerBoxHeight + verticalGap
        maxY = currentY
      }
    })
    rowBreaks.push(visibleTopLevel.length) // Mark end of last row
    
    // Second pass: center each row
    const adjustChildrenPositions = (name: string, offsetX: number) => {
      const children = hierarchy.get(name) || []
      children.forEach(child => {
        if (visibleManagers.has(child)) {
          const childPos = positions.get(child)
          if (childPos) {
            positions.set(child, { x: childPos.x + offsetX, y: childPos.y })
            adjustChildrenPositions(child, offsetX)
          }
        }
      })
    }
    
    for (let rowIdx = 0; rowIdx < rowBreaks.length - 1; rowIdx++) {
      const rowStart = rowBreaks[rowIdx]
      const rowEnd = rowBreaks[rowIdx + 1]
      
      if (rowStart >= rowEnd) continue
      
      // Calculate total width of this row
      let rowWidth = 0
      for (let i = rowStart; i < rowEnd; i++) {
        const width = managerWidths.get(visibleTopLevel[i]) || managerWidth
        rowWidth += width + (i > rowStart ? managerGap : 0)
      }
      
      // Calculate offset to center this row
      const rowStartX = (availableW - rowWidth) / 2
      const offset = rowStartX - padding
      
      // Adjust all managers and their children in this row
      for (let i = rowStart; i < rowEnd; i++) {
        const managerName = visibleTopLevel[i]
        const pos = positions.get(managerName)
        if (pos) {
          positions.set(managerName, { x: pos.x + offset, y: pos.y })
          adjustChildrenPositions(managerName, offset)
        }
      }
    }
    
    return positions
  }, [viewMode, managerHierarchy, dims.w, zoom, visibleManagers])

  const layout = useMemo(() => {
    const layoutResult = computeLayout(filteredItems, dims.w, dims.h, visibleLenses, layoutMode, showParentBoxes, zoom, viewMode)
    // Adjust layout to account for manager row if in Architecture Coverage view
    if (viewMode === 'skillGaps' && managerPositions.size > 0) {
      // Calculate the maximum Y position of all managers to determine total height needed
      const managerBoxHeight = 35 // Half the height of regular items
      const topGap = 2
      const bottomGap = 2
      let maxManagerY = 0
      managerPositions.forEach((pos) => {
        maxManagerY = Math.max(maxManagerY, pos.y + managerBoxHeight / 2)
      })
      // Calculate total height: top gap + max manager bottom + bottom gap
      const additionalHeight = topGap + maxManagerY + bottomGap
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
  }, [filteredItems, dims, visibleLenses, layoutMode, showParentBoxes, zoom, viewMode, managerPositions])

  // Determine if selected item is on left or right side of diagram
  const detailsBoxPosition = useMemo(() => {
    if (!selectedItemId || !layout.positions.has(selectedItemId)) {
      return 'right' // Default to right
    }
    const itemPos = layout.positions.get(selectedItemId)
    if (!itemPos) return 'right'
    
    // Get the total width of the layout
    const layoutWidth = layout.width
    // If item is on the right half, show box on left; if on left half, show box on right
    return itemPos.x > layoutWidth / 2 ? 'left' : 'right'
  }, [selectedItemId, layout])

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
    // Use theme colors for Summary and Minimal views, hardcoded colors for other views
    if (viewMode === 'summary' || viewMode === 'minimal') {
      if (status === 'Divest') {
        return { fill: theme.colors.error + '1a', stroke: theme.colors.error }
      }
      if (status === 'Invest') {
        return { fill: theme.colors.success + '1a', stroke: theme.colors.success }
      }
      if (status === 'Plan') {
        return { fill: theme.colors.info + '1a', stroke: theme.colors.info }
      }
      if (status === 'Emerging') {
        return { fill: theme.colors.warning + '1a', stroke: theme.colors.warning }
      }
      if (!status) {
        return { fill: theme.colors.primary + '1a', stroke: theme.colors.primary }
      }
      // Stable and any other statuses - use theme primary color
      return { fill: theme.colors.primary + '1a', stroke: theme.colors.primary }
    }
    
    // For other views (Tasks, Tags, Architecture coverage), use hardcoded colors
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

  // Export as SVG
  function handleExportSVG() {
    if (!svgRef.current) return
    
    // Clone the SVG to avoid modifying the original
    const svgClone = svgRef.current.cloneNode(true) as SVGSVGElement
    
    // Remove transform style and apply it to the SVG dimensions instead
    const currentTransform = svgRef.current.style.transform
    const scaleMatch = currentTransform.match(/scale\(([^)]+)\)/)
    const scale = scaleMatch ? parseFloat(scaleMatch[1]) : 1
    
    // Calculate actual bounding box of all elements
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    
    // Check all nodes
    layout.nodes.forEach(node => {
      const nodeHalfWidth = layout.nodeWidth / 2
      const nodeHalfHeight = layout.nodeHeight / 2
      minX = Math.min(minX, node.x - nodeHalfWidth)
      minY = Math.min(minY, node.y - nodeHalfHeight)
      maxX = Math.max(maxX, node.x + nodeHalfWidth)
      maxY = Math.max(maxY, node.y + nodeHalfHeight)
    })
    
    // Check all headers
    layout.headers.forEach(header => {
      minX = Math.min(minX, header.x)
      minY = Math.min(minY, header.y)
      maxX = Math.max(maxX, header.x + header.width)
      maxY = Math.max(maxY, header.y + header.height)
    })
    
    // Check all parent groups
    layout.parentGroups.forEach(group => {
      minX = Math.min(minX, group.x)
      minY = Math.min(minY, group.y)
      maxX = Math.max(maxX, group.x + group.width)
      maxY = Math.max(maxY, group.y + group.height)
    })
    
    // Check relationship lines (they can extend beyond nodes)
    // Use all relationships between visible items for bounding box calculation
    if (showRelationshipLines && rels) {
      const visibleItemIds = new Set(layout.nodes.map(n => n.id).filter((id): id is number => id !== undefined))
      rels.forEach(rel => {
        // Only include relationships where both items are visible
        if (visibleItemIds.has(rel.fromItemId) && visibleItemIds.has(rel.toItemId)) {
          const fromPos = layout.positions.get(rel.fromItemId)
          const toPos = layout.positions.get(rel.toItemId)
          if (fromPos && toPos) {
            // Relationship lines use curves, so check both endpoints and midpoint
            // For cubic bezier curves, the control points can extend beyond the endpoints
            const midX = (fromPos.x + toPos.x) / 2
            const midY = (fromPos.y + toPos.y) / 2
            // Add extra margin for curve control points (curves can extend ~20% beyond midpoint)
            const curveMargin = 20
            minX = Math.min(minX, fromPos.x, toPos.x, midX - curveMargin)
            minY = Math.min(minY, fromPos.y, toPos.y, midY - curveMargin)
            maxX = Math.max(maxX, fromPos.x, toPos.x, midX + curveMargin)
            maxY = Math.max(maxY, fromPos.y, toPos.y, midY + curveMargin)
          }
        }
      })
    }
    
    // Check manager positions if they exist (for Architecture Coverage view)
    if (viewMode === 'skillGaps') {
      managerPositions.forEach((pos) => {
        const managerBoxWidth = 120
        const managerBoxHeight = 35
        minX = Math.min(minX, pos.x - managerBoxWidth / 2)
        minY = Math.min(minY, pos.y - managerBoxHeight / 2)
        maxX = Math.max(maxX, pos.x + managerBoxWidth / 2)
        maxY = Math.max(maxY, pos.y + managerBoxHeight / 2)
      })
    }
    
    // Add padding
    const padding = 20
    minX = Math.min(minX, 0) - padding
    minY = Math.min(minY, 0) - padding
    maxX = maxX + padding
    maxY = maxY + padding
    
    // Calculate actual dimensions from content
    const contentWidth = maxX - minX
    const contentHeight = maxY - minY
    
    // Ensure we use at least the layout dimensions (they should already account for most content)
    // If layout is larger, expand our bounding box to match
    if (layout.width > contentWidth) {
      const extraWidth = layout.width - contentWidth
      maxX = maxX + extraWidth
    }
    if (layout.height > contentHeight) {
      const extraHeight = layout.height - contentHeight
      maxY = maxY + extraHeight
    }
    
    // Final dimensions
    const finalWidth = maxX - minX
    const finalHeight = maxY - minY
    
    // Set explicit dimensions accounting for zoom
    svgClone.setAttribute('width', String(finalWidth * scale))
    svgClone.setAttribute('height', String(finalHeight * scale))
    svgClone.setAttribute('viewBox', `${minX} ${minY} ${finalWidth} ${finalHeight}`)
    svgClone.style.transform = ''
    svgClone.style.transformOrigin = ''
    
    // Add font-family to all text elements to match web display
    const fontFamily = 'system-ui, -apple-system, sans-serif'
    const textElements = svgClone.querySelectorAll('text')
    textElements.forEach(textEl => {
      const currentStyle = textEl.getAttribute('style') || ''
      // Check if font-family is already set
      if (!currentStyle.includes('font-family')) {
        textEl.setAttribute('style', `${currentStyle ? currentStyle + '; ' : ''}font-family: ${fontFamily}`)
      }
    })
    
    // Serialize to string
    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(svgClone)
    
    // Create blob and download
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `architecture-diagram-${new Date().toISOString().split('T')[0]}.svg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Export as interactive HTML
  async function handleExportHTML() {
    // Collect all data needed for the interactive diagram
    const exportData = {
      items: filteredItems,
      relationships: rels.filter(r => {
        const bothVisible = visibleItemIds.has(r.fromItemId) && visibleItemIds.has(r.toItemId)
        return bothVisible
      }),
      teamMembers,
      lenses: visibleLenses,
      tasks,
      viewMode,
      theme,
      layoutMode,
      zoom,
      showParentBoxes,
      visible,
      layout: {
        width: layout.width * zoom,
        height: layout.height * zoom,
        nodeWidth: layout.nodeWidth,
        nodeHeight: layout.nodeHeight,
        headers: layout.headers,
        parentGroups: layout.parentGroups,
        nodes: layout.nodes,
        positions: Array.from(layout.positions.entries()).map(([id, pos]) => ({ id, ...pos }))
      },
      managerHierarchy: viewMode === 'skillGaps' ? {
        topLevel: managerHierarchy.topLevel,
        hierarchy: Array.from(managerHierarchy.hierarchy.entries()),
        parentMap: Array.from(managerHierarchy.parentMap.entries())
      } : null,
      managerPositions: viewMode === 'skillGaps' 
        ? Array.from(managerPositions.entries())
        : [],
      managerColors: viewMode === 'skillGaps'
        ? Array.from(managerColors.entries())
        : [],
      visibleManagers: viewMode === 'skillGaps'
        ? Array.from(visibleManagers)
        : []
    }

    // Create a standalone HTML file with embedded React (via CDN) and all the data
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Architecture Relationship Diagram</title>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
    .fill-slate-700 { fill: #475569; }
    .fill-slate-800 { fill: #1e293b; }
    .fill-slate-200 { fill: #e2e8f0; }
    .fill-blue-600 { fill: #2563eb; }
    .text-blue-600 { color: #2563eb; }
    .text-slate-600 { color: #475569; }
    .text-slate-400 { color: #94a3b8; }
    .text-slate-700 { color: #334155; }
    .text-slate-300 { color: #cbd5e1; }
    .hover\\:fill-blue-600:hover { fill: #2563eb; }
    .hover\\:text-blue-600:hover { color: #2563eb; }
    .hover\\:underline:hover { text-decoration: underline; }
    .hover\\:bg-slate-100:hover { background-color: #f1f5f9; }
    .hover\\:bg-slate-700:hover { background-color: #334155; }
    .dark .fill-slate-300 { fill: #cbd5e1; }
    .dark .fill-slate-200 { fill: #e2e8f0; }
    .dark .text-blue-400 { color: #60a5fa; }
    .dark .text-slate-400 { color: #94a3b8; }
    .dark .hover\\:fill-blue-400:hover { fill: #60a5fa; }
    .dark .hover\\:text-blue-400:hover { color: #60a5fa; }
    .dark .hover\\:bg-slate-800:hover { background-color: #1e293b; }
    .dark .hover\\:bg-slate-700:hover { background-color: #334155; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const { useState, useEffect, useMemo, useRef } = React;
    
    const exportData = ${JSON.stringify(exportData, null, 2)};
    
    // Helper functions
    function getAllReports(managerName, teamMembers) {
      const reports = new Set([managerName]);
      function addReports(name) {
        teamMembers.forEach(member => {
          if (member.manager === name && !reports.has(member.name)) {
            reports.add(member.name);
            addReports(member.name);
          }
        });
      }
      addReports(managerName);
      return reports;
    }
    
    function getItemManagerCoverage(item, teamMembers) {
      if (!item.primaryArchitect && item.secondaryArchitects.length === 0) {
        return { manager: null, strength: 'none' };
      }
      
      const allManagers = new Set();
      teamMembers.forEach(member => {
        const isManager = teamMembers.some(m => m.manager === member.name);
        if (isManager) allManagers.add(member.name);
      });
      
      for (const managerName of allManagers) {
        const allReports = getAllReports(managerName, teamMembers);
        const reportNames = Array.from(allReports);
        
        const isPrimary = item.primaryArchitect && reportNames.includes(item.primaryArchitect.trim());
        const isSecondary = item.secondaryArchitects.some(arch => reportNames.includes(arch.trim()));
        
        if (isPrimary) {
          return { manager: managerName, strength: 'primary' };
        }
        if (isSecondary) {
          return { manager: managerName, strength: 'secondary' };
        }
      }
      
      return { manager: null, strength: 'none' };
    }
    
    function wrapText(text, maxWidth, fontSize = 10) {
      if (!text) return [];
      const words = text.split(' ');
      const lines = [];
      let currentLine = '';
      words.forEach(word => {
        const testLine = currentLine ? \`\${currentLine} \${word}\` : word;
        const width = testLine.length * fontSize * 0.6;
        if (width > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      });
      if (currentLine) lines.push(currentLine);
      return lines.length > 0 ? lines : [text];
    }
    
    function getTagColor(tag) {
      let hash = 0;
      for (let i = 0; i < tag.length; i++) {
        hash = tag.charCodeAt(i) + ((hash << 5) - hash);
      }
      const hue = Math.abs(hash) % 360;
      return \`hsl(\${hue}, 70%, 85%)\`;
    }
    
    function getTagBorderColor(tag) {
      let hash = 0;
      for (let i = 0; i < tag.length; i++) {
        hash = tag.charCodeAt(i) + ((hash << 5) - hash);
      }
      const hue = Math.abs(hash) % 360;
      return \`hsl(\${hue}, 70%, 50%)\`;
    }
    
    function getLifecycleColor(status) {
      // Use theme colors for Summary and Minimal views, hardcoded colors for other views
      if (exportData.viewMode === 'summary' || exportData.viewMode === 'minimal') {
        const theme = exportData.theme;
        if (status === 'Divest') {
          return { fill: theme.colors.error + '1a', stroke: theme.colors.error };
        }
        if (status === 'Invest') {
          return { fill: theme.colors.success + '1a', stroke: theme.colors.success };
        }
        if (status === 'Plan') {
          return { fill: theme.colors.info + '1a', stroke: theme.colors.info };
        }
        if (status === 'Emerging') {
          return { fill: theme.colors.warning + '1a', stroke: theme.colors.warning };
        }
        if (!status) {
          return { fill: theme.colors.primary + '1a', stroke: theme.colors.primary };
        }
        // Stable and any other statuses - use theme primary color
        return { fill: theme.colors.primary + '1a', stroke: theme.colors.primary };
      }
      
      // For other views (Tasks, Tags, Architecture coverage), use hardcoded colors
      switch (status) {
        case 'Plan': return { fill: '#f3f4f6', stroke: '#9ca3af' };
        case 'Emerging': return { fill: '#fef3c7', stroke: '#f59e0b' };
        case 'Invest': return { fill: '#d1fae5', stroke: '#10b981' };
        case 'Divest': return { fill: '#fee2e2', stroke: '#ef4444' };
        case 'Stable': return { fill: '#f0f9ff', stroke: '#38bdf8' };
        default: return { fill: '#f0f9ff', stroke: '#38bdf8' };
      }
    }
    
    function InteractiveDiagram() {
      const [selectedItemId, setSelectedItemId] = useState(null);
      const [hoveredItemId, setHoveredItemId] = useState(null);
      const [selectedManager, setSelectedManager] = useState(null);
      const [hoveredManager, setHoveredManager] = useState(null);
      const [filterToRelated, setFilterToRelated] = useState(false);
      const [showRelationshipLines, setShowRelationshipLines] = useState(true);
      
      const { items, relationships, teamMembers, layout, viewMode, managerHierarchy, managerPositions, managerColors, visibleManagers, tasks, showParentBoxes } = exportData;
      
      const positionsMap = useMemo(() => {
        const map = new Map();
        layout.positions.forEach(p => map.set(p.id, { x: p.x, y: p.y }));
        return map;
      }, []);
      
      const managerPositionsMap = useMemo(() => {
        const map = new Map();
        managerPositions.forEach(([name, pos]) => map.set(name, pos));
        return map;
      }, []);
      
      const managerColorsMap = useMemo(() => {
        const map = new Map();
        managerColors.forEach(([name, colors]) => map.set(name, colors));
        return map;
      }, []);
      
      const visibleManagersSet = useMemo(() => new Set(visibleManagers), []);
      
      const visibleRels = useMemo(() => {
        const activeItemId = filterToRelated ? selectedItemId : (hoveredItemId || selectedItemId);
        if (!activeItemId) return [];
        return relationships.filter(r => 
          r.fromItemId === activeItemId || r.toItemId === activeItemId
        );
      }, [relationships, selectedItemId, hoveredItemId, filterToRelated]);
      
      const relatedItemIds = useMemo(() => {
        const activeItemId = filterToRelated ? selectedItemId : (hoveredItemId || selectedItemId);
        if (!activeItemId) return new Set();
        const relatedIds = new Set([activeItemId]);
        visibleRels.forEach(rel => {
          if (rel.fromItemId === activeItemId) relatedIds.add(rel.toItemId);
          else if (rel.toItemId === activeItemId) relatedIds.add(rel.fromItemId);
        });
        return relatedIds;
      }, [visibleRels, selectedItemId, hoveredItemId, filterToRelated]);
      
      function posFor(id) {
        return positionsMap.get(id) || { x: 0, y: 0 };
      }
      
      function getItemColor(item) {
        const isSelected = selectedItemId === item.id;
        const isHovered = hoveredItemId === item.id;
        const isRelated = relatedItemIds.has(item.id);
        const isActive = isSelected || isHovered || isRelated;
        
        if (viewMode === 'tasks') {
          const openTasks = (tasks || []).filter(t => !t.completedAt && t.itemReferences && t.itemReferences.includes(item.id));
          const count = openTasks.length;
          if (count === 0) return { fill: isActive ? "#bbf7d0" : "#dcfce7", stroke: isActive ? "#16a34a" : "#22c55e" };
          if (count === 1) return { fill: isActive ? "#fed7aa" : "#ffedd5", stroke: isActive ? "#ea580c" : "#f97316" };
          return { fill: isActive ? "#fecaca" : "#fee2e2", stroke: isActive ? "#dc2626" : "#ef4444" };
        } else if (viewMode === 'tags') {
          if (item.tags && item.tags.length > 0) {
            return { fill: getTagColor(item.tags[0]), stroke: getTagBorderColor(item.tags[0]) };
          }
          return { fill: isActive ? "#e5e7eb" : "#f3f4f6", stroke: isActive ? "#9ca3af" : "#d1d5db" };
        } else if (viewMode === 'summary' || viewMode === 'minimal') {
          const colors = getLifecycleColor(item.lifecycleStatus);
          return colors;
        } else {
          const hasSkillsGap = !!(item.skillsGaps && item.skillsGaps.trim());
          const hasPrimaryArchitect = !!(item.primaryArchitect && item.primaryArchitect.trim());
          const hasSecondaryArchitects = item.secondaryArchitects && item.secondaryArchitects.length > 0;
          const isRed = hasSkillsGap || (!hasPrimaryArchitect && !hasSecondaryArchitects);
          
          if (isRed) {
            return { fill: isActive ? "#fecaca" : "#fee2e2", stroke: isActive ? "#dc2626" : "#ef4444" };
          } else if (!hasSkillsGap && hasSecondaryArchitects && !hasPrimaryArchitect) {
            return { fill: isActive ? "#fed7aa" : "#ffedd5", stroke: isActive ? "#ea580c" : "#f97316" };
          }
          return { fill: isActive ? "#bfdbfe" : "#e0f2fe", stroke: isActive ? "#3b82f6" : "#0ea5e9" };
        }
      }
      
      return (
        <div style={{ width: '100vw', height: '100vh', overflow: 'auto', backgroundColor: '#f8fafc' }}>
          <div style={{ padding: '16px', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'white', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', marginRight: '4px' }}>View: {viewMode}</span>
              {filterToRelated && selectedItemId && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                  <input 
                    type="checkbox" 
                    checked={showRelationshipLines} 
                    onChange={e => setShowRelationshipLines(e.target.checked)} 
                  />
                  Show relationship lines
                </label>
              )}
            </div>
          </div>
          <div style={{ padding: '48px 16px', display: 'flex', justifyContent: 'center' }}>
            <svg 
              width={layout.width} 
              height={layout.height}
              style={{ display: 'block' }}
            >
              {layout.headers.map(header => (
                <g key={header.key}>
                  <rect x={header.x} y={header.y} width={header.width} height={header.height} fill="transparent" stroke="#e2e8f0" />
                  <text x={header.x + header.width / 2} y={header.y + 24} textAnchor="middle" fill="#475569" style={{ fontSize: 14, fontWeight: 600 }}>{header.label}</text>
                  <line x1={header.x} y1={header.y + 32} x2={header.x + header.width} y2={header.y + 32} stroke="white" />
                </g>
              ))}
              
              {showParentBoxes && layout.parentGroups && layout.parentGroups.map((group, idx) => (
                <g key={\`parent-\${group.lens}-\${group.parent}-\${idx}\`}>
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
                    fill="#475569" 
                    style={{ fontSize: 12, fontWeight: 600 }}
                  >
                    {group.parent}
                  </text>
                </g>
              ))}
              
              {showRelationshipLines && visibleRels.map((r, i) => {
                const a = posFor(r.fromItemId);
                const b = posFor(r.toItemId);
                const midX = (a.x + b.x) / 2;
                return (
                  <path 
                    key={i} 
                    d={\`M \${a.x} \${a.y} C \${midX} \${a.y}, \${midX} \${b.y}, \${b.x} \${b.y}\`} 
                    fill="none" 
                    stroke="#3b82f6" 
                    strokeWidth={2} 
                  />
                );
              })}
              
              {layout.nodes.map(n => {
                const colors = getItemColor(n);
                const isSelected = selectedItemId === n.id;
                const isHovered = hoveredItemId === n.id;
                const isRelated = relatedItemIds.has(n.id);
                const isActive = isSelected || isHovered || isRelated;
                const strokeWidth = isHovered || isSelected ? 2 : (isRelated ? 2 : 1);
                
                const maxTextWidth = layout.nodeWidth - 8;
                const nameLines = wrapText(n.name, maxTextWidth, 12);
                
                return (
                  <g 
                    key={n.id} 
                    onClick={() => setSelectedItemId(isSelected ? null : n.id)} 
                    onMouseEnter={() => setHoveredItemId(n.id)}
                    onMouseLeave={() => setHoveredItemId(null)}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect 
                      x={n.x - layout.nodeWidth / 2} 
                      y={n.y - layout.nodeHeight / 2} 
                      width={layout.nodeWidth} 
                      height={layout.nodeHeight} 
                      rx={6} 
                      ry={6} 
                      fill={colors.fill} 
                      stroke={colors.stroke} 
                      strokeWidth={strokeWidth} 
                    />
                    {nameLines.map((line, idx) => (
                      <text 
                        key={\`name-\${idx}\`} 
                        x={n.x} 
                        y={n.y - 22 + idx * 11} 
                        textAnchor="middle" 
                        fill="#1e293b" 
                        style={{ fontSize: 12, cursor: 'pointer' }}
                      >
                        {line}
                      </text>
                    ))}
                    {(isSelected || isHovered) && (
                      <foreignObject
                        x={n.x + layout.nodeWidth / 2 - 20}
                        y={n.y - layout.nodeHeight / 2 + 2}
                        width={18}
                        height={18}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const newFilterState = !filterToRelated;
                            if (newFilterState === false) {
                              setSelectedItemId(null);
                            } else {
                              setSelectedItemId(n.id);
                            }
                            setFilterToRelated(newFilterState);
                          }}
                          style={{ 
                            width: '100%', 
                            height: '100%', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            borderRadius: '4px', 
                            border: '1px solid #94a3b8', 
                            backgroundColor: 'white',
                            cursor: 'pointer',
                            padding: 0
                          }}
                          title={filterToRelated ? "Show all items" : "Show only related items"}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: filterToRelated ? "#2563eb" : "#475569" }}>
                            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                          </svg>
                        </button>
                      </foreignObject>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      );
    }
    
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<InteractiveDiagram />);
  </script>
</body>
</html>`

    // Create blob and download
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `architecture-diagram-interactive-${new Date().toISOString().split('T')[0]}.html`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
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
                  onChange={e => setViewMode(e.target.value as 'skillGaps' | 'tags' | 'summary' | 'tasks' | 'minimal')}
                  className="px-2 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="skillGaps">Architecture coverage</option>
                  <option value="tags">Tags</option>
                  <option value="summary">Summary</option>
                  <option value="tasks">Tasks</option>
                  <option value="minimal">Minimal</option>
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
              {(filterToRelated && selectedItemId) || (filterToManager && selectedManagerForFilter) ? (
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={showRelationshipLines} onChange={e => setShowRelationshipLines(e.target.checked)} />
                  Show relationship lines
                </label>
              ) : null}
              <div className="flex items-center gap-1 border-l border-slate-300 dark:border-slate-700 pl-2">
                <button onClick={() => setZoom(z => Math.max(0.25, z - 0.1))} className="px-1.5 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">−</button>
                <span className="text-xs min-w-[3rem] text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="px-1.5 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">+</button>
                <button onClick={() => setZoom(1)} className="px-1.5 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">Reset</button>
              </div>
              <div className="flex items-center gap-1 border-l border-slate-300 dark:border-slate-700 pl-2">
                <button onClick={handleExportSVG} className="px-1.5 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800" title="Export as SVG">Export SVG</button>
                <button onClick={handleExportHTML} className="px-1.5 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800" title="Export as interactive HTML">Export HTML</button>
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
          ref={svgRef}
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
        
        {/* Manager relationship lines (parent to child) - always visible, render before boxes so lines appear behind */}
        {viewMode === 'skillGaps' && Array.from(managerHierarchy.hierarchy.entries())
          .filter(([parentName]) => visibleManagers.has(parentName))
          .map(([parentName, children]) => {
            const parentPos = managerPositions.get(parentName)
            if (!parentPos) return null
            
            return children
              .filter(childName => visibleManagers.has(childName))
              .map(childName => {
                const childPos = managerPositions.get(childName)
                if (!childPos) return null
            
            const parentColor = managerColors.get(parentName)
            const lineColor = parentColor?.stroke || "#9ca3af"
            const managerBoxHeight = 35 // Half the height of regular items
            
            const startY = parentPos.y + managerBoxHeight / 2
            const endY = childPos.y - managerBoxHeight / 2
            const midX = (parentPos.x + childPos.x) / 2
            
            return (
              <path
                key={`manager-rel-${parentName}-${childName}`}
                d={`M ${parentPos.x} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${childPos.x} ${endY}`}
                fill="none"
                stroke={lineColor}
                strokeWidth={2.5}
                opacity={0.8}
              />
            )
          }).filter(Boolean)
        })}
        
        {/* Relationship lines from managers to items (only in Architecture Coverage view, when manager is hovered/selected OR when item is hovered/selected) - render before manager boxes so lines appear behind */}
        {viewMode === 'skillGaps' && (() => {
          // Check if we should show manager-to-item lines based on filter state and toggle
          const shouldShowManagerLines = (filterToManager && selectedManagerForFilter) 
            ? showRelationshipLines 
            : true // Always show when just hovering (not filtered)
          
          if (!shouldShowManagerLines) return [] as React.ReactElement[]
          
          const lines: React.ReactElement[] = []
          const managerBoxHeight = 35 // Half the height of regular items
          const itemNodeHeight = layout.nodeHeight
          
          // Architecture coverage view (by SME): lines connect managers to items covered by their team
          // Case 1: Manager is hovered/selected - show all lines from that manager to all items it covers
          if (selectedManager || hoveredManager) {
            const managerName = selectedManager || hoveredManager
            const managerPos = managerPositions.get(managerName!)
            if (managerPos) {
              const allReports = getAllReports(managerName!, teamMembers)
              const reportNames = Array.from(allReports)
              const managerColor = managerColors.get(managerName!)
              const lineColor = managerColor?.stroke || "#9ca3af"
              
              layout.nodes.forEach(item => {
                // Check if this item is covered by this manager's team
                const isPrimary = item.primaryArchitect && reportNames.includes(item.primaryArchitect.trim())
                const isSecondary = item.secondaryArchitects.some(arch => reportNames.includes(arch.trim()))
                
                if (!isPrimary && !isSecondary) return
                
                const strokeWidth = isPrimary ? 2 : 1
                const startY = managerPos.y + managerBoxHeight / 2
                const endY = item.y - itemNodeHeight / 2
                const midX = (managerPos.x + item.x) / 2
                
                lines.push(
                  <path
                    key={`manager-line-${managerName}-${item.id}`}
                    d={`M ${managerPos.x} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${item.x} ${endY}`}
                    fill="none"
                    stroke={lineColor}
                    strokeWidth={strokeWidth}
                  />
                )
              })
            }
          }
          
          // Case 2: Item is hovered/selected - show only the line from that specific item to its manager
          if ((hoveredItemId || selectedItemId) && !selectedManager && !hoveredManager) {
            const activeItemId = selectedItemId || hoveredItemId
            const activeItem = layout.nodes.find(n => n.id === activeItemId)
            if (activeItem) {
              const itemManagerCoverage = getItemManagerCoverage(activeItem, teamMembers)
              if (itemManagerCoverage.manager) {
                const managerPos = managerPositions.get(itemManagerCoverage.manager)
                if (managerPos) {
                  const managerColor = managerColors.get(itemManagerCoverage.manager)
                  const lineColor = managerColor?.stroke || "#9ca3af"
                  const strokeWidth = itemManagerCoverage.strength === 'primary' ? 2 : 1
                  const startY = managerPos.y + managerBoxHeight / 2
                  const endY = activeItem.y - itemNodeHeight / 2
                  const midX = (managerPos.x + activeItem.x) / 2
                  
                  lines.push(
                    <path
                      key={`manager-line-${itemManagerCoverage.manager}-${activeItem.id}`}
                      d={`M ${managerPos.x} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${activeItem.x} ${endY}`}
                      fill="none"
                      stroke={lineColor}
                      strokeWidth={strokeWidth}
                    />
                  )
                }
              }
            }
          }
          
          return lines
        })()}
        
        {/* Manager boxes (only in Architecture Coverage view) */}
        {viewMode === 'skillGaps' && Array.from(managerPositions.entries()).map(([managerName, pos]) => {
          const managerColor = managerColors.get(managerName)
          const fillColor = managerColor?.fill || "#e5e7eb"
          const strokeColor = managerColor?.stroke || "#9ca3af"
          const nodeWidth = layout.nodeWidth
          const managerBoxHeight = 35 // Half the height of regular items
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
                y={pos.y - managerBoxHeight / 2}
                width={nodeWidth}
                height={managerBoxHeight}
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
                  y={pos.y - managerBoxHeight / 2 + 2}
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
        
        {/* Relationship lines - render BEFORE nodes so they appear behind in SVG z-order */}
        {((filterToRelated && selectedItemId) ? showRelationshipLines : true) && visibleRels.map((r, i) => {
          const a = posFor(r.fromItemId)
          const b = posFor(r.toItemId)
          const nodeHalfHeight = layout.nodeHeight / 2
          const nodeHalfWidth = layout.nodeWidth / 2
          
          // Determine connection points based on vertical position
          // If destination is below source: start at bottom of source, end at top of destination
          // If destination is above source: start at top of source, end at bottom of destination
          // If same level: use left/right edges
          let startX = a.x
          let startY = a.y
          let endX = b.x
          let endY = b.y
          
          const verticalDiff = b.y - a.y
          
          if (Math.abs(verticalDiff) > 10) {
            // Significant vertical difference - use top/bottom edges
            if (verticalDiff > 0) {
              // Destination is below source
              startY = a.y + nodeHalfHeight
              endY = b.y - nodeHalfHeight
            } else {
              // Destination is above source
              startY = a.y - nodeHalfHeight
              endY = b.y + nodeHalfHeight
            }
          } else {
            // Same level - use left/right edges
            if (b.x > a.x) {
              // Destination is to the right
              startX = a.x + nodeHalfWidth
              endX = b.x - nodeHalfWidth
            } else {
              // Destination is to the left
              startX = a.x - nodeHalfWidth
              endX = b.x + nodeHalfWidth
            }
          }
          
          const midX = (startX + endX) / 2
          const midY = (startY + endY) / 2
          const key = r.id ? `rel-${r.id}` : `rel-${r.fromItemId}-${r.toItemId}-${i}`
          const typeLabel = r.relationshipType && r.relationshipType !== 'Default' ? r.relationshipType : null
          const noteLabel = r.note && r.note.trim() ? r.note.trim() : null
          const label = [typeLabel, noteLabel].filter(Boolean).join(' • ')
          return (
            <g key={key} style={{ pointerEvents: 'none' }}>
              <path d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`} fill="none" stroke="#3b82f6" strokeWidth={2} />
              {label && (
                <text
                  x={midX}
                  y={midY - 6}
                  textAnchor="middle"
                  className="fill-slate-700 dark:fill-slate-200"
                  style={{ fontSize: 10, pointerEvents: 'none' }}
                >
                  {label}
                </text>
              )}
            </g>
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
          } else if (viewMode === 'summary' || viewMode === 'minimal') {
            // Summary/Minimal view: color by lifecycle status
            const lifecycleColors = getLifecycleColor(n.lifecycleStatus)
            fillColor = isActive ? lifecycleColors.fill : lifecycleColors.fill
            strokeColor = isActive ? lifecycleColors.stroke : lifecycleColors.stroke
            strokeWidth = isHovered || isSelected ? 2 : (isRelated ? 2 : 1)
          } else {
            // Architecture coverage view (by SME): color logic
            const hasSkillsGap = !!n.skillsGaps?.trim()
            const hasPrimaryArchitect = !!n.primaryArchitect?.trim()
            const hasSecondaryArchitects = n.secondaryArchitects.length > 0
            
            // Determine if item is red (skills gap or no coverage)
            const isRed = hasSkillsGap || (!hasPrimaryArchitect && !hasSecondaryArchitects)
            
            // Get the immediate manager for this item (the manager whose team covers it)
            const managerCoverage = getItemManagerCoverage(n, teamMembers)
            const immediateManagerColor = managerCoverage.manager ? managerColors.get(managerCoverage.manager) : null
            
            // Base colors (used when item is red and has manager coverage)
            let baseFillColor: string
            
            if (isRed) {
              baseFillColor = isActive ? "#fecaca" : "#fee2e2"
            } else if (!hasSkillsGap && hasSecondaryArchitects && !hasPrimaryArchitect) {
              baseFillColor = isActive ? "#fed7aa" : "#ffedd5"
            } else {
              baseFillColor = isActive ? "#bfdbfe" : "#e0f2fe"
            }
            
            // Check if a manager is selected or hovered
            const activeManager = selectedManager || hoveredManager
            
            if (activeManager) {
              // Manager is selected/hovered - check if this item is related to that manager
              const allReports = getAllReports(activeManager, teamMembers)
              const reportNames = Array.from(allReports)
              
              // Check if item is covered by the active manager's team
              const isRelatedToActive = (n.primaryArchitect && reportNames.includes(n.primaryArchitect.trim())) ||
                                       n.secondaryArchitects.some(arch => reportNames.includes(arch.trim()))
              
              if (!isRelatedToActive) {
                // Item is not related to the active manager - make grey
                fillColor = isActive ? "#e5e7eb" : "#f3f4f6"
                strokeColor = isActive ? "#9ca3af" : "#d1d5db"
                strokeWidth = isHovered || isSelected ? 2 : (isRelated ? 2 : 1)
              } else {
                // Item is related to the active manager - show its immediate manager colors
                if (immediateManagerColor && managerCoverage.strength !== 'none') {
                  if (isRed) {
                    // Keep red fill, apply immediate manager color to border
                    fillColor = baseFillColor
                    strokeColor = immediateManagerColor.stroke
                  } else {
                    // Apply immediate manager colors to both fill and stroke
                    fillColor = immediateManagerColor.fill
                    strokeColor = immediateManagerColor.stroke
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
                  // No immediate manager coverage, use base colors
                  fillColor = baseFillColor
                  strokeColor = isActive ? "#9ca3af" : "#d1d5db"
                  strokeWidth = isHovered || isSelected ? 2 : (isRelated ? 2 : 1)
                }
              }
            } else {
              // No manager selected/hovered - use default colors based on skills gaps (no manager colors)
              fillColor = baseFillColor
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
              {nameLines.map((line, idx) => {
                // Adjust vertical position for minimal view (smaller box) - center the text block
                let nameY: number
                if (viewMode === 'minimal') {
                  // Center the text block vertically in the 30px box
                  // In SVG, the y coordinate is the baseline of the text
                  // For 12px font, we need to account for the text's visual center
                  const fontSize = 12
                  const lineSpacing = 11
                  // Calculate total visual height: (lines - 1) * spacing + font size
                  const totalVisualHeight = nameLines.length === 1 
                    ? fontSize 
                    : (nameLines.length - 1) * lineSpacing + fontSize
                  // For 12px font, the baseline is typically ~10px from the top of the text
                  // Add a small offset to better center (move down slightly)
                  const baselineOffset = 10 // Approximate: baseline is ~10px from top for 12px font
                  const centerOffset = 2 // Additional offset to move text down slightly for better centering
                  const firstLineY = n.y - (totalVisualHeight / 2) + baselineOffset + centerOffset
                  nameY = firstLineY + idx * lineSpacing
                } else {
                  nameY = n.y - 22 + idx * 11
                }
                return (
                  <text 
                    key={`name-${idx}`} 
                    x={n.x} 
                    y={nameY} 
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
                )
              })}
              
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
      
      {/* Floating Item Details Box */}
      {selectedItemId && selectedItem && showDetailsBox && (
        <div className={`absolute top-2 ${detailsBoxPosition === 'left' ? 'left-2' : 'right-2'} z-20 w-96 max-h-[calc(100vh-4rem)] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg p-4`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">
              {lensLabel(selectedItem.lens)}: {selectedItem.name}
            </h3>
            <button
              onClick={() => setShowDetailsBox(false)}
              className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              title="Hide details"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div className="space-y-3 text-xs">
            {selectedItem.description && (
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300 mb-1">Description</div>
                <div className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{selectedItem.description}</div>
              </div>
            )}
            {selectedItem.lifecycleStatus && (
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300 mb-1">Lifecycle Status</div>
                <div className="text-slate-600 dark:text-slate-400">{selectedItem.lifecycleStatus}</div>
              </div>
            )}
            {selectedItem.businessContact && (
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300 mb-1">Business Contact</div>
                <div className="text-slate-600 dark:text-slate-400">{selectedItem.businessContact}</div>
              </div>
            )}
            {selectedItem.techContact && (
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300 mb-1">Tech Contact</div>
                <div className="text-slate-600 dark:text-slate-400">{selectedItem.techContact}</div>
              </div>
            )}
            {selectedItem.primaryArchitect && (
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300 mb-1">Primary SME Architect</div>
                <div className="text-slate-600 dark:text-slate-400">{selectedItem.primaryArchitect}</div>
              </div>
            )}
            {selectedItem.secondaryArchitects && selectedItem.secondaryArchitects.length > 0 && (
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300 mb-1">Secondary SME Architects</div>
                <div className="text-slate-600 dark:text-slate-400">{selectedItem.secondaryArchitects.join(', ')}</div>
              </div>
            )}
            {selectedItem.tags && selectedItem.tags.length > 0 && (
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300 mb-1">Tags</div>
                <div className="text-slate-600 dark:text-slate-400">{selectedItem.tags.join(', ')}</div>
              </div>
            )}
            {selectedItem.skillsGaps && (
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300 mb-1">Skills Gaps</div>
                <div className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{selectedItem.skillsGaps}</div>
              </div>
            )}
            {selectedItem.parent && (
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300 mb-1">Parent</div>
                <div className="text-slate-600 dark:text-slate-400">{selectedItem.parent}</div>
              </div>
            )}
            {selectedItem.hyperlinks && selectedItem.hyperlinks.length > 0 && (
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300 mb-1">Hyperlinks</div>
                <div className="space-y-1">
                  {selectedItem.hyperlinks.map((link, idx) => (
                    <div key={idx}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {link.label || link.url}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Related Tasks */}
            {relatedTasks.length > 0 && (
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300 mb-1">Related Tasks</div>
                <div className="space-y-1">
                  {relatedTasks.map((task) => (
                    <div key={task.id} className="text-slate-600 dark:text-slate-400">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleTaskComplete(task)}
                          className="flex-shrink-0 w-4 h-4 border border-slate-400 dark:border-slate-600 rounded flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"
                          title={task.completedAt ? 'Mark as incomplete' : 'Mark as complete'}
                        >
                          {task.completedAt && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-green-600 dark:text-green-400">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          )}
                        </button>
                        <span className={task.completedAt ? 'line-through text-slate-400 dark:text-slate-500' : ''}>
                          {task.description || '(No description)'}
                        </span>
                      </div>
                      {task.assignedTo && (
                        <div className="text-xs text-slate-500 dark:text-slate-500 ml-6">
                          Assigned to: {task.assignedTo}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Related Notes */}
            {relatedNotes.length > 0 && (
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300 mb-1">Related Notes</div>
                <div className="space-y-1">
                  {relatedNotes.map((note) => (
                    <div key={note.id} className="text-slate-600 dark:text-slate-400">
                      <button
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('openMeetingNote', { detail: { noteId: note.id } }))
                        }}
                        className="text-blue-600 dark:text-blue-400 hover:underline text-left"
                      >
                        {note.title || `Note from ${note.dateTime ? new Date(note.dateTime).toLocaleDateString() : 'unknown date'}`}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Related Items */}
            {relatedItemsMap.size > 0 && (
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300 mb-1">Related Items</div>
                <div className="space-y-1">
                  {Array.from(relatedItemsMap.entries()).map(([itemId, relatedItem]) => {
                    const rel = rels.find(r => 
                      (r.fromItemId === selectedItemId && r.toItemId === itemId) ||
                      (r.toItemId === selectedItemId && r.fromItemId === itemId)
                    )
                    return (
                      <div key={itemId} className="text-slate-600 dark:text-slate-400">
                        <span className="font-medium">{lensLabel(relatedItem.lens)}:</span> {relatedItem.name}
                        {rel?.relationshipType && rel.relationshipType !== 'Default' && (
                          <span className="text-xs text-slate-500 dark:text-slate-500 ml-1">
                            ({rel.relationshipType})
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            
            {!selectedItem.description && !selectedItem.lifecycleStatus && !selectedItem.businessContact && 
             !selectedItem.techContact && !selectedItem.primaryArchitect && 
             (!selectedItem.secondaryArchitects || selectedItem.secondaryArchitects.length === 0) &&
             (!selectedItem.tags || selectedItem.tags.length === 0) && !selectedItem.skillsGaps && 
             !selectedItem.parent && (!selectedItem.hyperlinks || selectedItem.hyperlinks.length === 0) &&
             relatedItemsMap.size === 0 && relatedNotes.length === 0 && relatedTasks.length === 0 && (
              <div className="text-slate-500 dark:text-slate-400 italic">No additional details</div>
            )}
          </div>
        </div>
      )}
      
      {/* Show details button when item is selected but box is hidden */}
      {selectedItemId && selectedItem && !showDetailsBox && (
        <button
          onClick={() => setShowDetailsBox(true)}
          className={`absolute top-2 ${detailsBoxPosition === 'left' ? 'left-2' : 'right-2'} z-20 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800`}
          title="Show item details"
        >
          Show Details
        </button>
      )}
      
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

function computeLayout(items: ItemRecord[], windowW: number, windowH: number, visibleLenses: typeof LENSES, mode: 'columns' | 'rows', showParentBoxes: boolean = true, zoom: number = 1, viewMode: 'skillGaps' | 'tags' | 'summary' | 'tasks' | 'minimal' = 'summary') {
  const padding = 16
  // When zoomed in (zoom > 1), calculate layout with more space to fit more items per row
  // Divide by zoom to account for the fact that we'll scale up, so we need less base space
  // When zoom is 2.0, we want 2x the items, so we calculate with 1/2 the space, then scale 2x
  const availableW = Math.max(320, (windowW / zoom) - padding * 2)
  const availableH = Math.max(240, (windowH / zoom) - padding * 2)
  const topOffset = 30
  const nodeHeight = viewMode === 'minimal' ? 30 : 70 // Smaller height for minimal view
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

    // Center-align: calculate offset to center all columns
    const totalColumnsWidth = n * colWidth + (n - 1) * colGap
    const centerOffset = (width - totalColumnsWidth) / 2

    // Adjust all positions and headers to be center-aligned
    const centeredPositions = new Map<number, { x: number; y: number }>()
    positions.forEach((pos, id) => {
      centeredPositions.set(id, { x: pos.x + centerOffset - padding, y: pos.y })
    })
    
    const centeredNodes = nodes.map(node => ({
      ...node,
      x: node.x + centerOffset - padding
    }))
    
    const centeredHeaders = headers.map(header => ({
      ...header,
      x: header.x + centerOffset - padding
    }))
    
    const centeredParentGroups = parentGroups.map(group => ({
      ...group,
      x: group.x + centerOffset - padding
    }))

    return { width, height, nodes: centeredNodes, positions: centeredPositions, headers: centeredHeaders, nodeWidth, nodeHeight, parentGroups: centeredParentGroups }
  } else {
    // Row layout: lenses as rows
    const rowHeight = nodeHeight + rowGap
    const headerHeight = 30
    const headerGap = 10 // Gap between header and items
    let currentY = 0
    
    visibleLenses.forEach((l) => {
      const rowItems = items.filter(i => i.lens === l.key)
      
      // Position header for this lens (centered)
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
        const parentGroupPadding = 2
        const parentGroupHeaderHeight = 20
        const parentGroupGap = 10 // Gap between parent boxes and standalone items
        
        // Collect parent boxes and standalone items, then position them together in rows
        interface ParentBoxInfo {
          parent: string | null
          parentItems: ItemRecord[]
          width: number
          height: number
          isStandalone: boolean // true for items without parent
        }
        
        const allBoxes: ParentBoxInfo[] = []
        
        // Add parent boxes
        const sortedParents = Array.from(itemsByParent.keys()).sort((a, b) => {
          if (a === null) return 1 // Put null (standalone) last
          if (b === null) return -1
          return a.localeCompare(b)
        })
        
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
            
            allBoxes.push({
              parent,
              parentItems,
              width: groupWidth,
              height: groupHeight,
              isStandalone: false
            })
          }
        })
        
        // Add standalone items (items without parent) as a "box"
        const itemsWithoutParent = itemsByParent.get(null) || []
        if (itemsWithoutParent.length > 0) {
          const numItemRows = Math.ceil(itemsWithoutParent.length / itemsPerRow)
          const itemsInWidestRow = Math.min(itemsPerRow, itemsWithoutParent.length)
          const itemsWidth = itemsInWidestRow * itemWidth + (itemsInWidestRow - 1) * colGap
          const standaloneWidth = itemsWidth
          const standaloneHeight = numItemRows * rowHeight
          
          allBoxes.push({
            parent: null,
            parentItems: itemsWithoutParent,
            width: standaloneWidth,
            height: standaloneHeight,
            isStandalone: true
          })
        }
        
        // Position all boxes (parent boxes and standalone items) in rows, center-aligning each row
        let maxYInRow = currentY
        const currentRowBoxes: Array<{ box: ParentBoxInfo; x: number; y: number }> = []
        
        const flushRow = () => {
          if (currentRowBoxes.length === 0) return
          
          // Calculate total width of boxes in this row
          const totalRowWidth = currentRowBoxes.reduce((sum, b) => sum + b.box.width, 0) + 
                                (currentRowBoxes.length - 1) * parentGroupGap
          
          // Center-align the row
          const rowStartX = (availableW - totalRowWidth) / 2
          
          // Position each box in the centered row
          let boxX = rowStartX
          currentRowBoxes.forEach(({ box, y }) => {
            const groupX = boxX
            const groupY = y
            
            if (!box.isStandalone) {
              // Parent box - create parent group
              parentGroups.push({
                parent: box.parent!,
                x: groupX,
                y: groupY,
                width: box.width,
                height: box.height,
                lens: l.key as LensKey
              })
              
              // Position items within parent group
              const itemsPerRowInBox = Math.max(1, Math.floor((availableW - padding * 2) / 170))
              const itemWidthInBox = 160
              box.parentItems.forEach((it, colIdx) => {
                const col = colIdx % itemsPerRowInBox
                const row = Math.floor(colIdx / itemsPerRowInBox)
                const x = groupX + parentGroupPadding + col * (itemWidthInBox + colGap) + itemWidthInBox / 2
                const y = groupY + parentGroupHeaderHeight + parentGroupPadding + row * rowHeight + nodeHeight / 2
                if (it.id) positions.set(it.id, { x, y })
                nodes.push({ ...it, x, y })
              })
            } else {
              // Standalone items - position directly without a box
              box.parentItems.forEach((it, colIdx) => {
                const col = colIdx % itemsPerRow
                const row = Math.floor(colIdx / itemsPerRow)
                const x = groupX + col * (itemWidth + colGap) + itemWidth / 2
                const y = groupY + row * rowHeight + nodeHeight / 2
                if (it.id) positions.set(it.id, { x, y })
                nodes.push({ ...it, x, y })
              })
            }
            
            boxX += box.width + parentGroupGap
          })
          
          currentRowBoxes.length = 0
        }
        
        allBoxes.forEach((box) => {
          // Check if we need to start a new row
          const wouldFit = currentRowBoxes.length === 0 || 
            (currentRowBoxes.reduce((sum, b) => sum + b.box.width, 0) + 
             (currentRowBoxes.length - 1) * parentGroupGap + box.width <= availableW - padding * 2)
          
          if (!wouldFit) {
            flushRow()
            currentY = maxYInRow + parentGroupGap
            maxYInRow = currentY
          }
          
          currentRowBoxes.push({ box, x: 0, y: currentY })
          maxYInRow = Math.max(maxYInRow, currentY + box.height)
        })
        
        flushRow()
        
        // Update currentY to the bottom of all items
        currentY = maxYInRow
      } else {
        // Flat list - no parent grouping
        // Center-align items in each row
        const numItemRows = Math.ceil(rowItems.length / itemsPerRow)
        for (let row = 0; row < numItemRows; row++) {
          const startIdx = row * itemsPerRow
          const endIdx = Math.min(startIdx + itemsPerRow, rowItems.length)
          const itemsInRow = rowItems.slice(startIdx, endIdx)
          const rowWidth = itemsInRow.length * itemWidth + (itemsInRow.length - 1) * colGap
          const rowStartX = (availableW - rowWidth) / 2
          
          itemsInRow.forEach((it, colIdx) => {
            const x = rowStartX + colIdx * (itemWidth + colGap) + itemWidth / 2
            const y = currentY + row * rowHeight + nodeHeight / 2
            if (it.id) positions.set(it.id, { x, y })
            nodes.push({ ...it, x, y })
          })
        }
        
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
