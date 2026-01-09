import { useState, useEffect } from 'react'
import { type LensKey, type LensDefinition } from '../types'
import { getLensOrderSync, saveLensOrder } from '../utils/lensOrder'
import { getAllLenses } from '../db'

interface SidebarProps {
  visible: Record<LensKey, boolean>
  onToggle: (lens: LensKey) => void
  onShowAll: () => void
  onHideAll: () => void
  onFilterLens?: (lens: LensKey | null) => void
  filteredLens?: LensKey | null
  onOrderChange?: () => void
}

export function Sidebar({ visible, onToggle, onShowAll, onHideAll, onFilterLens, filteredLens, onOrderChange }: SidebarProps) {
  const [orderedLenses, setOrderedLenses] = useState<LensDefinition[]>([])
  
  useEffect(() => {
    async function loadLenses() {
      const dbLenses = await getAllLenses()
      const order = getLensOrderSync()
      const orderMap = new Map(order.map((key, idx) => [key, idx]))
      const ordered = [...dbLenses].sort((a, b) => {
        const aIdx = orderMap.get(a.key) ?? 999
        const bIdx = orderMap.get(b.key) ?? 999
        return aIdx - bIdx
      })
      setOrderedLenses(ordered)
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

  function moveLens(lensKey: LensKey, direction: 'up' | 'down') {
    const currentOrder = orderedLenses.map(l => l.key)
    const index = currentOrder.indexOf(lensKey)
    if (index === -1) return

    const newOrder = [...currentOrder]
    if (direction === 'up' && index > 0) {
      [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]]
    } else if (direction === 'down' && index < newOrder.length - 1) {
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]]
    } else {
      return
    }

    saveLensOrder(newOrder)
    // Trigger order change event to notify other components
    window.dispatchEvent(new CustomEvent('lensOrderUpdated'))
    // Reload lenses to reflect new order
    async function reloadLenses() {
      const dbLenses = await getAllLenses()
      const order = getLensOrderSync()
      const orderMap = new Map(order.map((key, idx) => [key, idx]))
      const ordered = [...dbLenses].sort((a, b) => {
        const aIdx = orderMap.get(a.key) ?? 999
        const bIdx = orderMap.get(b.key) ?? 999
        return aIdx - bIdx
      })
      setOrderedLenses(ordered)
    }
    reloadLenses()
    onOrderChange?.()
  }

  return (
    <aside className="w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 h-full p-4">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Lenses</h2>
        <div className="mt-2 flex gap-2 flex-wrap">
          <button className="px-2 py-1 text-xs rounded border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" onClick={onShowAll}>Show all</button>
          <button className="px-2 py-1 text-xs rounded border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" onClick={onHideAll}>Hide all</button>
          {filteredLens && (
            <button 
              className="px-2 py-1 text-xs rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40" 
              onClick={() => onFilterLens?.(null)}
              title="Clear filter"
            >
              Clear filter
            </button>
          )}
        </div>
      </div>
      <ul className="space-y-1">
        {orderedLenses.map((l, idx) => (
          <li key={l.key} className="flex items-center gap-1">
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => moveLens(l.key, 'up')}
                disabled={idx === 0}
                className="px-1 py-0.5 text-[10px] rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Move up"
              >
                ↑
              </button>
              <button
                onClick={() => moveLens(l.key, 'down')}
                disabled={idx === orderedLenses.length - 1}
                className="px-1 py-0.5 text-[10px] rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Move down"
              >
                ↓
              </button>
            </div>
            <div className="flex-1 flex items-center gap-2">
              <input
                type="checkbox"
                checked={visible[l.key] ?? false}
                onChange={() => onToggle(l.key)}
                className="cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              />
              <span 
                className={`text-sm flex-1 px-2 py-2 rounded hover:bg-white/60 dark:hover:bg-slate-800/60 cursor-pointer ${
                  filteredLens === l.key ? 'font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
                onClick={(e) => {
                  e.stopPropagation()
                  onFilterLens?.(filteredLens === l.key ? null : l.key)
                }}
                title={filteredLens === l.key ? "Click to show all lenses" : "Click to filter view to this lens only"}
              >
                {l.label}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  )
}




