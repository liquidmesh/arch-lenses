import { useState, useEffect } from 'react'
import { type LensKey } from '../types'
import { getOrderedLenses, saveLensOrder } from '../utils/lensOrder'

interface SidebarProps {
  visible: Record<LensKey, boolean>
  onToggle: (lens: LensKey) => void
  onShowAll: () => void
  onHideAll: () => void
  onOrderChange?: () => void
}

export function Sidebar({ visible, onToggle, onShowAll, onHideAll, onOrderChange }: SidebarProps) {
  const [orderedLenses, setOrderedLenses] = useState(getOrderedLenses())

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
    setOrderedLenses(getOrderedLenses())
    onOrderChange?.()
  }

  return (
    <aside className="w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 h-full p-4">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Lenses</h2>
        <div className="mt-2 flex gap-2">
          <button className="px-2 py-1 text-xs rounded border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" onClick={onShowAll}>Show all</button>
          <button className="px-2 py-1 text-xs rounded border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" onClick={onHideAll}>Hide all</button>
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
            <label className="flex-1 flex items-center gap-2 px-2 py-2 rounded hover:bg-white/60 dark:hover:bg-slate-800/60 cursor-pointer">
              <input
                type="checkbox"
                checked={visible[l.key]}
                onChange={() => onToggle(l.key)}
              />
              <span className="text-sm">{l.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </aside>
  )
}




