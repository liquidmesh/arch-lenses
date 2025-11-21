import { LENSES, type LensKey } from '../types'

interface SidebarProps {
  visible: Record<LensKey, boolean>
  onToggle: (lens: LensKey) => void
  onShowAll: () => void
  onHideAll: () => void
}

export function Sidebar({ visible, onToggle, onShowAll, onHideAll }: SidebarProps) {
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
        {LENSES.map(l => (
          <li key={l.key}>
            <label className="flex items-center gap-2 px-2 py-2 rounded hover:bg-white/60 dark:hover:bg-slate-800/60 cursor-pointer">
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




