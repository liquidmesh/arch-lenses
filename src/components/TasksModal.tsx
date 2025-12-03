import { useEffect, useMemo, useState } from 'react'
import { db, getAllItemNames } from '../db'
import { type Task, type MeetingNote, LENSES } from '../types'
import { TaskDialog } from './TaskDialog'

type ViewType = 'main' | 'diagram' | 'architects' | 'stakeholders' | 'manage-team' | 'meeting-notes' | 'manage-lenses' | 'tasks'

interface TasksModalProps {
  onEditPerson?: (personName: string) => void
  onOpenMeetingNote?: (noteId: number) => void
  onNavigate?: (view: ViewType) => void
}

type GroupBy = 'person' | 'item'

export function TasksModal({ onEditPerson, onOpenMeetingNote }: TasksModalProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [meetingNotes, setMeetingNotes] = useState<MeetingNote[]>([])
  const [itemMap, setItemMap] = useState<Map<number, { name: string; lens: string }>>(new Map())
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false)
  const [groupBy, setGroupBy] = useState<GroupBy>('person')
  const [searchQuery, setSearchQuery] = useState('')
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const [allTasks, allNotes, itemNames] = await Promise.all([
      db.tasks.toArray(),
      db.meetingNotes.toArray(),
      getAllItemNames(),
    ])
    setTasks(allTasks)
    setMeetingNotes(allNotes)
    
    // Build item map
    const map = new Map<number, { name: string; lens: string }>()
    itemNames.forEach(item => {
      map.set(item.id, { name: item.name, lens: item.lens })
    })
    setItemMap(map)
  }

  const lensLabel = (lens: string) => LENSES.find(l => l.key === lens)?.label || lens

  // Filter and group tasks
  const groupedTasks = useMemo(() => {
    // Filter by completion status
    let filtered = tasks
    if (showIncompleteOnly) {
      filtered = filtered.filter(t => !t.completedAt)
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(task => {
        // Search in description
        if (task.description && task.description.toLowerCase().includes(query)) return true
        
        // Search in assigned person
        if (task.assignedTo && task.assignedTo.toLowerCase().includes(query)) return true
        
        // Search in item names
        if (task.itemReferences && task.itemReferences.length > 0) {
          const itemNames = task.itemReferences
            .map(id => itemMap.get(id))
            .filter(Boolean)
            .map(item => `${lensLabel(item!.lens)}: ${item!.name}`.toLowerCase())
          if (itemNames.some(name => name.includes(query))) return true
        }
        
        // Search in meeting note title
        if (task.meetingNoteId) {
          const note = meetingNotes.find(n => n.id === task.meetingNoteId)
          if (note && note.title && note.title.toLowerCase().includes(query)) return true
        }
        
        return false
      })
    }

    // Group tasks
    if (groupBy === 'person') {
      const groups = new Map<string, Task[]>()
      filtered.forEach(task => {
        const key = task.assignedTo || '(Unassigned)'
        if (!groups.has(key)) {
          groups.set(key, [])
        }
        groups.get(key)!.push(task)
      })
      return groups
    } else {
      // Group by item
      const groups = new Map<string, Task[]>()
      filtered.forEach(task => {
        if (task.itemReferences && task.itemReferences.length > 0) {
          task.itemReferences.forEach(itemId => {
            const item = itemMap.get(itemId)
            if (item) {
              const key = `${lensLabel(item.lens)}: ${item.name}`
              if (!groups.has(key)) {
                groups.set(key, [])
              }
              groups.get(key)!.push(task)
            }
          })
        } else {
          // Tasks without items
          const key = '(No Item)'
          if (!groups.has(key)) {
            groups.set(key, [])
          }
          groups.get(key)!.push(task)
        }
      })
      return groups
    }
  }, [tasks, showIncompleteOnly, groupBy, searchQuery, itemMap, meetingNotes])

  async function handleToggleTaskComplete(task: Task) {
    const now = Date.now()
    await db.tasks.update(task.id!, {
      completedAt: task.completedAt ? undefined : now,
      updatedAt: now,
    })
    await loadData()
  }

  async function handleDeleteTask(task: Task) {
    if (confirm('Delete this task?')) {
      await db.tasks.delete(task.id!)
      await loadData()
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-900">
      <div className="flex items-center gap-4 p-4 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-xl font-semibold">Tasks</h1>
        <div className="flex items-center gap-4 ml-auto">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showIncompleteOnly}
              onChange={e => setShowIncompleteOnly(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Show incomplete only</span>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-sm">Group by:</span>
            <select
              value={groupBy}
              onChange={e => setGroupBy(e.target.value as GroupBy)}
              className="px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="person">Person</option>
              <option value="item">Architecture Lens Item</option>
            </select>
          </label>
          <input
            type="text"
            value={searchQuery || ''}
            onChange={e => setSearchQuery(e.target.value || '')}
            placeholder="Search tasks..."
            className="px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {Array.from(groupedTasks.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([groupKey, groupTasks]) => (
            <div key={groupKey} className="mb-6">
              <h2 className="text-lg font-semibold mb-3 text-slate-700 dark:text-slate-300">
                {groupKey}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {groupTasks.map(task => {
                  const note = task.meetingNoteId ? meetingNotes.find(n => n.id === task.meetingNoteId) : undefined
                  const isCompleted = !!task.completedAt
                  
                  return (
                    <div
                      key={task.id}
                      className={`text-sm p-2 border border-slate-200 dark:border-slate-800 rounded flex items-center gap-2 ${
                        isCompleted ? 'opacity-60 line-through' : ''
                      }`}
                    >
                      <button
                        onClick={() => handleToggleTaskComplete(task)}
                        className={`flex-shrink-0 ${
                          isCompleted 
                            ? 'text-green-600 hover:text-slate-500' 
                            : 'text-slate-500 hover:text-green-600'
                        }`}
                        title={isCompleted ? 'Mark as incomplete' : 'Mark as complete'}
                      >
                        {isCompleted ? '✓' : '○'}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className={isCompleted ? 'text-slate-500' : ''}>
                          {task.description}
                        </div>
                        {task.assignedTo && groupBy !== 'person' && (
                          <div className="text-slate-500 text-xs mt-1">
                            Assigned to: <button
                              onClick={() => onEditPerson?.(task.assignedTo!)}
                              className="text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              {task.assignedTo}
                            </button>
                          </div>
                        )}
                        {task.itemReferences && task.itemReferences.length > 0 && groupBy !== 'item' && (
                          <div className="text-slate-500 text-xs mt-1">
                            {task.itemReferences.map((itemId, idx) => {
                              const item = itemMap.get(itemId)
                              return item ? (
                                <span key={itemId}>
                                  {idx > 0 && ', '}
                                  {lensLabel(item.lens)}: {item.name}
                                </span>
                              ) : null
                            })}
                          </div>
                        )}
                        {note && (
                          <button
                            onClick={() => onOpenMeetingNote?.(note.id!)}
                            className="text-blue-600 dark:text-blue-400 hover:underline text-xs mt-1"
                          >
                            {note.title || '(Untitled)'}
                          </button>
                        )}
                        {task.completedAt && (
                          <div className="text-slate-400 text-xs mt-1">
                            Completed {new Date(task.completedAt).toLocaleString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 flex gap-1 ml-auto">
                        <button
                          onClick={() => {
                            setEditingTask(task)
                            setTaskDialogOpen(true)
                          }}
                          className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                          title="Edit task"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteTask(task)}
                          className="px-2 py-1 text-xs rounded border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400"
                          title="Delete task"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        {groupedTasks.size === 0 && (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">
            {searchQuery.trim() 
              ? 'No tasks match your search'
              : showIncompleteOnly 
                ? 'No incomplete tasks'
                : 'No tasks'}
          </div>
        )}
      </div>
      <TaskDialog
        open={taskDialogOpen}
        onClose={() => {
          setTaskDialogOpen(false)
          setEditingTask(null)
        }}
        onSaved={async () => {
          await loadData()
          setEditingTask(null)
        }}
        task={editingTask}
      />
    </div>
  )
}

