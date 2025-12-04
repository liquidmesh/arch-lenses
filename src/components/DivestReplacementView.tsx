import { useEffect, useMemo, useState } from 'react'
import { db, getAllLenses } from '../db'
import { type ItemRecord, type RelationshipRecord, type LensKey, type LifecycleStatus, LENSES } from '../types'
import { ItemDialog } from './ItemDialog'

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
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<ItemRecord | null>(null)

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
      const itemRelLifecycleMap = new Map<number, LifecycleStatus | undefined>()
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

      const relatedItems = items.filter(item => 
        item.lens === secondaryLens && relatedItemIds.has(item.id!)
      )

      // Categorize by lifecycle status, considering both item lifecycle and relationship lifecycle
      // Items with no status should appear in both Current and Target
      const itemsWithNoStatus = relatedItems.filter(item => !item.lifecycleStatus)
      
      // Current column: 
      // 1. Items with lifecycle "Invest" AND relationship with no lifecycle or lifecycle "Divest"
      // 2. Items with lifecycle "Divest"
      // 3. Items with lifecycle "Stable"
      // 4. Items with no lifecycle status (unless relationship is "Plan")
      const currentItems = relatedItems.filter(item => {
        const itemId = item.id!
        const relLifecycle = itemRelLifecycleMap.get(itemId)
        
        // Rule 1: Items with lifecycle "Invest" AND relationship with no lifecycle or lifecycle "Divest"
        if (item.lifecycleStatus === 'Invest') {
          return relLifecycle === undefined || relLifecycle === 'Divest'
        }
        
        // Rule 2: Items with lifecycle "Divest"
        if (item.lifecycleStatus === 'Divest') {
          return true
        }
        
        // Rule 3: Items with lifecycle "Stable"
        if (item.lifecycleStatus === 'Stable') {
          return true
        }
        
        // Rule 4: Items with no lifecycle status (unless relationship is "Plan")
        if (!item.lifecycleStatus) {
          return relLifecycle !== 'Plan'
        }
        
        return false
      })
      
      // Filter items based on relationship lifecycle:
      // - Items with relationship lifecycle "Divest" should not appear in Target column
      // - Items with relationship lifecycle "Plan" should not appear in Current column
      
      const replacementItems = relatedItems.filter(item => {
        const itemId = item.id!
        const relLifecycle = itemRelLifecycleMap.get(itemId)
        // Exclude if relationship lifecycle is "Divest" (shouldn't be in Target)
        if (relLifecycle === 'Divest') return false
        return (
          item.lifecycleStatus === 'Emerging' || 
          item.lifecycleStatus === 'Invest' || 
          item.lifecycleStatus === 'Plan' ||
          item.lifecycleStatus === 'Stable'
        )
      })
      // Items with other statuses (excluding Divest and the ones already categorized)
      const otherItems = relatedItems.filter(item => {
        const itemId = item.id!
        const relLifecycle = itemRelLifecycleMap.get(itemId)
        // Exclude if relationship lifecycle is "Divest" (shouldn't be in Target)
        if (relLifecycle === 'Divest') return false
        return (
          item.lifecycleStatus &&
          item.lifecycleStatus !== 'Divest' &&
          item.lifecycleStatus !== 'Emerging' &&
          item.lifecycleStatus !== 'Invest' &&
          item.lifecycleStatus !== 'Plan' &&
          item.lifecycleStatus !== 'Stable'
        )
      })
      // Include items with no status in targetItems for Target column (unless relationship is "Divest")
      const targetItemsWithNoStatus = [
        ...replacementItems,
        ...otherItems,
        ...itemsWithNoStatus.filter(item => {
          const itemId = item.id!
          const relLifecycle = itemRelLifecycleMap.get(itemId)
          return relLifecycle !== 'Divest'
        })
      ]

      return {
        primaryItem,
        divestItems: currentItems, // Current column items
        replacementItems,
        otherItems,
        targetItems: targetItemsWithNoStatus,
      }
    })
  }, [primaryItems, secondaryLens, items, relationships, primaryLens])

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

  const getLifecycleLabel = (status?: LifecycleStatus): string => {
    return status || 'No Status'
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-900">
      <div className="flex items-center gap-4 p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <h1 className="text-xl font-semibold">Target View</h1>
        <div className="flex items-center gap-4 ml-auto">
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
            <div className="max-w-7xl mx-auto">
              {/* Column headers */}
              <div className="grid grid-cols-[200px_1fr_1fr] gap-3 mb-2 pb-2 border-b-2 border-slate-300 dark:border-slate-700">
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {LENSES.find(l => l.key === primaryLens)?.label || primaryLens}
                </div>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-center">
                  Current
                </div>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-center ml-12">
                  Target
                </div>
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
                        {groupItems.map(({ primaryItem, divestItems, targetItems }, idx) => {
                          return (
                            <div
                              key={primaryItem.id}
                              className={`grid grid-cols-[200px_1fr_1fr] gap-3 p-2 ${idx < groupItems.length - 1 ? 'border-b border-slate-200 dark:border-slate-700' : ''}`}
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
                              
                              {/* Middle Column: Current (Invest items with relationship lifecycle None or Divest) */}
                              <div>
                                {divestItems.length > 0 ? (
                                  <div className="grid grid-cols-3 gap-1">
                                    {divestItems.map(item => (
                                      <div
                                        key={item.id}
                                        className={`p-1 rounded border text-center ${getInnerBoxColor(item.lifecycleStatus)} cursor-pointer hover:opacity-80`}
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
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-xs text-slate-500 dark:text-slate-400 italic py-2">
                                    No items in Current column
                                  </div>
                                )}
                              </div>
                              
                              {/* Right Column: Target (Replacement Items + Other Items + No Status) */}
                              <div className="ml-12">
                                {targetItems.length > 0 ? (
                                  <div className="grid grid-cols-3 gap-1">
                                    {targetItems.map(item => (
                                      <div
                                        key={item.id}
                                        className={`p-1 rounded border text-center ${getInnerBoxColor(item.lifecycleStatus)} cursor-pointer hover:opacity-80`}
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
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-xs text-slate-500 dark:text-slate-400 italic py-2">
                                    No replacement items
                                  </div>
                                )}
                              </div>
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

