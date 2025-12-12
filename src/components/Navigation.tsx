type ViewType = 'main' | 'diagram' | 'architects' | 'stakeholders' | 'manage-team' | 'meeting-notes' | 'settings' | 'tasks' | 'divest-replacement'

interface NavigationProps {
  currentView: ViewType
  onNavigate: (view: ViewType) => void
}

export function Navigation({ currentView, onNavigate }: NavigationProps) {
  const navItems = [
    { id: 'main' as const, label: 'Architecture Lenses' },
    { id: 'diagram' as const, label: 'Architecture Relationship Diagram' },
    { id: 'architects' as const, label: 'People' },
    { id: 'manage-team' as const, label: 'Manage Team' },
    { id: 'meeting-notes' as const, label: 'Notes' },
    { id: 'tasks' as const, label: 'Tasks' },
    { id: 'divest-replacement' as const, label: 'Target View' },
    { id: 'settings' as const, label: 'Settings' },
  ]

  return (
    <nav className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2">
      <div className="flex gap-2 items-center">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              currentView === item.id
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium'
                : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  )
}

