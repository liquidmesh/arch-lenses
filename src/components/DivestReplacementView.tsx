import { useEffect, useMemo, useState, useRef } from 'react'
import { db, getAllLenses } from '../db'
import { type ItemRecord, type RelationshipRecord, type LensKey, type LifecycleStatus, type RelationshipLifecycleStatus, LENSES } from '../types'
import { ItemDialog } from './ItemDialog'

// Deduplicate a list of items by id
const dedupeItems = (items: ItemRecord[]): ItemRecord[] => {
  const map = new Map<number, ItemRecord>()
  items.forEach(item => {
    if (item.id !== undefined) {
      map.set(item.id, item)
    }
  })
  return Array.from(map.values())
}

type ViewType = 'main' | 'diagram' | 'architects' | 'stakeholders' | 'manage-team' | 'meeting-notes' | 'manage-lenses' | 'tasks' | 'divest-replacement'

interface DivestReplacementViewProps {
  onNavigate?: (view: ViewType) => void
}

export function DivestReplacementView({}: DivestReplacementViewProps) {
  const [lenses, setLenses] = useState<Array<{ key: LensKey; label: string }>>([])
  const [items, setItems] = useState<ItemRecord[]>([])
  const [relationships, setRelationships] = useState<RelationshipRecord[]>([])
  const [primaryLens, setPrimaryLens] = useState<LensKey | ''>(() => {
    const saved = localStorage.getItem('divest-replacement-primary-lens')
    return saved || ''
  })
  const [secondaryLens, setSecondaryLens] = useState<LensKey | ''>(() => {
    const saved = localStorage.getItem('divest-replacement-secondary-lens')
    return saved || ''
  })
  const [filterItemId, setFilterItemId] = useState<number | null>(() => {
    const saved = localStorage.getItem('divest-replacement-filter-item-id')
    return saved ? parseInt(saved, 10) : null
  })
  const [filterItemQuery, setFilterItemQuery] = useState('')
  const [minorTextOption, setMinorTextOption] = useState<'none' | 'lifecycle' | 'description'>(() => {
    const saved = localStorage.getItem('divest-replacement-minor-text')
    return (saved === 'none' || saved === 'lifecycle' || saved === 'description') ? saved : 'lifecycle'
  })
  const [rollupLens, setRollupLens] = useState<LensKey | '' | '__parent__'>(() => {
    const saved = localStorage.getItem('divest-replacement-rollup-lens')
    return (saved === '__parent__' || saved === '' || LENSES.some(l => l.key === saved)) ? (saved || '') : ''
  })
  const [rollupMode, setRollupMode] = useState<'only-related' | 'show-secondary'>(() => {
    const saved = localStorage.getItem('divest-replacement-rollup-mode')
    return (saved === 'only-related' || saved === 'show-secondary') ? saved : 'only-related'
  })
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<ItemRecord | null>(null)
  const [hoveredItemId, setHoveredItemId] = useState<number | null>(null)
  const [hoveredParentName, setHoveredParentName] = useState<string | null>(null)
  const [columnViewMode, setColumnViewMode] = useState<'both' | 'current' | 'target'>(() => {
    const saved = localStorage.getItem('divest-replacement-column-view-mode')
    return (saved === 'both' || saved === 'current' || saved === 'target') ? saved : 'both'
  })
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadData()
  }, [])

  // Persist primary lens to localStorage
  useEffect(() => {
    if (primaryLens) {
      localStorage.setItem('divest-replacement-primary-lens', primaryLens)
    } else {
      localStorage.removeItem('divest-replacement-primary-lens')
    }
  }, [primaryLens])

  // Persist secondary lens to localStorage
  useEffect(() => {
    if (secondaryLens) {
      localStorage.setItem('divest-replacement-secondary-lens', secondaryLens)
    } else {
      localStorage.removeItem('divest-replacement-secondary-lens')
    }
  }, [secondaryLens])

  // Persist filter item to localStorage
  useEffect(() => {
    if (filterItemId) {
      localStorage.setItem('divest-replacement-filter-item-id', filterItemId.toString())
    } else {
      localStorage.removeItem('divest-replacement-filter-item-id')
    }
  }, [filterItemId])

  // Persist minor text option to localStorage
  useEffect(() => {
    localStorage.setItem('divest-replacement-minor-text', minorTextOption)
  }, [minorTextOption])

  // Persist roll-up lens to localStorage
  useEffect(() => {
    if (rollupLens) {
      localStorage.setItem('divest-replacement-rollup-lens', rollupLens)
    } else {
      localStorage.removeItem('divest-replacement-rollup-lens')
    }
  }, [rollupLens])

  // Persist roll-up mode to localStorage
  useEffect(() => {
    localStorage.setItem('divest-replacement-rollup-mode', rollupMode)
  }, [rollupMode])

  // Persist column view mode to localStorage
  useEffect(() => {
    localStorage.setItem('divest-replacement-column-view-mode', columnViewMode)
  }, [columnViewMode])

  async function loadData() {
    const [allLenses, allItems, allRels] = await Promise.all([
      getAllLenses(),
      db.items.toArray(),
      db.relationships.toArray(),
    ])
    
    const lensList = allLenses.map(l => ({ key: l.key, label: l.label }))
    setLenses(lensList)
    setItems(allItems)
    setRelationships(allRels)
  }

  // Filter items based on filterItemId
  const filteredPrimaryItems = useMemo(() => {
    if (!primaryLens) return []
    
    let filtered = items.filter(item => item.lens === primaryLens)
    
    // If a filter item is selected, only include items related to it
    if (filterItemId) {
      const filterItem = items.find(item => item.id === filterItemId)
      if (filterItem) {
        // Find relationships where filterItem is involved
        const relatedRels = relationships.filter(rel => {
          return (
            (rel.fromItemId === filterItemId && rel.toLens === primaryLens) ||
            (rel.toItemId === filterItemId && rel.fromLens === primaryLens)
          )
        })
        
        // Get related item IDs
        const relatedItemIds = new Set<number>()
        relatedRels.forEach(rel => {
          if (rel.fromItemId === filterItemId) {
            relatedItemIds.add(rel.toItemId)
          } else {
            relatedItemIds.add(rel.fromItemId)
          }
        })
        
        // If the filter item is in the primary lens, include it in the results
        // This ensures the selected primary item is shown even if it has no relationships
        if (filterItem.lens === primaryLens) {
          relatedItemIds.add(filterItemId)
        }
        
        filtered = filtered.filter(item => relatedItemIds.has(item.id!))
      }
    }
    
    return filtered.sort((a, b) => a.name.localeCompare(b.name))
  }, [items, primaryLens, filterItemId, relationships])

  // Get items from primary lens (for display purposes, use filteredPrimaryItems)
  const primaryItems = filteredPrimaryItems

  // For each primary item, find related items from secondary lens and categorize by lifecycle
  const itemAnalysis = useMemo(() => {
    if (!primaryLens || !secondaryLens || primaryItems.length === 0) return []

    return primaryItems.map(primaryItem => {
      // Find relationships where primaryItem is involved (bidirectional)
      const relatedRels = relationships.filter(rel => {
        // Check if relationship connects primaryItem to an item in secondaryLens
        return (
          (rel.fromItemId === primaryItem.id && rel.toLens === secondaryLens) ||
          (rel.toItemId === primaryItem.id && rel.fromLens === secondaryLens)
        )
      })

      // Create a map of item ID to relationship lifecycle status
      const itemRelLifecycleMap = new Map<number, RelationshipLifecycleStatus | undefined>()
      relatedRels.forEach(rel => {
        const itemId = rel.fromItemId === primaryItem.id ? rel.toItemId : rel.fromItemId
        itemRelLifecycleMap.set(itemId, rel.lifecycleStatus)
      })

      // Get the related items from secondary lens
      const relatedItemIds = new Set<number>()
      relatedRels.forEach(rel => {
        if (rel.fromItemId === primaryItem.id) {
          relatedItemIds.add(rel.toItemId)
        } else {
          relatedItemIds.add(rel.fromItemId)
        }
      })

      let relatedItems = items.filter(item => 
        item.lens === secondaryLens && relatedItemIds.has(item.id!)
      )

      // Build roll-up maps if roll-up is enabled (used for both filtering and grouping)
      let secondaryToRollupMap: Map<number, ItemRecord[]> | null = null
      let rollupToSecondaryMap: Map<number, ItemRecord[]> | null = null
      let parentToSecondaryMap: Map<string, ItemRecord[]> | null = null // For parent-based grouping
      
      // Store original relatedItems before filtering (needed for ungrouped items calculation)
      const allRelatedItems = [...relatedItems]
      
      if (rollupLens) {
        if (rollupLens === '__parent__') {
          // Group by parent property of secondary items
          parentToSecondaryMap = new Map<string, ItemRecord[]>() // parent name -> secondary items
          
          relatedItems.forEach(secondaryItem => {
            const parent = secondaryItem.parent || '(No Parent)'
            const map = parentToSecondaryMap!
            if (!map.has(parent)) {
              map.set(parent, [])
            }
            map.get(parent)!.push(secondaryItem)
          })
          
          // Apply filtering based on rollupMode
          if (rollupMode === 'only-related') {
            // Only show secondary items that have a parent
            relatedItems = relatedItems.filter(item => item.parent)
          }
          // 'show-secondary' mode: show all secondary items (no filtering needed)
        } else {
          // For each secondary item, find related items in roll-up lens
          secondaryToRollupMap = new Map<number, ItemRecord[]>() // secondary item ID -> roll-up items
          rollupToSecondaryMap = new Map<number, ItemRecord[]>() // roll-up item ID -> secondary items
          
          relatedItems.forEach(secondaryItem => {
            // Find relationships between secondary item and roll-up lens items
            const rollupRels = relationships.filter(rel => {
              return (
                (rel.fromItemId === secondaryItem.id && rel.toLens === rollupLens) ||
                (rel.toItemId === secondaryItem.id && rel.fromLens === rollupLens)
              )
            })
            
            const rollupItemIds = new Set<number>()
            rollupRels.forEach(rel => {
              if (rel.fromItemId === secondaryItem.id) {
                rollupItemIds.add(rel.toItemId)
              } else {
                rollupItemIds.add(rel.fromItemId)
              }
            })
            
            const rollupItems = items.filter(item => 
              item.lens === rollupLens && rollupItemIds.has(item.id!)
            )
            
            if (secondaryToRollupMap) {
              secondaryToRollupMap.set(secondaryItem.id!, rollupItems)
            }
            
            // Build reverse map
            rollupItems.forEach(rollupItem => {
              if (!rollupToSecondaryMap!.has(rollupItem.id!)) {
                rollupToSecondaryMap!.set(rollupItem.id!, [])
              }
              rollupToSecondaryMap!.get(rollupItem.id!)!.push(secondaryItem)
            })
          })
          
          // Apply filtering based on rollupMode
          if (rollupMode === 'only-related') {
            // Only show secondary items that have relationships to roll-up items
            relatedItems = relatedItems.filter(item => {
              const rollupItems = secondaryToRollupMap!.get(item.id!)
              return rollupItems && rollupItems.length > 0
            })
          }
          // 'show-secondary' mode: show all secondary items (no filtering needed)
        }
      }

      // Categorize by lifecycle status, considering both item lifecycle and relationship lifecycle
      // Items with no status should appear in both Current and Target
      const itemsWithNoStatus = relatedItems.filter(item => !item.lifecycleStatus)
      
      // Current column: 
      // 1. Items with lifecycle "Invest"
      // 2. Items with lifecycle "Divest"
      // 3. Items with lifecycle "Stable"
      // 4. Items with no lifecycle status (unless relationship is "Planned to add")
      const currentItems = dedupeItems(relatedItems).filter(item => {
        const itemId = item.id!
        const relLifecycle = itemRelLifecycleMap.get(itemId)
        
        // Exclude planned-to-add from Current
        if (relLifecycle === 'Planned to add') return false

        if (item.lifecycleStatus === 'Invest') return true
        
        if (item.lifecycleStatus === 'Divest') {
          return true
        }
        
        if (item.lifecycleStatus === 'Stable') {
          return true
        }
        
        // Items with no lifecycle status: only exclude if planned-to-add
        if (!item.lifecycleStatus) {
          return relLifecycle !== 'Planned to add'
        }
        
        return false
      })

      // Target includes items unless relationship is planned-to-remove
      const targetItemsWithNoStatus = dedupeItems([
        ...relatedItems.filter(item => {
          const relLifecycle = itemRelLifecycleMap.get(item.id!)
          if (relLifecycle === 'Planned to remove') return false
          return true
        }),
        ...itemsWithNoStatus.filter(item => {
          const relLifecycle = itemRelLifecycleMap.get(item.id!)
          return relLifecycle !== 'Planned to remove'
        }),
      ])
      // Keep legacy fields for downstream rendering (currently unused but expected)
      const replacementItems = targetItemsWithNoStatus
      const otherItems: ItemRecord[] = []

      // Apply roll-up grouping if enabled
      if (rollupLens) {
        if (rollupLens === '__parent__' && parentToSecondaryMap) {
          // Group by parent property
          // For "show-secondary" mode, exclude "(No Parent)" from rollupGroups - those items will be shown directly
          const parentNames = Array.from(parentToSecondaryMap.keys())
            .filter(parentName => {
              // In "show-secondary" mode, exclude "(No Parent)" - those items will be shown directly
              if (rollupMode === 'show-secondary' && parentName === '(No Parent)') {
                return false
              }
              return true
            })
            .sort((a, b) => {
              if (a === '(No Parent)') return 1
              if (b === '(No Parent)') return -1
              return a.localeCompare(b)
            })
          
          // Group current and target items by parent
          const rollupGroups = parentNames.map(parentName => {
            const relatedSecondary = parentToSecondaryMap!.get(parentName) || []
            const groupCurrentItems = dedupeItems(currentItems.filter(item => relatedSecondary.includes(item)))
            const groupTargetItems = dedupeItems(targetItemsWithNoStatus.filter(item => relatedSecondary.includes(item)))
            
            // Create a fake rollupItem for parent grouping
            const rollupItem: ItemRecord = {
              id: undefined,
              lens: secondaryLens,
              name: parentName,
              description: undefined,
              lifecycleStatus: undefined,
              secondaryArchitects: [],
              tags: [],
              hyperlinks: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }
            
            return {
              rollupItem,
              divestItems: groupCurrentItems,
              targetItems: groupTargetItems,
            }
          })
          
          // Handle secondary items that don't have a parent
          const ungroupedSecondaryItems: ItemRecord[] = []
          if (rollupMode === 'only-related') {
            // Items without a parent
            ungroupedSecondaryItems.push(...allRelatedItems.filter(item => !item.parent))
          } else if (rollupMode === 'show-secondary') {
            // Items without a parent - show these directly instead of under "(No Parent)"
            ungroupedSecondaryItems.push(...[...currentItems, ...targetItemsWithNoStatus].filter(item => !item.parent))
          }
          const uniqueUngroupedSecondaryItems = dedupeItems(ungroupedSecondaryItems)
          
            return {
            primaryItem,
              divestItems: dedupeItems(currentItems),
              replacementItems: dedupeItems(targetItemsWithNoStatus),
              otherItems,
              targetItems: dedupeItems(targetItemsWithNoStatus),
            rollupGroups,
            ungroupedSecondaryItems: uniqueUngroupedSecondaryItems,
            hasRollup: true,
            itemRelLifecycleMap,
          }
        } else if (rollupToSecondaryMap) {
          // Get all roll-up items that have related secondary items
          const rollupItems = Array.from(rollupToSecondaryMap.keys())
            .map(id => items.find(item => item.id === id))
            .filter((item): item is ItemRecord => !!item)
            .sort((a, b) => a.name.localeCompare(b.name))
          
          // Group current and target items by roll-up items
          const rollupGroups = rollupItems.map(rollupItem => {
            const relatedSecondary = rollupToSecondaryMap!.get(rollupItem.id!) || []
            const groupCurrentItems = dedupeItems(currentItems.filter(item => relatedSecondary.includes(item)))
            const groupTargetItems = dedupeItems(targetItemsWithNoStatus.filter(item => relatedSecondary.includes(item)))
            
            return {
              rollupItem,
              divestItems: groupCurrentItems,
              targetItems: groupTargetItems,
            }
          })
          
          // Handle secondary items that don't have roll-up relationships
          const ungroupedSecondaryItems: ItemRecord[] = []
          if ((rollupMode === 'show-secondary' || rollupMode === 'only-related') && secondaryToRollupMap) {
            // For "only-related" mode, use allRelatedItems (before filtering) to find ungrouped items
            // For "show-secondary" mode, use currentItems and targetItemsWithNoStatus
            const itemsToCheck = rollupMode === 'only-related' ? allRelatedItems : [...currentItems, ...targetItemsWithNoStatus]
            
            // Collect all unique secondary items (deduplicate by id)
            const allSecondaryItemsSet = new Set<number>()
            const allSecondaryItemsMap = new Map<number, ItemRecord>()
            itemsToCheck.forEach(item => {
              if (item.id && !allSecondaryItemsSet.has(item.id)) {
                allSecondaryItemsSet.add(item.id)
                allSecondaryItemsMap.set(item.id, item)
              }
            })
            
            // Find items that don't have roll-up relationships
            allSecondaryItemsMap.forEach((item, itemId) => {
              const rollupItems = secondaryToRollupMap.get(itemId)
              if (!rollupItems || rollupItems.length === 0) {
                ungroupedSecondaryItems.push(item)
              }
            })
          }
          const uniqueUngroupedSecondaryItems = dedupeItems(ungroupedSecondaryItems)
          
            return {
            primaryItem,
              divestItems: dedupeItems(currentItems), // Keep for backward compatibility
              replacementItems: dedupeItems(replacementItems),
              otherItems,
              targetItems: dedupeItems(targetItemsWithNoStatus), // Keep for backward compatibility
            rollupGroups,
            ungroupedSecondaryItems: uniqueUngroupedSecondaryItems,
            hasRollup: true,
            itemRelLifecycleMap, // Include for categorizing ungrouped items
          }
        }
      }

      return {
        primaryItem,
        divestItems: dedupeItems(currentItems), // Current column items
        replacementItems: dedupeItems(replacementItems),
        otherItems,
        targetItems: dedupeItems(targetItemsWithNoStatus),
        hasRollup: false,
        itemRelLifecycleMap, // Include for consistency
      }
    })
  }, [primaryItems, secondaryLens, items, relationships, primaryLens, rollupLens, rollupMode])

  // Get color for inner boxes: red for Divest, grey for No Status, blue for everything else
  const getInnerBoxColor = (status?: LifecycleStatus): string => {
    if (status === 'Divest') {
      return 'bg-red-100 dark:bg-red-900 border-red-300 dark:border-red-700'
    }
    if (!status) {
      // No Status - grey
      return 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700'
    }
    // Default color for all other statuses
    return 'bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700'
  }

  // Get outline color matching the border color for highlighted items
  const getOutlineColor = (status?: LifecycleStatus): string => {
    if (status === 'Divest') {
      return 'outline-red-300 dark:outline-red-700'
    }
    if (!status) {
      return 'outline-gray-300 dark:outline-gray-700'
    }
    return 'outline-blue-300 dark:outline-blue-700'
  }

  const getLifecycleLabel = (status?: LifecycleStatus): string => {
    return status || 'No Status'
  }

  // Get related item IDs for a given item (bidirectional relationships)
  const getRelatedItemIds = (itemId: number): Set<number> => {
    const relatedIds = new Set<number>()
    relationships.forEach(rel => {
      if (rel.fromItemId === itemId) {
        relatedIds.add(rel.toItemId)
      } else if (rel.toItemId === itemId) {
        relatedIds.add(rel.fromItemId)
      }
    })
    return relatedIds
  }

  // Check if an item should be highlighted (by ID or parent name)
  const shouldHighlightItem = (item: ItemRecord): boolean => {
    // Check if item itself is hovered
    if (hoveredItemId === item.id) return true
    
    // Check if item's parent is hovered
    if (hoveredParentName !== null && item.parent === hoveredParentName) return true
    
    // Check if item is related to hovered item
    if (hoveredItemId !== null) {
      const relatedIds = getRelatedItemIds(hoveredItemId)
      if (item.id && relatedIds.has(item.id)) return true
    }
    
    return false
  }

  // Get the hovered item's lifecycle status for background color matching
  const getHoveredItemStatus = (): LifecycleStatus | undefined => {
    if (hoveredItemId !== null) {
      const hoveredItem = items.find(item => item.id === hoveredItemId)
      return hoveredItem?.lifecycleStatus
    }
    return undefined
  }

  // Get background color for highlighted items (use hovered item's color if related)
  const getHighlightedItemColor = (item: ItemRecord): string => {
    const isHighlighted = shouldHighlightItem(item)
    if (!isHighlighted) {
      return getInnerBoxColor(item.lifecycleStatus)
    }
    
    // If this is the hovered item itself, use its own color
    if (hoveredItemId === item.id) {
      return getInnerBoxColor(item.lifecycleStatus)
    }
    
    // If parent name is hovered, use gray background for related items
    if (hoveredParentName !== null && item.parent === hoveredParentName) {
      return getInnerBoxColor(undefined) // Gray for no status
    }
    
    // If this is a related item, use the hovered item's color
    const hoveredStatus = getHoveredItemStatus()
    return getInnerBoxColor(hoveredStatus)
  }

  // Get opacity class for hovered and highlighted items
  const getOpacityClass = (item: ItemRecord): string => {
    const isHighlighted = shouldHighlightItem(item)
    if (isHighlighted) {
      return 'opacity-80'
    }
    return ''
  }

  // Get opacity class for rollup items (can be item with id or parent name)
  const getRollupItemOpacityClass = (rollupItem: any): string => {
    if (rollupItem.id) {
      // It's an actual item - check if it should be highlighted
      const item = items.find(i => i.id === rollupItem.id)
      if (item) {
        return getOpacityClass(item)
      }
    } else {
      // It's a parent name - check if this parent is hovered
      if (hoveredParentName === rollupItem.name) {
        return 'opacity-80'
      }
    }
    return ''
  }

  // Export as SVG
  function handleExportSVG() {
    if (!contentRef.current || !primaryLens || !secondaryLens || itemAnalysis.length === 0) return

    // Helper function to wrap text for SVG
    function wrapText(text: string, maxWidth: number, fontSize: number = 10): string[] {
      if (!text) return []
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

    // Calculate dimensions
    const padding = 20
    const rowHeight = 60
    const headerHeight = 40
    const primaryColWidth = 200
    const currentColWidth = 400
    const targetColWidth = 400
    const colGap = 20
    const rowGap = 10
    const boxHeight = 40
    const boxWidth = 120
    const boxesPerRow = 3
    const boxGap = 4

    // Determine which columns to show based on columnViewMode
    const showCurrent = columnViewMode === 'both' || columnViewMode === 'current'
    const showTarget = columnViewMode === 'both' || columnViewMode === 'target'
    
    // Adjust column widths for single column mode (use full width)
    const effectiveCurrentColWidth = showCurrent && showTarget ? currentColWidth : (showCurrent ? currentColWidth + targetColWidth + colGap : 0)
    const effectiveTargetColWidth = showCurrent && showTarget ? targetColWidth : (showTarget ? currentColWidth + targetColWidth + colGap : 0)

    // Calculate total height (no title, so start at header)
    let calculatedHeight = padding + headerHeight
    sortedParents.forEach(parent => {
      const groupItems = groupedItemAnalysis.get(parent)!
      if (parent) {
        calculatedHeight += 20 // Parent header
      }
      groupItems.forEach((analysis: any) => {
        const { divestItems, targetItems, hasRollup, rollupGroups, ungroupedSecondaryItems } = analysis
        if (hasRollup && rollupGroups) {
          rollupGroups.forEach((group: any) => {
            const currentItems = showCurrent ? group.divestItems.length : 0
            const targetItemsCount = showTarget ? group.targetItems.length : 0
            const maxItems = Math.max(currentItems, targetItemsCount)
            const numRows = Math.ceil(maxItems / boxesPerRow)
            const rowHeightForItem = Math.max(boxHeight * numRows + boxGap * (numRows - 1), rowHeight) + 20
            calculatedHeight += rowHeightForItem + rowGap
          })
          if (ungroupedSecondaryItems && ungroupedSecondaryItems.length > 0) {
            const currentItems = showCurrent ? ungroupedSecondaryItems.filter((item: ItemRecord) => divestItems.includes(item)).length : 0
            const targetItemsCount = showTarget ? ungroupedSecondaryItems.filter((item: ItemRecord) => targetItems.includes(item)).length : 0
            const maxItems = Math.max(currentItems, targetItemsCount)
            const numRows = Math.ceil(maxItems / boxesPerRow)
            const rowHeightForItem = Math.max(boxHeight * numRows + boxGap * (numRows - 1), rowHeight) + 20
            calculatedHeight += rowHeightForItem + rowGap
          }
        } else {
          const currentItems = showCurrent ? divestItems.length : 0
          const targetItemsCount = showTarget ? targetItems.length : 0
          const maxItems = Math.max(currentItems, targetItemsCount)
          const numRows = Math.ceil(maxItems / boxesPerRow)
          const rowHeightForItem = Math.max(boxHeight * numRows + boxGap * (numRows - 1), rowHeight)
          calculatedHeight += rowHeightForItem + rowGap
        }
      })
    })

    // Calculate total width based on visible columns
    let totalWidth = padding + primaryColWidth
    if (showCurrent && showTarget) {
      totalWidth += colGap + currentColWidth + colGap + targetColWidth
    } else if (showCurrent) {
      totalWidth += colGap + effectiveCurrentColWidth
    } else if (showTarget) {
      totalWidth += colGap + effectiveTargetColWidth
    }
    totalWidth += padding
    const initialHeight = calculatedHeight + padding

    // Create SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', String(totalWidth))
    svg.setAttribute('height', String(initialHeight))
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

    // Add style element for fonts
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    style.textContent = `
      .header { font-family: system-ui, -apple-system, sans-serif; font-size: 12px; font-weight: 600; fill: #334155; }
      .primary-name { font-family: system-ui, -apple-system, sans-serif; font-size: 12px; font-weight: bold; fill: #1e293b; }
      .primary-desc { font-family: system-ui, -apple-system, sans-serif; font-size: 10px; fill: #475569; }
      .item-name { font-family: system-ui, -apple-system, sans-serif; font-size: 10px; fill: #1e293b; }
      .item-minor { font-family: system-ui, -apple-system, sans-serif; font-size: 8px; fill: #475569; }
      .parent-label { font-family: system-ui, -apple-system, sans-serif; font-size: 10px; font-weight: 500; fill: #64748b; }
    `
    svg.appendChild(style)

    // Background
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bg.setAttribute('width', String(totalWidth))
    bg.setAttribute('height', String(initialHeight))
    bg.setAttribute('fill', '#f8fafc')
    svg.appendChild(bg)

    // Column headers
    let headerY = padding + headerHeight
    const headerLine = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    headerLine.setAttribute('x1', String(padding))
    headerLine.setAttribute('y1', String(headerY))
    headerLine.setAttribute('x2', String(totalWidth - padding))
    headerLine.setAttribute('y2', String(headerY))
    headerLine.setAttribute('stroke', '#cbd5e1')
    headerLine.setAttribute('stroke-width', '2')
    svg.appendChild(headerLine)

    const primaryLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    primaryLabel.setAttribute('x', String(padding + primaryColWidth / 2))
    primaryLabel.setAttribute('y', String(headerY - 10))
    primaryLabel.setAttribute('class', 'header')
    primaryLabel.setAttribute('text-anchor', 'middle')
    primaryLabel.textContent = LENSES.find(l => l.key === primaryLens)?.label || primaryLens
    svg.appendChild(primaryLabel)

    if (showCurrent) {
      const currentLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      const currentLabelX = showCurrent && showTarget 
        ? padding + primaryColWidth + colGap + currentColWidth / 2
        : padding + primaryColWidth + colGap + effectiveCurrentColWidth / 2
      currentLabel.setAttribute('x', String(currentLabelX))
      currentLabel.setAttribute('y', String(headerY - 10))
      currentLabel.setAttribute('class', 'header')
      currentLabel.setAttribute('text-anchor', 'middle')
      currentLabel.textContent = 'Current'
      svg.appendChild(currentLabel)
    }

    if (showTarget) {
      const targetLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      const targetLabelX = showCurrent && showTarget
        ? padding + primaryColWidth + colGap + currentColWidth + colGap + targetColWidth / 2
        : padding + primaryColWidth + colGap + effectiveTargetColWidth / 2
      targetLabel.setAttribute('x', String(targetLabelX))
      targetLabel.setAttribute('y', String(headerY - 10))
      targetLabel.setAttribute('class', 'header')
      targetLabel.setAttribute('text-anchor', 'middle')
      targetLabel.textContent = 'Target'
      svg.appendChild(targetLabel)
    }

    // Draw items
    let currentY = headerY + padding + rowGap
    sortedParents.forEach(parent => {
      const groupItems = groupedItemAnalysis.get(parent)!
      
      // Parent header
      if (parent) {
        const parentText = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        parentText.setAttribute('x', String(padding))
        parentText.setAttribute('y', String(currentY))
        parentText.setAttribute('class', 'parent-label')
        parentText.textContent = parent
        svg.appendChild(parentText)
        currentY += 20
      }

      // Calculate actual group height
      let groupHeight = 0
      groupItems.forEach((analysis: any) => {
        const { divestItems, targetItems, hasRollup, rollupGroups } = analysis
        if (hasRollup && rollupGroups) {
          // For roll-up groups, calculate height for each roll-up group
          rollupGroups.forEach((group: any) => {
            const maxItems = Math.max(group.divestItems.length, group.targetItems.length)
            const numRows = Math.ceil(maxItems / boxesPerRow)
            const rowHeightForItem = Math.max(boxHeight * numRows + boxGap * (numRows - 1), rowHeight) + 20 // Add space for roll-up header
            groupHeight += rowHeightForItem + rowGap
          })
          // Add space for ungrouped items if any
          if (analysis.ungroupedSecondaryItems && analysis.ungroupedSecondaryItems.length > 0) {
            const maxItems = Math.max(
              analysis.ungroupedSecondaryItems.filter((item: ItemRecord) => divestItems.includes(item)).length,
              analysis.ungroupedSecondaryItems.filter((item: ItemRecord) => targetItems.includes(item)).length
            )
            const numRows = Math.ceil(maxItems / boxesPerRow)
            const rowHeightForItem = Math.max(boxHeight * numRows + boxGap * (numRows - 1), rowHeight) + 20
            groupHeight += rowHeightForItem + rowGap
          }
        } else {
          const maxItems = Math.max(divestItems.length, targetItems.length)
          const numRows = Math.ceil(maxItems / boxesPerRow)
          const rowHeightForItem = Math.max(boxHeight * numRows + boxGap * (numRows - 1), rowHeight)
          groupHeight += rowHeightForItem + (groupHeight > 0 ? rowGap : 0)
        }
      })

      // Group container
      const groupRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      groupRect.setAttribute('x', String(padding))
      groupRect.setAttribute('y', String(currentY))
      groupRect.setAttribute('width', String(totalWidth - padding * 2))
      groupRect.setAttribute('height', String(groupHeight))
      groupRect.setAttribute('fill', 'white')
      groupRect.setAttribute('stroke', '#cbd5e1')
      groupRect.setAttribute('stroke-width', '1')
      groupRect.setAttribute('rx', '4')
      svg.appendChild(groupRect)

      let rowOffset = 0
      groupItems.forEach((analysis: any, idx: number) => {
        const { primaryItem, divestItems, targetItems, hasRollup, rollupGroups, ungroupedSecondaryItems } = analysis
        
        // Handle roll-up groups
        if (hasRollup && rollupGroups) {
          rollupGroups.forEach((group: any, groupIdx: number) => {
            // For "only-related" mode, show roll-up items as boxes
            if (rollupMode === 'only-related') {
              const hasCurrentItems = group.divestItems.length > 0
              const hasTargetItems = group.targetItems.length > 0
              const rowHeightForItem = rowHeight
              const rowY = currentY + rowOffset
              
              // Primary item name (only for first group of first primary item)
              if (idx === 0 && groupIdx === 0) {
                const primaryName = document.createElementNS('http://www.w3.org/2000/svg', 'text')
                primaryName.setAttribute('x', String(padding + 10))
                primaryName.setAttribute('y', String(rowY + 20))
                primaryName.setAttribute('class', 'primary-name')
                primaryName.textContent = primaryItem.name
                svg.appendChild(primaryName)
              } else if (groupIdx === 0) {
                // Primary item name for new primary item
                const primaryName = document.createElementNS('http://www.w3.org/2000/svg', 'text')
                primaryName.setAttribute('x', String(padding + 10))
                primaryName.setAttribute('y', String(rowY + 20))
                primaryName.setAttribute('class', 'primary-name')
                primaryName.textContent = primaryItem.name
                svg.appendChild(primaryName)
              }
              
              // Draw roll-up item in Current column if it has current items
              const currentStartX = showCurrent ? padding + primaryColWidth + colGap : 0
              if (showCurrent && hasCurrentItems) {
                const boxX = currentStartX
                const boxY = rowY + 20

                // Box
                const box = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
                box.setAttribute('x', String(boxX))
                box.setAttribute('y', String(boxY))
                box.setAttribute('width', String(boxWidth))
                box.setAttribute('height', String(boxHeight))
                box.setAttribute('rx', '4')
                if (group.rollupItem.lifecycleStatus === 'Divest') {
                  box.setAttribute('fill', '#fee2e2')
                  box.setAttribute('stroke', '#ef4444')
                } else if (!group.rollupItem.lifecycleStatus) {
                  box.setAttribute('fill', '#f3f4f6')
                  box.setAttribute('stroke', '#9ca3af')
                } else {
                  box.setAttribute('fill', '#dbeafe')
                  box.setAttribute('stroke', '#3b82f6')
                }
                box.setAttribute('stroke-width', '1')
                svg.appendChild(box)

                // Item name (wrapped)
                const nameLines = wrapText(group.rollupItem.name, boxWidth - 8, 10)
                nameLines.forEach((line, idx) => {
                  const itemName = document.createElementNS('http://www.w3.org/2000/svg', 'text')
                  itemName.setAttribute('x', String(boxX + boxWidth / 2))
                  itemName.setAttribute('y', String(boxY + 12 + idx * 11))
                  itemName.setAttribute('class', 'item-name')
                  itemName.setAttribute('text-anchor', 'middle')
                  itemName.textContent = line
                  svg.appendChild(itemName)
                })

                // Minor text
                if (minorTextOption === 'lifecycle') {
                  const minor = document.createElementNS('http://www.w3.org/2000/svg', 'text')
                  minor.setAttribute('x', String(boxX + boxWidth / 2))
                  minor.setAttribute('y', String(boxY + 12 + nameLines.length * 11 + 4))
                  minor.setAttribute('class', 'item-minor')
                  minor.setAttribute('text-anchor', 'middle')
                  minor.textContent = getLifecycleLabel(group.rollupItem.lifecycleStatus)
                  svg.appendChild(minor)
                } else if (minorTextOption === 'description' && group.rollupItem.description) {
                  const descLines = wrapText(group.rollupItem.description, boxWidth - 8, 8)
                  descLines.forEach((line, idx) => {
                    const minor = document.createElementNS('http://www.w3.org/2000/svg', 'text')
                    minor.setAttribute('x', String(boxX + boxWidth / 2))
                    minor.setAttribute('y', String(boxY + 12 + nameLines.length * 11 + 4 + idx * 9))
                    minor.setAttribute('class', 'item-minor')
                    minor.setAttribute('text-anchor', 'middle')
                    minor.textContent = line
                    svg.appendChild(minor)
                  })
                }
              }
              
              // Draw roll-up item in Target column if it has target items
              const targetStartX = showTarget 
                ? (showCurrent 
                  ? padding + primaryColWidth + colGap + currentColWidth + colGap
                  : padding + primaryColWidth + colGap)
                : 0
              if (showTarget && hasTargetItems) {
                const boxX = targetStartX
                const boxY = rowY + 20

                // Box
                const box = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
                box.setAttribute('x', String(boxX))
                box.setAttribute('y', String(boxY))
                box.setAttribute('width', String(boxWidth))
                box.setAttribute('height', String(boxHeight))
                box.setAttribute('rx', '4')
                if (group.rollupItem.lifecycleStatus === 'Divest') {
                  box.setAttribute('fill', '#fee2e2')
                  box.setAttribute('stroke', '#ef4444')
                } else if (!group.rollupItem.lifecycleStatus) {
                  box.setAttribute('fill', '#f3f4f6')
                  box.setAttribute('stroke', '#9ca3af')
                } else {
                  box.setAttribute('fill', '#dbeafe')
                  box.setAttribute('stroke', '#3b82f6')
                }
                box.setAttribute('stroke-width', '1')
                svg.appendChild(box)

                // Item name (wrapped)
                const nameLines = wrapText(group.rollupItem.name, boxWidth - 8, 10)
                nameLines.forEach((line, idx) => {
                  const itemName = document.createElementNS('http://www.w3.org/2000/svg', 'text')
                  itemName.setAttribute('x', String(boxX + boxWidth / 2))
                  itemName.setAttribute('y', String(boxY + 12 + idx * 11))
                  itemName.setAttribute('class', 'item-name')
                  itemName.setAttribute('text-anchor', 'middle')
                  itemName.textContent = line
                  svg.appendChild(itemName)
                })

                // Minor text
                if (minorTextOption === 'lifecycle') {
                  const minor = document.createElementNS('http://www.w3.org/2000/svg', 'text')
                  minor.setAttribute('x', String(boxX + boxWidth / 2))
                  minor.setAttribute('y', String(boxY + 12 + nameLines.length * 11 + 4))
                  minor.setAttribute('class', 'item-minor')
                  minor.setAttribute('text-anchor', 'middle')
                  minor.textContent = getLifecycleLabel(group.rollupItem.lifecycleStatus)
                  svg.appendChild(minor)
                } else if (minorTextOption === 'description' && group.rollupItem.description) {
                  const descLines = wrapText(group.rollupItem.description, boxWidth - 8, 8)
                  descLines.forEach((line, idx) => {
                    const minor = document.createElementNS('http://www.w3.org/2000/svg', 'text')
                    minor.setAttribute('x', String(boxX + boxWidth / 2))
                    minor.setAttribute('y', String(boxY + 12 + nameLines.length * 11 + 4 + idx * 9))
                    minor.setAttribute('class', 'item-minor')
                    minor.setAttribute('text-anchor', 'middle')
                    minor.textContent = line
                    svg.appendChild(minor)
                  })
                }
              }
              
              rowOffset += rowHeightForItem + rowGap
              return // Skip the normal rendering for "only-related" mode
            }
            
            // For other modes, show secondary items as before
            const maxItems = Math.max(group.divestItems.length, group.targetItems.length)
            const numRows = Math.ceil(maxItems / boxesPerRow)
            const rowHeightForItem = Math.max(boxHeight * numRows + boxGap * (numRows - 1), rowHeight) + 20
            const rowY = currentY + rowOffset
            
            // Roll-up header (only for first group of first primary item)
            if (idx === 0 && groupIdx === 0) {
              const rollupHeader = document.createElementNS('http://www.w3.org/2000/svg', 'text')
              rollupHeader.setAttribute('x', String(padding + 10))
              rollupHeader.setAttribute('y', String(rowY - 5))
              rollupHeader.setAttribute('class', 'parent-label')
              const rollupLabel = rollupLens === '__parent__' ? 'Parent' : (LENSES.find(l => l.key === rollupLens)?.label || rollupLens)
              rollupHeader.textContent = `${rollupLabel}: ${group.rollupItem.name}`
              svg.appendChild(rollupHeader)
            } else if (groupIdx === 0) {
              // Primary item name for new primary item
              const primaryName = document.createElementNS('http://www.w3.org/2000/svg', 'text')
              primaryName.setAttribute('x', String(padding + 10))
              primaryName.setAttribute('y', String(rowY - 5))
              primaryName.setAttribute('class', 'primary-name')
              primaryName.textContent = primaryItem.name
              svg.appendChild(primaryName)
              
              // Roll-up header
              const rollupHeader = document.createElementNS('http://www.w3.org/2000/svg', 'text')
              rollupHeader.setAttribute('x', String(padding + 10))
              rollupHeader.setAttribute('y', String(rowY + 10))
              rollupHeader.setAttribute('class', 'parent-label')
              const rollupLabel = rollupLens === '__parent__' ? 'Parent' : (LENSES.find(l => l.key === rollupLens)?.label || rollupLens)
              rollupHeader.textContent = `${rollupLabel}: ${group.rollupItem.name}`
              svg.appendChild(rollupHeader)
            } else {
              // Roll-up header for subsequent groups
              const rollupHeader = document.createElementNS('http://www.w3.org/2000/svg', 'text')
              rollupHeader.setAttribute('x', String(padding + 10))
              rollupHeader.setAttribute('y', String(rowY - 5))
              rollupHeader.setAttribute('class', 'parent-label')
              const rollupLabel = rollupLens === '__parent__' ? 'Parent' : (LENSES.find(l => l.key === rollupLens)?.label || rollupLens)
              rollupHeader.textContent = `${rollupLabel}: ${group.rollupItem.name}`
              svg.appendChild(rollupHeader)
            }
            
            // Draw items for this roll-up group
            if (showCurrent) {
              const currentStartX = padding + primaryColWidth + colGap
              group.divestItems.forEach((item: ItemRecord, itemIdx: number) => {
              const col = itemIdx % boxesPerRow
              const row = Math.floor(itemIdx / boxesPerRow)
              const boxX = currentStartX + col * (boxWidth + boxGap)
              const boxY = rowY + 20 + row * (boxHeight + boxGap)

              // Box
              const box = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
              box.setAttribute('x', String(boxX))
              box.setAttribute('y', String(boxY))
              box.setAttribute('width', String(boxWidth))
              box.setAttribute('height', String(boxHeight))
              box.setAttribute('rx', '4')
              if (item.lifecycleStatus === 'Divest') {
                box.setAttribute('fill', '#fee2e2')
                box.setAttribute('stroke', '#ef4444')
              } else if (!item.lifecycleStatus) {
                box.setAttribute('fill', '#f3f4f6')
                box.setAttribute('stroke', '#9ca3af')
              } else {
                box.setAttribute('fill', '#dbeafe')
                box.setAttribute('stroke', '#3b82f6')
              }
              box.setAttribute('stroke-width', '1')
              svg.appendChild(box)

              // Item name (wrapped)
              const nameLines = wrapText(item.name, boxWidth - 8, 10)
              nameLines.forEach((line, idx) => {
                const itemName = document.createElementNS('http://www.w3.org/2000/svg', 'text')
                itemName.setAttribute('x', String(boxX + boxWidth / 2))
                itemName.setAttribute('y', String(boxY + 12 + idx * 11))
                itemName.setAttribute('class', 'item-name')
                itemName.setAttribute('text-anchor', 'middle')
                itemName.textContent = line
                svg.appendChild(itemName)
              })

              // Minor text
              if (minorTextOption === 'lifecycle') {
                const minor = document.createElementNS('http://www.w3.org/2000/svg', 'text')
                minor.setAttribute('x', String(boxX + boxWidth / 2))
                minor.setAttribute('y', String(boxY + 12 + nameLines.length * 11 + 4))
                minor.setAttribute('class', 'item-minor')
                minor.setAttribute('text-anchor', 'middle')
                minor.textContent = getLifecycleLabel(item.lifecycleStatus)
                svg.appendChild(minor)
              } else if (minorTextOption === 'description' && item.description) {
                const descLines = wrapText(item.description, boxWidth - 8, 8)
                descLines.forEach((line, idx) => {
                  const minor = document.createElementNS('http://www.w3.org/2000/svg', 'text')
                  minor.setAttribute('x', String(boxX + boxWidth / 2))
                  minor.setAttribute('y', String(boxY + 12 + nameLines.length * 11 + 4 + idx * 9))
                  minor.setAttribute('class', 'item-minor')
                  minor.setAttribute('text-anchor', 'middle')
                  minor.textContent = line
                  svg.appendChild(minor)
                })
              }
            })
            }
            
            // Target column items
            if (showTarget) {
              const targetStartX = showCurrent 
                ? padding + primaryColWidth + colGap + currentColWidth + colGap
                : padding + primaryColWidth + colGap
              group.targetItems.forEach((item: ItemRecord, itemIdx: number) => {
              const col = itemIdx % boxesPerRow
              const row = Math.floor(itemIdx / boxesPerRow)
              const boxX = targetStartX + col * (boxWidth + boxGap)
              const boxY = rowY + 20 + row * (boxHeight + boxGap)

              // Box
              const box = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
              box.setAttribute('x', String(boxX))
              box.setAttribute('y', String(boxY))
              box.setAttribute('width', String(boxWidth))
              box.setAttribute('height', String(boxHeight))
              box.setAttribute('rx', '4')
              if (item.lifecycleStatus === 'Divest') {
                box.setAttribute('fill', '#fee2e2')
                box.setAttribute('stroke', '#ef4444')
              } else if (!item.lifecycleStatus) {
                box.setAttribute('fill', '#f3f4f6')
                box.setAttribute('stroke', '#9ca3af')
              } else {
                box.setAttribute('fill', '#dbeafe')
                box.setAttribute('stroke', '#3b82f6')
              }
              box.setAttribute('stroke-width', '1')
              svg.appendChild(box)

              // Item name (wrapped)
              const nameLines = wrapText(item.name, boxWidth - 8, 10)
              nameLines.forEach((line, idx) => {
                const itemName = document.createElementNS('http://www.w3.org/2000/svg', 'text')
                itemName.setAttribute('x', String(boxX + boxWidth / 2))
                itemName.setAttribute('y', String(boxY + 12 + idx * 11))
                itemName.setAttribute('class', 'item-name')
                itemName.setAttribute('text-anchor', 'middle')
                itemName.textContent = line
                svg.appendChild(itemName)
              })

              // Minor text
              if (minorTextOption === 'lifecycle') {
                const minor = document.createElementNS('http://www.w3.org/2000/svg', 'text')
                minor.setAttribute('x', String(boxX + boxWidth / 2))
                minor.setAttribute('y', String(boxY + 12 + nameLines.length * 11 + 4))
                minor.setAttribute('class', 'item-minor')
                minor.setAttribute('text-anchor', 'middle')
                minor.textContent = getLifecycleLabel(item.lifecycleStatus)
                svg.appendChild(minor)
              } else if (minorTextOption === 'description' && item.description) {
                const descLines = wrapText(item.description, boxWidth - 8, 8)
                descLines.forEach((line, idx) => {
                  const minor = document.createElementNS('http://www.w3.org/2000/svg', 'text')
                  minor.setAttribute('x', String(boxX + boxWidth / 2))
                  minor.setAttribute('y', String(boxY + 12 + nameLines.length * 11 + 4 + idx * 9))
                  minor.setAttribute('class', 'item-minor')
                  minor.setAttribute('text-anchor', 'middle')
                  minor.textContent = line
                  svg.appendChild(minor)
                })
              }
            })
            }
            
            rowOffset += rowHeightForItem + rowGap
          })
          
          // Handle ungrouped items
          if (ungroupedSecondaryItems && ungroupedSecondaryItems.length > 0) {
            const maxItems = Math.max(
              ungroupedSecondaryItems.filter((item: ItemRecord) => divestItems.includes(item)).length,
              ungroupedSecondaryItems.filter((item: ItemRecord) => targetItems.includes(item)).length
            )
            const numRows = Math.ceil(maxItems / boxesPerRow)
            const rowHeightForItem = Math.max(boxHeight * numRows + boxGap * (numRows - 1), rowHeight) + 20
            const rowY = currentY + rowOffset
            
            // Ungrouped header
            const ungroupedHeader = document.createElementNS('http://www.w3.org/2000/svg', 'text')
            ungroupedHeader.setAttribute('x', String(padding + 10))
            ungroupedHeader.setAttribute('y', String(rowY - 5))
            ungroupedHeader.setAttribute('class', 'parent-label')
            ungroupedHeader.textContent = `${LENSES.find(l => l.key === secondaryLens)?.label || secondaryLens} (Not related)`
            svg.appendChild(ungroupedHeader)
            
            // Draw ungrouped items (similar to above but filtered)
            const ungroupedCurrent = ungroupedSecondaryItems.filter((item: ItemRecord) => divestItems.includes(item))
            const ungroupedTarget = ungroupedSecondaryItems.filter((item: ItemRecord) => targetItems.includes(item))
            
            if (showCurrent) {
              const currentStartX = padding + primaryColWidth + colGap
              ungroupedCurrent.forEach((item: ItemRecord, itemIdx: number) => {
              const col = itemIdx % boxesPerRow
              const row = Math.floor(itemIdx / boxesPerRow)
              const boxX = currentStartX + col * (boxWidth + boxGap)
              const boxY = rowY + 20 + row * (boxHeight + boxGap)

              const box = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
              box.setAttribute('x', String(boxX))
              box.setAttribute('y', String(boxY))
              box.setAttribute('width', String(boxWidth))
              box.setAttribute('height', String(boxHeight))
              box.setAttribute('rx', '4')
              if (item.lifecycleStatus === 'Divest') {
                box.setAttribute('fill', '#fee2e2')
                box.setAttribute('stroke', '#ef4444')
              } else if (!item.lifecycleStatus) {
                box.setAttribute('fill', '#f3f4f6')
                box.setAttribute('stroke', '#9ca3af')
              } else {
                box.setAttribute('fill', '#dbeafe')
                box.setAttribute('stroke', '#3b82f6')
              }
              box.setAttribute('stroke-width', '1')
              svg.appendChild(box)

              // Item name (wrapped)
              const nameLines = wrapText(item.name, boxWidth - 8, 10)
              nameLines.forEach((line, idx) => {
                const itemName = document.createElementNS('http://www.w3.org/2000/svg', 'text')
                itemName.setAttribute('x', String(boxX + boxWidth / 2))
                itemName.setAttribute('y', String(boxY + 12 + idx * 11))
                itemName.setAttribute('class', 'item-name')
                itemName.setAttribute('text-anchor', 'middle')
                itemName.textContent = line
                svg.appendChild(itemName)
              })
            })
            }
            
            if (showTarget) {
              const targetStartX = showCurrent 
                ? padding + primaryColWidth + colGap + currentColWidth + colGap
                : padding + primaryColWidth + colGap
              ungroupedTarget.forEach((item: ItemRecord, itemIdx: number) => {
              const col = itemIdx % boxesPerRow
              const row = Math.floor(itemIdx / boxesPerRow)
              const boxX = targetStartX + col * (boxWidth + boxGap)
              const boxY = rowY + 20 + row * (boxHeight + boxGap)

              const box = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
              box.setAttribute('x', String(boxX))
              box.setAttribute('y', String(boxY))
              box.setAttribute('width', String(boxWidth))
              box.setAttribute('height', String(boxHeight))
              box.setAttribute('rx', '4')
              if (item.lifecycleStatus === 'Divest') {
                box.setAttribute('fill', '#fee2e2')
                box.setAttribute('stroke', '#ef4444')
              } else if (!item.lifecycleStatus) {
                box.setAttribute('fill', '#f3f4f6')
                box.setAttribute('stroke', '#9ca3af')
              } else {
                box.setAttribute('fill', '#dbeafe')
                box.setAttribute('stroke', '#3b82f6')
              }
              box.setAttribute('stroke-width', '1')
              svg.appendChild(box)

              // Item name (wrapped)
              const nameLines = wrapText(item.name, boxWidth - 8, 10)
              nameLines.forEach((line, idx) => {
                const itemName = document.createElementNS('http://www.w3.org/2000/svg', 'text')
                itemName.setAttribute('x', String(boxX + boxWidth / 2))
                itemName.setAttribute('y', String(boxY + 12 + idx * 11))
                itemName.setAttribute('class', 'item-name')
                itemName.setAttribute('text-anchor', 'middle')
                itemName.textContent = line
                svg.appendChild(itemName)
              })
            })
            }
            
            rowOffset += rowHeightForItem + rowGap
          }
          
          return // Skip the normal rendering for roll-up items
        }
        
        // Normal rendering (no roll-up)
        const maxItems = Math.max(divestItems.length, targetItems.length)
        const numRows = Math.ceil(maxItems / boxesPerRow)
        const rowHeightForItem = Math.max(boxHeight * numRows + boxGap * (numRows - 1), rowHeight)
        const rowY = currentY + rowOffset
        
        // Row separator
        if (idx > 0) {
          const separator = document.createElementNS('http://www.w3.org/2000/svg', 'line')
          separator.setAttribute('x1', String(padding))
          separator.setAttribute('y1', String(rowY))
          separator.setAttribute('x2', String(totalWidth - padding))
          separator.setAttribute('y2', String(rowY))
          separator.setAttribute('stroke', '#e2e8f0')
          separator.setAttribute('stroke-width', '1')
          svg.appendChild(separator)
        }

        // Primary item name
        const primaryName = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        primaryName.setAttribute('x', String(padding + 10))
        primaryName.setAttribute('y', String(rowY + 20))
        primaryName.setAttribute('class', 'primary-name')
        primaryName.textContent = primaryItem.name
        svg.appendChild(primaryName)

        // Primary item description (if shown, wrapped)
        if (minorTextOption !== 'none' && primaryItem.description) {
          const descLines = wrapText(primaryItem.description, primaryColWidth - 20, 10)
          descLines.forEach((line, idx) => {
            const primaryDesc = document.createElementNS('http://www.w3.org/2000/svg', 'text')
            primaryDesc.setAttribute('x', String(padding + 10))
            primaryDesc.setAttribute('y', String(rowY + 35 + idx * 12))
            primaryDesc.setAttribute('class', 'primary-desc')
            primaryDesc.textContent = line
            svg.appendChild(primaryDesc)
          })
        }

        // Current column items
        if (showCurrent) {
          const currentStartX = padding + primaryColWidth + colGap
          divestItems.forEach((item: ItemRecord, itemIdx: number) => {
          const col = itemIdx % boxesPerRow
          const row = Math.floor(itemIdx / boxesPerRow)
          const boxX = currentStartX + col * (boxWidth + boxGap)
          const boxY = rowY + row * (boxHeight + boxGap)

          // Box
          const box = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
          box.setAttribute('x', String(boxX))
          box.setAttribute('y', String(boxY))
          box.setAttribute('width', String(boxWidth))
          box.setAttribute('height', String(boxHeight))
          box.setAttribute('rx', '4')
          if (item.lifecycleStatus === 'Divest') {
            box.setAttribute('fill', '#fee2e2')
            box.setAttribute('stroke', '#ef4444')
          } else if (!item.lifecycleStatus) {
            box.setAttribute('fill', '#f3f4f6')
            box.setAttribute('stroke', '#9ca3af')
          } else {
            box.setAttribute('fill', '#dbeafe')
            box.setAttribute('stroke', '#3b82f6')
          }
          box.setAttribute('stroke-width', '1')
          svg.appendChild(box)

          // Item name
          // Item name (wrapped)
          const nameLines = wrapText(item.name, boxWidth - 8, 10)
          nameLines.forEach((line, idx) => {
            const itemName = document.createElementNS('http://www.w3.org/2000/svg', 'text')
            itemName.setAttribute('x', String(boxX + boxWidth / 2))
            itemName.setAttribute('y', String(boxY + 12 + idx * 11))
            itemName.setAttribute('class', 'item-name')
            itemName.setAttribute('text-anchor', 'middle')
            itemName.textContent = line
            svg.appendChild(itemName)
          })

          // Minor text
          if (minorTextOption === 'lifecycle') {
            const minor = document.createElementNS('http://www.w3.org/2000/svg', 'text')
            minor.setAttribute('x', String(boxX + boxWidth / 2))
            minor.setAttribute('y', String(boxY + 12 + nameLines.length * 11 + 4))
            minor.setAttribute('class', 'item-minor')
            minor.setAttribute('text-anchor', 'middle')
            minor.textContent = getLifecycleLabel(item.lifecycleStatus)
            svg.appendChild(minor)
          } else if (minorTextOption === 'description' && item.description) {
            const descLines = wrapText(item.description, boxWidth - 8, 8)
            descLines.forEach((line, idx) => {
              const minor = document.createElementNS('http://www.w3.org/2000/svg', 'text')
              minor.setAttribute('x', String(boxX + boxWidth / 2))
              minor.setAttribute('y', String(boxY + 12 + nameLines.length * 11 + 4 + idx * 9))
              minor.setAttribute('class', 'item-minor')
              minor.setAttribute('text-anchor', 'middle')
              minor.textContent = line
              svg.appendChild(minor)
            })
          }
        })
        }

        // Target column items
        if (showTarget) {
          const targetStartX = showCurrent 
            ? padding + primaryColWidth + colGap + currentColWidth + colGap
            : padding + primaryColWidth + colGap
          targetItems.forEach((item: ItemRecord, itemIdx: number) => {
          const col = itemIdx % boxesPerRow
          const row = Math.floor(itemIdx / boxesPerRow)
          const boxX = targetStartX + col * (boxWidth + boxGap)
          const boxY = rowY + row * (boxHeight + boxGap)

          // Box
          const box = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
          box.setAttribute('x', String(boxX))
          box.setAttribute('y', String(boxY))
          box.setAttribute('width', String(boxWidth))
          box.setAttribute('height', String(boxHeight))
          box.setAttribute('rx', '4')
          if (item.lifecycleStatus === 'Divest') {
            box.setAttribute('fill', '#fee2e2')
            box.setAttribute('stroke', '#ef4444')
          } else if (!item.lifecycleStatus) {
            box.setAttribute('fill', '#f3f4f6')
            box.setAttribute('stroke', '#9ca3af')
          } else {
            box.setAttribute('fill', '#dbeafe')
            box.setAttribute('stroke', '#3b82f6')
          }
          box.setAttribute('stroke-width', '1')
          svg.appendChild(box)

          // Item name
          // Item name (wrapped)
          const nameLines = wrapText(item.name, boxWidth - 8, 10)
          nameLines.forEach((line, idx) => {
            const itemName = document.createElementNS('http://www.w3.org/2000/svg', 'text')
            itemName.setAttribute('x', String(boxX + boxWidth / 2))
            itemName.setAttribute('y', String(boxY + 12 + idx * 11))
            itemName.setAttribute('class', 'item-name')
            itemName.setAttribute('text-anchor', 'middle')
            itemName.textContent = line
            svg.appendChild(itemName)
          })

          // Minor text
          if (minorTextOption === 'lifecycle') {
            const minor = document.createElementNS('http://www.w3.org/2000/svg', 'text')
            minor.setAttribute('x', String(boxX + boxWidth / 2))
            minor.setAttribute('y', String(boxY + 12 + nameLines.length * 11 + 4))
            minor.setAttribute('class', 'item-minor')
            minor.setAttribute('text-anchor', 'middle')
            minor.textContent = getLifecycleLabel(item.lifecycleStatus)
            svg.appendChild(minor)
          } else if (minorTextOption === 'description' && item.description) {
            const descLines = wrapText(item.description, boxWidth - 8, 8)
            descLines.forEach((line, idx) => {
              const minor = document.createElementNS('http://www.w3.org/2000/svg', 'text')
              minor.setAttribute('x', String(boxX + boxWidth / 2))
              minor.setAttribute('y', String(boxY + 12 + nameLines.length * 11 + 4 + idx * 9))
              minor.setAttribute('class', 'item-minor')
              minor.setAttribute('text-anchor', 'middle')
              minor.textContent = line
              svg.appendChild(minor)
            })
          }
        })
        }
        
        rowOffset += rowHeightForItem + (idx < groupItems.length - 1 ? rowGap : 0)
      })

      currentY += groupHeight + rowGap
    })
    
    // Update SVG height to match actual content
    const finalHeight = currentY + padding
    svg.setAttribute('height', String(finalHeight))
    bg.setAttribute('height', String(finalHeight))

    // Serialize to string
    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(svg)

    // Create blob and download
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `target-view-${new Date().toISOString().split('T')[0]}.svg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Filter items for autocomplete
  const filterItemOptions = useMemo(() => {
    if (!filterItemQuery.trim()) return []
    const query = filterItemQuery.toLowerCase()
    return items
      .filter(item => item.name.toLowerCase().includes(query))
      .slice(0, 20) // Limit to 20 results
      .map(item => ({
        id: item.id!,
        name: item.name,
        lens: item.lens,
        lensLabel: LENSES.find(l => l.key === item.lens)?.label || item.lens,
      }))
  }, [items, filterItemQuery])

  const selectedFilterItem = filterItemId ? items.find(item => item.id === filterItemId) : null

  // Group itemAnalysis by primary item parent
  const groupedItemAnalysis = useMemo(() => {
    if (!itemAnalysis.length) return new Map<string | null, typeof itemAnalysis>()
    
    const grouped = new Map<string | null, typeof itemAnalysis>()
    itemAnalysis.forEach(analysis => {
      const parent = analysis.primaryItem.parent || null
      if (!grouped.has(parent)) {
        grouped.set(parent, [])
      }
      grouped.get(parent)!.push(analysis)
    })
    
    // Sort items within each group by name
    grouped.forEach((groupItems) => {
      groupItems.sort((a, b) => a.primaryItem.name.localeCompare(b.primaryItem.name))
    })
    
    return grouped
  }, [itemAnalysis])

  // Sort parent groups (null first, then alphabetically)
  const sortedParents = useMemo(() => {
    return Array.from(groupedItemAnalysis.keys()).sort((a, b) => {
      if (a === null) return -1
      if (b === null) return 1
      return a.localeCompare(b)
    })
  }, [groupedItemAnalysis])

  // Check if any items have a lifecycleStatus
  const hasAnyLifecycleStatus = useMemo(() => {
    if (!itemAnalysis.length) return false
    return itemAnalysis.some(analysis => {
      const allItems = [
        ...(analysis.divestItems || []),
        ...(analysis.targetItems || []),
        ...(analysis.rollupGroups?.flatMap((g: any) => [
          ...(g.divestItems || []), 
          ...(g.targetItems || []),
          ...(g.rollupItem ? [g.rollupItem] : [])
        ]) || []),
        ...(analysis.ungroupedSecondaryItems || [])
      ]
      return allItems.some(item => item && item.lifecycleStatus)
    })
  }, [itemAnalysis])

  // Get grid columns class based on view mode
  const getGridColsClass = (): string => {
    if (hasAnyLifecycleStatus && columnViewMode !== 'both') {
      // Single column mode - use more columns to fill the width
      return 'grid-cols-5'
    }
    // Two column mode or no lifecycle status - use 3 columns
    return 'grid-cols-3'
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-900">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-4 p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <h1 className="text-xl font-semibold">Target View</h1>
        <div className="flex items-center gap-4 ml-auto">
          {primaryLens && secondaryLens && itemAnalysis.length > 0 && (
            <button
              onClick={handleExportSVG}
              className="px-2 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Export as SVG"
            >
              Export SVG
            </button>
          )}
          <label className="flex items-center gap-2">
            <span className="text-xs">Primary Lens:</span>
            <select
              value={primaryLens}
              onChange={e => setPrimaryLens(e.target.value as LensKey)}
              className="px-2 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="">Select lens...</option>
              {lenses.map(lens => (
                <option key={lens.key} value={lens.key}>{lens.label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-xs">Secondary Lens:</span>
            <select
              value={secondaryLens}
              onChange={e => setSecondaryLens(e.target.value as LensKey)}
              className="px-2 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="">Select lens...</option>
              {lenses.filter(l => l.key !== primaryLens).map(lens => (
                <option key={lens.key} value={lens.key}>{lens.label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-xs">Roll-up Lens:</span>
            <select
              value={rollupLens}
              onChange={e => setRollupLens(e.target.value as LensKey | '__parent__')}
              className="px-2 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="">No roll-up</option>
              <option value="__parent__">By Parent</option>
              {lenses.filter(l => l.key !== primaryLens && l.key !== secondaryLens).map(lens => (
                <option key={lens.key} value={lens.key}>{lens.label}</option>
              ))}
            </select>
          </label>
          {rollupLens && (
            <label className="flex items-center gap-2">
              <span className="text-xs">Roll-up Mode:</span>
              <select
                value={rollupMode}
                onChange={e => setRollupMode(e.target.value as 'only-related' | 'show-secondary')}
                className="px-2 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              >
                <option value="only-related">Only show roll-ups</option>
                <option value="show-secondary">Show secondary when not related</option>
              </select>
            </label>
          )}
          {primaryLens && secondaryLens && hasAnyLifecycleStatus && (
            <label className="flex items-center gap-2">
              <span className="text-xs">Show:</span>
              <select
                value={columnViewMode}
                onChange={e => setColumnViewMode(e.target.value as 'both' | 'current' | 'target')}
                className="px-2 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              >
                <option value="both">Current and Target</option>
                <option value="current">Current</option>
                <option value="target">Target</option>
              </select>
            </label>
          )}
          <label className="flex items-center gap-2">
            <span className="text-xs">Filter by Item:</span>
            <div className="relative">
              <input
                type="text"
                value={selectedFilterItem ? `${selectedFilterItem.name} (${LENSES.find(l => l.key === selectedFilterItem.lens)?.label || selectedFilterItem.lens})` : filterItemQuery}
                onChange={e => {
                  const value = e.target.value
                  setFilterItemQuery(value)
                  // Clear filter if user is typing (not showing selected item)
                  if (selectedFilterItem) {
                    const selectedText = `${selectedFilterItem.name} (${LENSES.find(l => l.key === selectedFilterItem.lens)?.label || selectedFilterItem.lens})`
                    if (value !== selectedText) {
                      setFilterItemId(null)
                    }
                  }
                }}
                placeholder="All (or search items...)"
                className="px-2 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 w-64"
              />
              {filterItemQuery.trim() && !selectedFilterItem && filterItemOptions.length > 0 && (
                <div className="absolute z-10 mt-1 w-64 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded shadow-lg max-h-60 overflow-y-auto">
                  {filterItemOptions.map(option => (
                    <button
                      key={option.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setFilterItemId(option.id)
                        setFilterItemQuery('')
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm"
                    >
                      <div className="font-medium">{option.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{option.lensLabel}</div>
                    </button>
                  ))}
                </div>
              )}
              {selectedFilterItem && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setFilterItemId(null)
                    setFilterItemQuery('')
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-lg leading-none"
                  title="Clear filter"
                >
                  ×
                </button>
              )}
            </div>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-xs">Minor Text:</span>
            <select
              value={minorTextOption}
              onChange={e => setMinorTextOption(e.target.value as 'none' | 'lifecycle' | 'description')}
              className="px-2 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="none">None</option>
              <option value="lifecycle">Lifecycle Status</option>
              <option value="description">Description</option>
            </select>
          </label>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {primaryLens && secondaryLens ? (
          itemAnalysis.length > 0 ? (
            <div ref={contentRef} className="max-w-7xl mx-auto">
              {/* Column headers */}
              <div className={`grid ${(() => {
                if (!hasAnyLifecycleStatus) return 'grid-cols-[200px_1fr]'
                if (columnViewMode === 'both') return 'grid-cols-[200px_1fr_1fr]'
                return 'grid-cols-[200px_1fr]'
              })()} gap-3 mb-2 pb-2 border-b-2 border-slate-300 dark:border-slate-700`}>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {LENSES.find(l => l.key === primaryLens)?.label || primaryLens}
                </div>
                {hasAnyLifecycleStatus ? (
                  <>
                    {columnViewMode === 'both' && (
                      <>
                        <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-center">
                          Current
                        </div>
                        <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-center">
                          Target
                        </div>
                      </>
                    )}
                    {columnViewMode === 'current' && (
                      <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-center">
                        Current
                      </div>
                    )}
                    {columnViewMode === 'target' && (
                      <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-center">
                        Target
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-center">
                    {LENSES.find(l => l.key === secondaryLens)?.label || secondaryLens}
                  </div>
                )}
              </div>
              
              {/* Rows grouped by parent */}
              <div className="space-y-2">
                {sortedParents.map(parent => {
                  const groupItems = groupedItemAnalysis.get(parent)!
                  return (
                    <div key={parent || 'no-parent'}>
                      {/* Parent group header */}
                      {parent && (
                        <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                          {parent}
                        </div>
                      )}
                      {/* Items in this parent group - continuous table */}
                      <div className="bg-white dark:bg-slate-800 rounded border border-slate-300 dark:border-slate-700 overflow-hidden">
                        {groupItems.map((analysis, idx) => {
                          const { primaryItem, divestItems, targetItems, hasRollup, rollupGroups, ungroupedSecondaryItems, itemRelLifecycleMap } = analysis as any
                          
                          // If no items have lifecycleStatus, use only divestItems (deduplicated) to avoid showing items twice
                          const allItems = hasAnyLifecycleStatus ? null : (() => {
                            const itemsMap = new Map<number, ItemRecord>()
                            ;(divestItems || []).forEach((item: ItemRecord) => {
                              if (item.id) itemsMap.set(item.id, item)
                            })
                            return Array.from(itemsMap.values())
                          })()
                          
                          // Render with roll-up grouping if enabled
                          if (hasRollup && rollupGroups) {
                            // If no lifecycleStatus, use only divestItems from rollupGroups (deduplicated) to avoid showing items twice
                            // Don't include targetItems in single column mode
                            const allRollupItems = hasAnyLifecycleStatus ? null : (() => {
                              const itemsMap = new Map<number, ItemRecord>()
                              rollupGroups.forEach((g: any) => {
                                ;(g.divestItems || []).forEach((item: ItemRecord) => {
                                  if (item && item.id) itemsMap.set(item.id, item)
                                })
                              })
                              // Also include ungrouped items that are in divestItems
                              if (ungroupedSecondaryItems) {
                                ungroupedSecondaryItems.forEach((item: ItemRecord) => {
                                  if (item && item.id && divestItems.includes(item)) {
                                    itemsMap.set(item.id, item)
                                  }
                                })
                              }
                              return Array.from(itemsMap.values())
                            })()
                            
                            return (
                              <div
                                key={primaryItem.id}
                                className={`grid ${(() => {
                                  if (!hasAnyLifecycleStatus) return 'grid-cols-[200px_1fr]'
                                  if (columnViewMode === 'both') return 'grid-cols-[200px_1fr_1fr]'
                                  return 'grid-cols-[200px_1fr]'
                                })()} gap-3 p-2 ${idx < groupItems.length - 1 ? 'border-b border-slate-200 dark:border-slate-700' : ''}`}
                              >
                                {/* Left: Primary Item Name */}
                                <div className="flex flex-col justify-start">
                                  <div 
                                    className="font-bold text-sm text-slate-800 dark:text-slate-200 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                                    onClick={() => {
                                      setEditItem(primaryItem)
                                      setEditDialogOpen(true)
                                    }}
                                  >
                                    {primaryItem.name}
                                  </div>
                                  {minorTextOption !== 'none' && primaryItem.description && (
                                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                                      {primaryItem.description}
                                    </div>
                                  )}
                                </div>
                                
                                {hasAnyLifecycleStatus ? (
                                  <>
                                    {(columnViewMode === 'both' || columnViewMode === 'current') && (
                                      /* Middle Column: Current items from all roll-up groups */
                                      <div className={columnViewMode === 'both' ? 'mr-6' : ''}>
                                  {/* Roll-up Groups - Current Items */}
                                  <div className="space-y-3">
                                  {rollupGroups.map((group: any) => {
                                    // For "only-related" mode, show roll-up items as boxes instead of secondary items
                                    if (rollupMode === 'only-related') {
                                      const hasCurrentItems = group.divestItems.length > 0
                                      
                                      return (
                                        <div key={group.rollupItem.id || `parent-${group.rollupItem.name}`}>
                                          {hasCurrentItems ? (
                                            <div className={`grid ${getGridColsClass()} gap-1`}>
                                            <div
                                              className={`p-1 rounded border text-center ${getInnerBoxColor(group.rollupItem.lifecycleStatus)} ${group.rollupItem.id ? 'cursor-pointer' : ''} ${getRollupItemOpacityClass(group.rollupItem)} ${(() => {
                                                if (group.rollupItem.id) {
                                                  const isHovered = hoveredItemId === group.rollupItem.id
                                                  const relatedIds = hoveredItemId ? getRelatedItemIds(hoveredItemId) : new Set<number>()
                                                  const isRelated = hoveredItemId !== null && relatedIds.has(group.rollupItem.id)
                                                  return isHovered || isRelated ? `outline outline-2 ${getOutlineColor(group.rollupItem.lifecycleStatus)} outline-offset-[-1px]` : ''
                                                } else {
                                                  // Parent name - highlight if this parent is hovered (use gray outline for parent names)
                                                  return hoveredParentName === group.rollupItem.name ? 'outline outline-2 outline-gray-300 dark:outline-gray-700 outline-offset-[-1px]' : ''
                                                }
                                              })()}`}
                                              onMouseEnter={() => {
                                                if (group.rollupItem.id) {
                                                  setHoveredItemId(group.rollupItem.id)
                                                } else {
                                                  // Parent name - set hovered parent
                                                  setHoveredParentName(group.rollupItem.name)
                                                }
                                              }}
                                              onMouseLeave={() => {
                                                if (group.rollupItem.id) {
                                                  setHoveredItemId(null)
                                                } else {
                                                  setHoveredParentName(null)
                                                }
                                              }}
                                              onClick={() => {
                                                if (group.rollupItem.id) {
                                                  setEditItem(group.rollupItem)
                                                  setEditDialogOpen(true)
                                                }
                                              }}
                                            >
                                              <div className="text-xs text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                                                {group.rollupItem.name}
                                              </div>
                                              {minorTextOption === 'description' && group.rollupItem.description && (
                                                <div className="text-[9px] text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-1">
                                                  {group.rollupItem.description}
                                                </div>
                                              )}
                                              {minorTextOption === 'lifecycle' && (
                                                <div className="text-[9px] mt-0.5 font-medium text-slate-700 dark:text-slate-300">
                                                  {getLifecycleLabel(group.rollupItem.lifecycleStatus)}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        ) : null}
                                      </div>
                                    )
                                  }
                                  
                                  // For "show-secondary" mode, show roll-up items as boxes (not headers) for related items
                                  if (rollupMode === 'show-secondary') {
                                    const hasCurrentItems = group.divestItems.length > 0
                                    
                                    return (
                                      <div key={group.rollupItem.id || `parent-${group.rollupItem.name}`}>
                                        {hasCurrentItems ? (
                                          <div className={`grid ${getGridColsClass()} gap-1`}>
                                            <div
                                              className={`p-1 rounded border text-center ${getInnerBoxColor(group.rollupItem.lifecycleStatus)} ${group.rollupItem.id ? 'cursor-pointer' : ''} ${getRollupItemOpacityClass(group.rollupItem)} ${(() => {
                                                if (group.rollupItem.id) {
                                                  const isHovered = hoveredItemId === group.rollupItem.id
                                                  const relatedIds = hoveredItemId ? getRelatedItemIds(hoveredItemId) : new Set<number>()
                                                  const isRelated = hoveredItemId !== null && relatedIds.has(group.rollupItem.id)
                                                  return isHovered || isRelated ? 'border-2' : ''
                                                } else {
                                                  // Parent name - highlight if this parent is hovered
                                                  return hoveredParentName === group.rollupItem.name ? 'border-2' : ''
                                                }
                                              })()}`}
                                              onMouseEnter={() => {
                                                if (group.rollupItem.id) {
                                                  setHoveredItemId(group.rollupItem.id)
                                                } else {
                                                  // Parent name - set hovered parent
                                                  setHoveredParentName(group.rollupItem.name)
                                                }
                                              }}
                                              onMouseLeave={() => {
                                                if (group.rollupItem.id) {
                                                  setHoveredItemId(null)
                                                } else {
                                                  setHoveredParentName(null)
                                                }
                                              }}
                                              onClick={() => {
                                                if (group.rollupItem.id) {
                                                  setEditItem(group.rollupItem)
                                                  setEditDialogOpen(true)
                                                }
                                              }}
                                            >
                                                <div className="text-xs text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                                                  {group.rollupItem.name}
                                                </div>
                                                {minorTextOption === 'description' && group.rollupItem.description && (
                                                  <div className="text-[9px] text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-1">
                                                    {group.rollupItem.description}
                                                  </div>
                                                )}
                                                {minorTextOption === 'lifecycle' && (
                                                  <div className="text-[9px] mt-0.5 font-medium text-slate-700 dark:text-slate-300">
                                                    {getLifecycleLabel(group.rollupItem.lifecycleStatus)}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          ) : null}
                                        </div>
                                      )
                                    }
                                    
                                    // For "none" mode, show roll-up items as boxes (same as other modes)
                                    // This applies to both regular roll-up lenses and parent-based roll-up
                                    const hasCurrentItems = group.divestItems.length > 0
                                    
                                    return (
                                      <div key={group.rollupItem.id || `parent-${group.rollupItem.name}`}>
                                        {hasCurrentItems ? (
                                          <div className={`grid ${getGridColsClass()} gap-1`}>
                                            <div
                                              className={`p-1 rounded border text-center ${getInnerBoxColor(group.rollupItem.lifecycleStatus)} ${group.rollupItem.id ? 'cursor-pointer' : ''} ${getRollupItemOpacityClass(group.rollupItem)} ${(() => {
                                                if (group.rollupItem.id) {
                                                  const isHovered = hoveredItemId === group.rollupItem.id
                                                  const relatedIds = hoveredItemId ? getRelatedItemIds(hoveredItemId) : new Set<number>()
                                                  const isRelated = hoveredItemId !== null && relatedIds.has(group.rollupItem.id)
                                                  return isHovered || isRelated ? `outline outline-2 ${getOutlineColor(group.rollupItem.lifecycleStatus)} outline-offset-[-1px]` : ''
                                                } else {
                                                  // Parent name - highlight if this parent is hovered (use gray outline for parent names)
                                                  return hoveredParentName === group.rollupItem.name ? 'outline outline-2 outline-gray-300 dark:outline-gray-700 outline-offset-[-1px]' : ''
                                                }
                                              })()}`}
                                              onMouseEnter={() => {
                                                if (group.rollupItem.id) {
                                                  setHoveredItemId(group.rollupItem.id)
                                                } else {
                                                  // Parent name - set hovered parent
                                                  setHoveredParentName(group.rollupItem.name)
                                                }
                                              }}
                                              onMouseLeave={() => {
                                                if (group.rollupItem.id) {
                                                  setHoveredItemId(null)
                                                } else {
                                                  setHoveredParentName(null)
                                                }
                                              }}
                                              onClick={() => {
                                                if (group.rollupItem.id) {
                                                  setEditItem(group.rollupItem)
                                                  setEditDialogOpen(true)
                                                }
                                              }}
                                            >
                                              <div className="text-xs text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                                                {group.rollupItem.name}
                                              </div>
                                              {minorTextOption === 'description' && group.rollupItem.description && (
                                                <div className="text-[9px] text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-1">
                                                  {group.rollupItem.description}
                                                </div>
                                              )}
                                              {minorTextOption === 'lifecycle' && (
                                                <div className="text-[9px] mt-0.5 font-medium text-slate-700 dark:text-slate-300">
                                                  {getLifecycleLabel(group.rollupItem.lifecycleStatus)}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        ) : null}
                                      </div>
                                    )
                                  })}
                                  
                                  {/* For "only-related" mode: show count of non-rolled items in Current column */}
                                  {rollupMode === 'only-related' && ungroupedSecondaryItems && ungroupedSecondaryItems.length > 0 && (
                                    <div className={rollupGroups.length > 0 ? 'mt-3' : ''}>
                                      {(() => {
                                        const ungroupedCurrent = ungroupedSecondaryItems.filter((item: ItemRecord) => {
                                          const itemId = item.id!
                                          const relLifecycle = itemRelLifecycleMap.get(itemId)
                                          
                                          if (item.lifecycleStatus === 'Invest') {
                                            return relLifecycle === undefined || relLifecycle === 'Divest'
                                          }
                                          if (item.lifecycleStatus === 'Divest') {
                                            return true
                                          }
                                          if (item.lifecycleStatus === 'Stable') {
                                            return true
                                          }
                                          if (!item.lifecycleStatus) {
                                            return relLifecycle !== 'Plan'
                                          }
                                          return false
                                        })
                                        const count = ungroupedCurrent.length
                                        const secondaryLensLabel = LENSES.find(l => l.key === secondaryLens)?.label || secondaryLens
                                        return count > 0 ? (
                                          <div className={`grid ${getGridColsClass()} gap-1`}>
                                            <div className="p-1 rounded border text-center bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700">
                                              <div className="text-xs text-slate-600 dark:text-slate-400">
                                                +{count} other {secondaryLensLabel}
                                              </div>
                                            </div>
                                          </div>
                                        ) : null
                                      })()}
                                    </div>
                                  )}
                                  
                                  {/* Ungrouped secondary items in Current column (only if mode is 'show-secondary') */}
                                  {rollupMode === 'show-secondary' && ungroupedSecondaryItems && ungroupedSecondaryItems.length > 0 && (
                                    <div className={rollupGroups.length > 0 ? 'mt-3' : ''}>
                                      {ungroupedSecondaryItems.filter((item: ItemRecord) => divestItems.includes(item)).length > 0 ? (
                                        <div className={`grid ${getGridColsClass()} gap-1`}>
                                          {ungroupedSecondaryItems.filter((item: ItemRecord) => divestItems.includes(item)).map((item: ItemRecord) => {
                                            const isHighlighted = shouldHighlightItem(item)
                                            const highlightClass = isHighlighted ? `outline outline-2 ${getOutlineColor(item.lifecycleStatus)} outline-offset-[-1px]` : ''
                                            return (
                                            <div
                                              key={item.id}
                                              className={`p-1 rounded border text-center ${getHighlightedItemColor(item)} cursor-pointer ${getOpacityClass(item)} ${highlightClass}`}
                                              onMouseEnter={() => {
                                                if (item.id) setHoveredItemId(item.id)
                                                setHoveredParentName(null)
                                              }}
                                              onMouseLeave={() => {
                                                setHoveredItemId(null)
                                                setHoveredParentName(null)
                                              }}
                                              onClick={() => {
                                                setEditItem(item)
                                                setEditDialogOpen(true)
                                              }}
                                            >
                                              <div className="text-xs text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                                                {item.name}
                                              </div>
                                              {minorTextOption === 'description' && item.description && (
                                                <div className="text-[9px] text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-1">
                                                  {item.description}
                                                </div>
                                              )}
                                              {minorTextOption === 'lifecycle' && (
                                                <div className="text-[9px] mt-0.5 font-medium text-slate-700 dark:text-slate-300">
                                                  {getLifecycleLabel(item.lifecycleStatus)}
                                                </div>
                                              )}
                                            </div>
                                            )
                                          })}
                                        </div>
                                      ) : null}
                                    </div>
                                  )}
                                      </div>
                                    </div>
                                    )}
                                    
                                    {(columnViewMode === 'both' || columnViewMode === 'target') && (
                                      /* Right Column: Target items from all roll-up groups */
                                      <div className={columnViewMode === 'both' ? 'ml-6' : ''}>
                                  {/* Roll-up Groups - Target Items */}
                                  <div className="space-y-3">
                                  {rollupGroups.map((group: any) => {
                                    // For "only-related" mode, show roll-up items as boxes instead of secondary items
                                    if (rollupMode === 'only-related') {
                                      const hasTargetItemsInGroup = group.targetItems.length > 0
                                      const hasTargetItemsOverall = targetItems.length > 0
                                      
                                      return (
                                        <div key={group.rollupItem.id || `parent-${group.rollupItem.name}`}>
                                          {hasTargetItemsInGroup ? (
                                            <div className={`grid ${getGridColsClass()} gap-1`}>
                                              <div
                                                className={`p-1 rounded border text-center ${getInnerBoxColor(group.rollupItem.lifecycleStatus)} ${group.rollupItem.id ? 'cursor-pointer' : ''} ${getRollupItemOpacityClass(group.rollupItem)} ${(() => {
                                                  if (!group.rollupItem.id) return ''
                                                  const isHovered = hoveredItemId === group.rollupItem.id
                                                  const relatedIds = hoveredItemId ? getRelatedItemIds(hoveredItemId) : new Set<number>()
                                                  const isRelated = hoveredItemId !== null && relatedIds.has(group.rollupItem.id)
                                                  return isHovered || isRelated ? 'border-2' : ''
                                                })()}`}
                                                onMouseEnter={() => group.rollupItem.id && setHoveredItemId(group.rollupItem.id)}
                                                onMouseLeave={() => setHoveredItemId(null)}
                                                onClick={() => {
                                                  if (group.rollupItem.id) {
                                                    setEditItem(group.rollupItem)
                                                    setEditDialogOpen(true)
                                                  }
                                                }}
                                              >
                                                <div className="text-xs text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                                                  {group.rollupItem.name}
                                                </div>
                                                {minorTextOption === 'description' && group.rollupItem.description && (
                                                  <div className="text-[9px] text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-1">
                                                    {group.rollupItem.description}
                                                  </div>
                                                )}
                                                {minorTextOption === 'lifecycle' && (
                                                  <div className="text-[9px] mt-0.5 font-medium text-slate-700 dark:text-slate-300">
                                                    {getLifecycleLabel(group.rollupItem.lifecycleStatus)}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          ) : hasTargetItemsOverall ? (
                                            null
                                          ) : (
                                            <div className="text-xs text-slate-500 dark:text-slate-400 italic py-2">
                                              No Target items for {primaryItem.name}
                                              {group.divestItems.length > 0 && (
                                                <div className="mt-1 text-[10px]">
                                                  Current: {group.divestItems.map((item: ItemRecord) => item.name).join(', ')}
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      )
                                    }
                                    
                                    // For "show-secondary" mode, show roll-up items as boxes (not headers) for related items
                                    if (rollupMode === 'show-secondary') {
                                      const hasTargetItemsInGroup = group.targetItems.length > 0
                                      const hasTargetItemsOverall = targetItems.length > 0
                                      
                                      return (
                                        <div key={group.rollupItem.id || `parent-${group.rollupItem.name}`}>
                                          {hasTargetItemsInGroup ? (
                                            <div className={`grid ${getGridColsClass()} gap-1`}>
                                              <div
                                                className={`p-1 rounded border text-center ${getInnerBoxColor(group.rollupItem.lifecycleStatus)} ${group.rollupItem.id ? 'cursor-pointer' : ''} ${getRollupItemOpacityClass(group.rollupItem)} ${(() => {
                                                  if (!group.rollupItem.id) return ''
                                                  const isHovered = hoveredItemId === group.rollupItem.id
                                                  const relatedIds = hoveredItemId ? getRelatedItemIds(hoveredItemId) : new Set<number>()
                                                  const isRelated = hoveredItemId !== null && relatedIds.has(group.rollupItem.id)
                                                  return isHovered || isRelated ? 'border-2' : ''
                                                })()}`}
                                                onMouseEnter={() => group.rollupItem.id && setHoveredItemId(group.rollupItem.id)}
                                                onMouseLeave={() => setHoveredItemId(null)}
                                                onClick={() => {
                                                  if (group.rollupItem.id) {
                                                    setEditItem(group.rollupItem)
                                                    setEditDialogOpen(true)
                                                  }
                                                }}
                                              >
                                                <div className="text-xs text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                                                  {group.rollupItem.name}
                                                </div>
                                                {minorTextOption === 'description' && group.rollupItem.description && (
                                                  <div className="text-[9px] text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-1">
                                                    {group.rollupItem.description}
                                                  </div>
                                                )}
                                                {minorTextOption === 'lifecycle' && (
                                                  <div className="text-[9px] mt-0.5 font-medium text-slate-700 dark:text-slate-300">
                                                    {getLifecycleLabel(group.rollupItem.lifecycleStatus)}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          ) : hasTargetItemsOverall ? (
                                            null
                                          ) : (
                                            <div className="text-xs text-slate-500 dark:text-slate-400 italic py-2">
                                              No Target items for {primaryItem.name}
                                              {group.divestItems.length > 0 && (
                                                <div className="mt-1 text-[10px]">
                                                  Current: {group.divestItems.map((item: ItemRecord) => item.name).join(', ')}
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      )
                                    }
                                    
                                    // For "none" mode, show roll-up items as boxes (same as other modes)
                                    const hasTargetItemsInGroup = group.targetItems.length > 0
                                    const hasTargetItemsOverall = targetItems.length > 0
                                    
                                    return (
                                      <div key={group.rollupItem.id || `parent-${group.rollupItem.name}`}>
                                        {hasTargetItemsInGroup ? (
                                          <div className={`grid ${getGridColsClass()} gap-1`}>
                                            <div
                                              className={`p-1 rounded border text-center ${getInnerBoxColor(group.rollupItem.lifecycleStatus)} ${group.rollupItem.id ? 'cursor-pointer' : ''} ${getRollupItemOpacityClass(group.rollupItem)} ${(() => {
                                                if (group.rollupItem.id) {
                                                  const isHovered = hoveredItemId === group.rollupItem.id
                                                  const relatedIds = hoveredItemId ? getRelatedItemIds(hoveredItemId) : new Set<number>()
                                                  const isRelated = hoveredItemId !== null && relatedIds.has(group.rollupItem.id)
                                                  return isHovered || isRelated ? `outline outline-2 ${getOutlineColor(group.rollupItem.lifecycleStatus)} outline-offset-[-1px]` : ''
                                                } else {
                                                  // Parent name - highlight if this parent is hovered (use gray outline for parent names)
                                                  return hoveredParentName === group.rollupItem.name ? 'outline outline-2 outline-gray-300 dark:outline-gray-700 outline-offset-[-1px]' : ''
                                                }
                                              })()}`}
                                              onMouseEnter={() => {
                                                if (group.rollupItem.id) {
                                                  setHoveredItemId(group.rollupItem.id)
                                                } else {
                                                  // Parent name - set hovered parent
                                                  setHoveredParentName(group.rollupItem.name)
                                                }
                                              }}
                                              onMouseLeave={() => {
                                                if (group.rollupItem.id) {
                                                  setHoveredItemId(null)
                                                } else {
                                                  setHoveredParentName(null)
                                                }
                                              }}
                                              onClick={() => {
                                                if (group.rollupItem.id) {
                                                  setEditItem(group.rollupItem)
                                                  setEditDialogOpen(true)
                                                }
                                              }}
                                            >
                                              <div className="text-xs text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                                                {group.rollupItem.name}
                                              </div>
                                              {minorTextOption === 'description' && group.rollupItem.description && (
                                                <div className="text-[9px] text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-1">
                                                  {group.rollupItem.description}
                                                </div>
                                              )}
                                              {minorTextOption === 'lifecycle' && (
                                                <div className="text-[9px] mt-0.5 font-medium text-slate-700 dark:text-slate-300">
                                                  {getLifecycleLabel(group.rollupItem.lifecycleStatus)}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        ) : hasTargetItemsOverall ? (
                                          null
                                        ) : (
                                          <div className="text-xs text-slate-500 dark:text-slate-400 italic py-2">
                                            No Target items for {primaryItem.name}
                                            {group.divestItems.length > 0 && (
                                              <div className="mt-1 text-[10px]">
                                                Current: {group.divestItems.map((item: ItemRecord) => item.name).join(', ')}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                  
                                  {/* For "only-related" mode: show count of non-rolled items in Target column */}
                                  {rollupMode === 'only-related' && ungroupedSecondaryItems && ungroupedSecondaryItems.length > 0 && (
                                    <div className={rollupGroups.length > 0 ? 'mt-3' : ''}>
                                      {(() => {
                                        const ungroupedTarget = ungroupedSecondaryItems.filter((item: ItemRecord) => {
                                          const itemId = item.id!
                                          const relLifecycle = itemRelLifecycleMap.get(itemId)
                                          
                                          if (relLifecycle === 'Divest') return false
                                          
                                          return (
                                            item.lifecycleStatus === 'Emerging' || 
                                            item.lifecycleStatus === 'Invest' || 
                                            item.lifecycleStatus === 'Plan' ||
                                            item.lifecycleStatus === 'Stable' ||
                                            (!item.lifecycleStatus && relLifecycle !== 'Divest') ||
                                            (item.lifecycleStatus &&
                                              item.lifecycleStatus !== 'Divest' &&
                                              item.lifecycleStatus !== 'Emerging' &&
                                              item.lifecycleStatus !== 'Invest' &&
                                              item.lifecycleStatus !== 'Plan' &&
                                              item.lifecycleStatus !== 'Stable')
                                          )
                                        })
                                        const count = ungroupedTarget.length
                                        const secondaryLensLabel = LENSES.find(l => l.key === secondaryLens)?.label || secondaryLens
                                        return count > 0 ? (
                                          <div className={`grid ${getGridColsClass()} gap-1`}>
                                            <div className="p-1 rounded border text-center bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700">
                                              <div className="text-xs text-slate-600 dark:text-slate-400">
                                                +{count} other {secondaryLensLabel}
                                              </div>
                                            </div>
                                          </div>
                                        ) : null
                                      })()}
                                    </div>
                                  )}
                                  
                                  {/* Ungrouped secondary items in Target column (only if mode is 'show-secondary') */}
                                  {rollupMode === 'show-secondary' && ungroupedSecondaryItems && ungroupedSecondaryItems.length > 0 && (
                                    <div className={rollupGroups.length > 0 ? 'mt-3' : ''}>
                                      {ungroupedSecondaryItems.filter((item: ItemRecord) => targetItems.includes(item)).length > 0 ? (
                                        <div className={`grid ${getGridColsClass()} gap-1`}>
                                          {ungroupedSecondaryItems.filter((item: ItemRecord) => targetItems.includes(item)).map((item: ItemRecord) => {
                                            const isHighlighted = shouldHighlightItem(item)
                                            const highlightClass = isHighlighted ? `outline outline-2 ${getOutlineColor(item.lifecycleStatus)} outline-offset-[-1px]` : ''
                                            return (
                                            <div
                                              key={item.id}
                                              className={`p-1 rounded border text-center ${getHighlightedItemColor(item)} cursor-pointer ${getOpacityClass(item)} ${highlightClass}`}
                                              onMouseEnter={() => {
                                                if (item.id) setHoveredItemId(item.id)
                                                setHoveredParentName(null)
                                              }}
                                              onMouseLeave={() => {
                                                setHoveredItemId(null)
                                                setHoveredParentName(null)
                                              }}
                                              onClick={() => {
                                                setEditItem(item)
                                                setEditDialogOpen(true)
                                              }}
                                            >
                                              <div className="text-xs text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                                                {item.name}
                                              </div>
                                              {minorTextOption === 'description' && item.description && (
                                                <div className="text-[9px] text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-1">
                                                  {item.description}
                                                </div>
                                              )}
                                              {minorTextOption === 'lifecycle' && (
                                                <div className="text-[9px] mt-0.5 font-medium text-slate-700 dark:text-slate-300">
                                                  {getLifecycleLabel(item.lifecycleStatus)}
                                                </div>
                                              )}
                                            </div>
                                            )
                                          })}
                                        </div>
                                      ) : targetItems.length > 0 ? (
                                        null
                                      ) : (
                                        <div className="text-xs text-slate-500 dark:text-slate-400 italic py-2">
                                          No Target items for {primaryItem.name}
                                          {ungroupedSecondaryItems.filter((item: ItemRecord) => divestItems.includes(item)).length > 0 && (
                                            <div className="mt-1 text-[10px]">
                                              Current: {ungroupedSecondaryItems.filter((item: ItemRecord) => divestItems.includes(item)).map((item: ItemRecord) => item.name).join(', ')}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  </div>
                                </div>
                                    )}
                                  </>
                                ) : (
                                  /* Single Column: All items from roll-up groups when no lifecycleStatus */
                                  <div>
                                    {allRollupItems && allRollupItems.length > 0 ? (
                                      <div className="space-y-3">
                                        {rollupGroups.map((group: any) => (
                                          <div key={group.rollupItem.id || `parent-${group.rollupItem.name}`}>
                                            {(group.divestItems || []).length > 0 ? (
                                              <div className={`grid ${getGridColsClass()} gap-1`}>
                                                <div
                                                  className={`p-1 rounded border text-center ${getInnerBoxColor(group.rollupItem.lifecycleStatus)} ${group.rollupItem.id ? 'cursor-pointer' : ''} ${getRollupItemOpacityClass(group.rollupItem)} ${(() => {
                                                    if (!group.rollupItem.id) return ''
                                                    const isHovered = hoveredItemId === group.rollupItem.id
                                                    const relatedIds = hoveredItemId ? getRelatedItemIds(hoveredItemId) : new Set<number>()
                                                    const isRelated = hoveredItemId !== null && relatedIds.has(group.rollupItem.id)
                                                    return isHovered || isRelated ? 'border-2' : ''
                                                  })()}`}
                                                  onMouseEnter={() => group.rollupItem.id && setHoveredItemId(group.rollupItem.id)}
                                                  onMouseLeave={() => setHoveredItemId(null)}
                                                  onClick={() => {
                                                    if (group.rollupItem.id) {
                                                      setEditItem(group.rollupItem)
                                                      setEditDialogOpen(true)
                                                    }
                                                  }}
                                                >
                                                  <div className="text-xs text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                                                    {group.rollupItem.name}
                                                  </div>
                                                  {minorTextOption === 'description' && group.rollupItem.description && (
                                                    <div className="text-[9px] text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-1">
                                                      {group.rollupItem.description}
                                                    </div>
                                                  )}
                                                  {minorTextOption === 'lifecycle' && (
                                                    <div className="text-[9px] mt-0.5 font-medium text-slate-700 dark:text-slate-300">
                                                      {getLifecycleLabel(group.rollupItem.lifecycleStatus)}
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            ) : null}
                                          </div>
                                        ))}
                                        {ungroupedSecondaryItems && ungroupedSecondaryItems.length > 0 && (
                                          <div className={rollupGroups.length > 0 ? 'mt-3' : ''}>
                                            <div className={`grid ${getGridColsClass()} gap-1`}>
                                              {ungroupedSecondaryItems.filter((item: ItemRecord) => divestItems.includes(item)).map((item: ItemRecord) => {
                                                const isHighlighted = shouldHighlightItem(item)
                                                const highlightClass = isHighlighted ? `outline outline-2 ${getOutlineColor(item.lifecycleStatus)} outline-offset-[-1px]` : ''
                                                return (
                                                <div
                                                  key={item.id}
                                                  className={`p-1 rounded border text-center ${getHighlightedItemColor(item)} cursor-pointer ${getOpacityClass(item)} ${highlightClass}`}
                                                  onMouseEnter={() => {
                                                    if (item.id) setHoveredItemId(item.id)
                                                    setHoveredParentName(null)
                                                  }}
                                                  onMouseLeave={() => {
                                                    setHoveredItemId(null)
                                                    setHoveredParentName(null)
                                                  }}
                                                  onClick={() => {
                                                    setEditItem(item)
                                                    setEditDialogOpen(true)
                                                  }}
                                                >
                                                  <div className="text-xs text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                                                    {item.name}
                                                  </div>
                                                  {minorTextOption === 'description' && item.description && (
                                                    <div className="text-[9px] text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-1">
                                                      {item.description}
                                                    </div>
                                                  )}
                                                  {minorTextOption === 'lifecycle' && (
                                                    <div className="text-[9px] mt-0.5 font-medium text-slate-700 dark:text-slate-300">
                                                      {getLifecycleLabel(item.lifecycleStatus)}
                                                    </div>
                                                  )}
                                                </div>
                                                )
                                              })}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="text-xs text-slate-500 dark:text-slate-400 italic py-2">
                                        No items
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          }
                          
                          // Original rendering without roll-up (else case)
                          return (
                            <div
                              key={primaryItem.id}
                              className={`grid ${(() => {
                                if (!hasAnyLifecycleStatus) return 'grid-cols-[200px_1fr]'
                                if (columnViewMode === 'both') return 'grid-cols-[200px_1fr_1fr]'
                                return 'grid-cols-[200px_1fr]'
                              })()} gap-3 p-2 ${idx < groupItems.length - 1 ? 'border-b border-slate-200 dark:border-slate-700' : ''}`}
                            >
                              {/* Left: Primary Item Name */}
                              <div className="flex flex-col justify-start">
                                <div 
                                  className="font-bold text-sm text-slate-800 dark:text-slate-200 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                                  onClick={() => {
                                    setEditItem(primaryItem)
                                    setEditDialogOpen(true)
                                  }}
                                >
                                  {primaryItem.name}
                                </div>
                                {minorTextOption !== 'none' && primaryItem.description && (
                                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                                    {primaryItem.description}
                                  </div>
                                )}
                              </div>
                              
                              {hasAnyLifecycleStatus ? (
                                <>
                                  {(columnViewMode === 'both' || columnViewMode === 'current') && (
                                    /* Middle Column: Current (Invest items with relationship lifecycle None or Divest) */
                                    <div className={columnViewMode === 'both' ? 'mr-6' : ''}>
                                    {divestItems.length > 0 ? (
                                      <div className={`grid ${getGridColsClass()} gap-1`}>
                                        {divestItems.map((item: ItemRecord) => {
                                          const isHighlighted = shouldHighlightItem(item)
                                          const highlightClass = isHighlighted ? `outline outline-2 ${getOutlineColor(item.lifecycleStatus)} outline-offset-[-1px]` : ''
                                          return (
                                          <div
                                            key={item.id}
                                            className={`p-1 rounded border text-center ${getHighlightedItemColor(item)} cursor-pointer ${getOpacityClass(item)} ${highlightClass}`}
                                            onMouseEnter={() => {
                                              if (item.id) setHoveredItemId(item.id)
                                              setHoveredParentName(null)
                                            }}
                                            onMouseLeave={() => {
                                              setHoveredItemId(null)
                                              setHoveredParentName(null)
                                            }}
                                            onClick={() => {
                                              setEditItem(item)
                                              setEditDialogOpen(true)
                                            }}
                                          >
                                            <div className="text-xs text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                                              {item.name}
                                            </div>
                                            {minorTextOption === 'description' && item.description && (
                                              <div className="text-[9px] text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-1">
                                                {item.description}
                                              </div>
                                            )}
                                            {minorTextOption === 'lifecycle' && (
                                              <div className="text-[9px] mt-0.5 font-medium text-slate-700 dark:text-slate-300">
                                                {getLifecycleLabel(item.lifecycleStatus)}
                                              </div>
                                            )}
                                          </div>
                                          )
                                        })}
                                      </div>
                                    ) : (
                                      <div className="text-xs text-slate-500 dark:text-slate-400 italic py-2">
                                        No items in Current column
                                      </div>
                                    )}
                                  </div>
                                  )}
                                  
                                  {(columnViewMode === 'both' || columnViewMode === 'target') && (
                                    /* Right Column: Target (Replacement Items + Other Items + No Status) */
                                    <div className={columnViewMode === 'both' ? 'ml-6' : ''}>
                                    {targetItems.length > 0 ? (
                                      <div className={`grid ${getGridColsClass()} gap-1`}>
                                        {targetItems.map((item: ItemRecord) => {
                                          const isHighlighted = shouldHighlightItem(item)
                                          const highlightClass = isHighlighted ? `outline outline-2 ${getOutlineColor(item.lifecycleStatus)} outline-offset-[-1px]` : ''
                                          return (
                                          <div
                                            key={item.id}
                                            className={`p-1 rounded border text-center ${getHighlightedItemColor(item)} cursor-pointer ${getOpacityClass(item)} ${highlightClass}`}
                                            onMouseEnter={() => {
                                              if (item.id) setHoveredItemId(item.id)
                                              setHoveredParentName(null)
                                            }}
                                            onMouseLeave={() => {
                                              setHoveredItemId(null)
                                              setHoveredParentName(null)
                                            }}
                                            onClick={() => {
                                              setEditItem(item)
                                              setEditDialogOpen(true)
                                            }}
                                          >
                                            <div className="text-xs text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                                              {item.name}
                                            </div>
                                            {minorTextOption === 'description' && item.description && (
                                              <div className="text-[9px] text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-1">
                                                {item.description}
                                              </div>
                                            )}
                                            {minorTextOption === 'lifecycle' && (
                                              <div className="text-[9px] mt-0.5 font-medium text-slate-700 dark:text-slate-300">
                                                {getLifecycleLabel(item.lifecycleStatus)}
                                              </div>
                                            )}
                                          </div>
                                          )
                                        })}
                                      </div>
                                    ) : (
                                      <div className="text-xs text-slate-500 dark:text-slate-400 italic py-2">
                                        No Target items for {primaryItem.name}
                                        {divestItems.length > 0 && (
                                          <div className="mt-1 text-[10px]">
                                            Current: {divestItems.map((item: ItemRecord) => item.name).join(', ')}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  )}
                                </>
                              ) : (
                                /* Single Column: All items when no lifecycleStatus */
                                <div>
                                  {allItems && allItems.length > 0 ? (
                                    <div className={`grid ${getGridColsClass()} gap-1`}>
                                      {allItems.map((item: ItemRecord) => {
                                        const isHighlighted = shouldHighlightItem(item)
                                        const highlightClass = isHighlighted ? `outline outline-2 ${getOutlineColor(item.lifecycleStatus)} outline-offset-[-1px]` : ''
                                        return (
                                        <div
                                          key={item.id}
                                          className={`p-1 rounded border text-center ${getHighlightedItemColor(item)} cursor-pointer ${getOpacityClass(item)} ${highlightClass}`}
                                          onMouseEnter={() => {
                                            if (item.id) setHoveredItemId(item.id)
                                            setHoveredParentName(null)
                                          }}
                                          onMouseLeave={() => {
                                            setHoveredItemId(null)
                                            setHoveredParentName(null)
                                          }}
                                          onClick={() => {
                                            setEditItem(item)
                                            setEditDialogOpen(true)
                                          }}
                                        >
                                          <div className="text-xs text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                                            {item.name}
                                          </div>
                                          {minorTextOption === 'description' && item.description && (
                                            <div className="text-[9px] text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-1">
                                              {item.description}
                                            </div>
                                          )}
                                          {minorTextOption === 'lifecycle' && (
                                            <div className="text-[9px] mt-0.5 font-medium text-slate-700 dark:text-slate-300">
                                              {getLifecycleLabel(item.lifecycleStatus)}
                                            </div>
                                          )}
                                        </div>
                                        )
                                      })}
                                    </div>
                                  ) : (
                                    <div className="text-xs text-slate-500 dark:text-slate-400 italic py-2">
                                      No items
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              <p className="text-lg mb-2">No items found in {LENSES.find(l => l.key === primaryLens)?.label || primaryLens}</p>
              <p className="text-sm">Make sure items have relationships to items in {LENSES.find(l => l.key === secondaryLens)?.label || secondaryLens}</p>
            </div>
          )
        ) : (
          <div className="text-center py-12 text-slate-500 dark:text-slate-400">
            <p className="text-lg">Please select both lenses to view the analysis</p>
          </div>
        )}
      </div>
      <ItemDialog
        open={editDialogOpen}
        onClose={() => {
          setEditDialogOpen(false)
          setEditItem(null)
        }}
        lens={editItem?.lens || ''}
        item={editItem}
        onSaved={async () => {
          // Reload items and relationships after save
          const [allItems, allRels] = await Promise.all([
            db.items.toArray(),
            db.relationships.toArray(),
          ])
          setItems(allItems)
          setRelationships(allRels)
          setEditDialogOpen(false)
          setEditItem(null)
        }}
      />
    </div>
  )
}

