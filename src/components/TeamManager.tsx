import { useEffect, useState, useMemo } from 'react'
import { db } from '../db'
import { type TeamMember, type MeetingNote, type Task, LENSES, type ItemRecord, type TeamType } from '../types'
import { TaskDialog } from './TaskDialog'
type ViewType = 'main' | 'diagram' | 'architects' | 'stakeholders' | 'manage-team' | 'meeting-notes'

interface TeamManagerProps {
  initialPersonName?: string
  onSaved?: () => void
  onOpenMeetingNote?: (noteId: number) => void
  onNavigate: (view: ViewType) => void
}

export function TeamManager({ initialPersonName, onSaved, onOpenMeetingNote, onNavigate: _onNavigate }: TeamManagerProps) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [manager, setManager] = useState('')
  const [team, setTeam] = useState<TeamType>('Architecture')
  const [searchQuery, setSearchQuery] = useState('')
  const [teamFilter, setTeamFilter] = useState<'All' | 'Architecture' | 'Business Stakeholder' | 'Tech Stakeholder'>('All')
  const [referencedNotes, setReferencedNotes] = useState<MeetingNote[]>([])
  const [assignedTasks, setAssignedTasks] = useState<Task[]>([])
  const [itemMap, setItemMap] = useState<Map<number, { name: string; lens: string }>>(new Map())
  const [allItems, setAllItems] = useState<ItemRecord[]>([])
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  useEffect(() => {
    loadMembers().then(async () => {
      if (initialPersonName) {
        // Wait a bit for state to update, then find the person
        const all = await db.teamMembers.toArray()
        const member = all.find(m => m.name === initialPersonName)
        if (member) {
          startEdit(member)
        } else {
          // Person doesn't exist in team members, create new entry
          setName(initialPersonName)
          await loadTasksForPerson(initialPersonName)
        }
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPersonName])

  async function loadMembers() {
    const all = await db.teamMembers.toArray()
    setMembers(all.sort((a, b) => a.name.localeCompare(b.name)))
    
    // Load meeting notes that reference the current person (if editing)
    if (editingId && name) {
      await loadReferencedNotes(name)
      await loadTasksForPerson(name)
    } else if (initialPersonName && !editingId) {
      await loadReferencedNotes(initialPersonName)
      await loadTasksForPerson(initialPersonName)
    } else {
      setReferencedNotes([])
      setAssignedTasks([])
    }
    
    // Load item map for displaying task item references
    await loadItemMap()
    
    // Load all items to determine related lenses
    const items = await db.items.toArray()
    setAllItems(items)
  }
  
  async function loadItemMap() {
    const { getAllItemNames } = await import('../db')
    const items = await getAllItemNames()
    const map = new Map<number, { name: string; lens: string }>()
    items.forEach(item => {
      map.set(item.id, { name: item.name, lens: item.lens })
    })
    setItemMap(map)
  }
  
  async function loadTasksForPerson(personName: string) {
    const allTasks = await db.tasks.toArray()
    const personTasks = allTasks
      .filter(task => task.assignedTo?.toLowerCase() === personName.toLowerCase())
      .sort((a, b) => {
        const aCompleted = !!a.completedAt
        const bCompleted = !!b.completedAt
        if (aCompleted !== bCompleted) {
          return aCompleted ? 1 : -1 // Open tasks (false) come before completed (true)
        }
        const aCreated = a.createdAt || 0
        const bCreated = b.createdAt || 0
        return bCreated - aCreated // Newer tasks first
      })
    setAssignedTasks(personTasks)
  }
  
  async function loadReferencedNotes(personName: string) {
    // Find notes where person is mentioned as participant
    const allNotes = await db.meetingNotes.toArray()
    const participantNotes = allNotes.filter(note => 
      note.participants.toLowerCase().includes(personName.toLowerCase())
    )
    
    // Find notes where person is mentioned in tasks (@ mentions)
    const allTasks = await db.tasks.toArray()
    const personTasks = allTasks.filter(task => 
      task.assignedTo?.toLowerCase() === personName.toLowerCase()
    )
    const taskNoteIds = new Set(personTasks.map(t => t.meetingNoteId).filter((id): id is number => id !== undefined))
    const taskNotes = taskNoteIds.size > 0 ? await db.meetingNotes.bulkGet(Array.from(taskNoteIds)) : []
    
    // Combine and deduplicate by note ID
    const allReferenced = [...participantNotes, ...taskNotes.filter((n): n is MeetingNote => n !== undefined)]
    // Use Map to ensure each note ID appears only once
    const uniqueNotesMap = new Map<number, MeetingNote>()
    allReferenced.forEach(note => {
      if (note.id && !uniqueNotesMap.has(note.id)) {
        uniqueNotesMap.set(note.id, note)
      }
    })
    const uniqueNotes = Array.from(uniqueNotesMap.values())
    setReferencedNotes(uniqueNotes.sort((a, b) => b.dateTime - a.dateTime))
  }

  async function save() {
    if (!name.trim()) {
      alert('Name is required')
      return
    }

    const now = Date.now()
    try {
      if (editingId) {
        await db.teamMembers.update(editingId, {
          name: name.trim(),
          manager: manager.trim() || undefined,
          team: team,
          updatedAt: now,
        })
      } else {
        // Check for duplicate name
        const existing = await db.teamMembers.where('name').equals(name.trim()).first()
        if (existing) {
          alert('A team member with this name already exists')
          return
        }
        await db.teamMembers.add({
          name: name.trim(),
          manager: manager.trim() || undefined,
          team: team,
          createdAt: now,
          updatedAt: now,
        })
      }
      await loadMembers()
      const savedName = name.trim()
      setEditingId(null)
      setName('')
      setManager('')
      setTeam('Architecture')
      onSaved?.()
      if (savedName) {
        // Reload referenced notes and tasks for the saved person
        await loadReferencedNotes(savedName)
        await loadTasksForPerson(savedName)
      }
    } catch (e) {
      alert('Error saving team member')
    }
  }

  async function deleteMember(id: number) {
    if (!confirm('Delete this team member?')) return
    await db.teamMembers.delete(id)
    await loadMembers()
  }

  async function startEdit(member: TeamMember) {
    setEditingId(member.id!)
    setName(member.name)
    setManager(member.manager || '')
    setTeam(member.team || 'Architecture')
    await loadReferencedNotes(member.name)
    await loadTasksForPerson(member.name)
  }

  function cancelEdit() {
    setEditingId(null)
    setName('')
    setManager('')
    setTeam('Architecture')
  }

  // Get unique manager names for autocomplete
  const managerOptions = Array.from(new Set(members.map(m => m.manager).filter(Boolean)))

  // Filter members based on search query and team filter
  const filteredMembers = members.filter(member => {
    // Apply team filter
    if (teamFilter !== 'All') {
      const memberTeam = member.team || 'Architecture'
      if (memberTeam !== teamFilter) return false
    }
    
    // Apply search query filter
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    return (
      member.name.toLowerCase().includes(query) ||
      (member.manager && member.manager.toLowerCase().includes(query))
    )
  })

  // Calculate related items for the current person (name or initialPersonName)
  const relatedItems = useMemo(() => {
    const personName = name || initialPersonName
    if (!personName || allItems.length === 0) return []
    
    const items: Array<{ name: string; lens: string }> = []
    allItems.forEach(item => {
      const personNameLower = personName.toLowerCase()
      if (
        item.primaryArchitect?.toLowerCase() === personNameLower ||
        item.secondaryArchitects.some(arch => arch.trim().toLowerCase() === personNameLower) ||
        item.businessContact?.toLowerCase() === personNameLower ||
        item.techContact?.toLowerCase() === personNameLower
      ) {
        const lensLabel = LENSES.find(l => l.key === item.lens)?.label || item.lens
        items.push({ name: item.name, lens: lensLabel })
      }
    })
    // Sort by lens, then by item name
    return items.sort((a, b) => {
      if (a.lens !== b.lens) return a.lens.localeCompare(b.lens)
      return a.name.localeCompare(b.name)
    })
  }, [name, initialPersonName, allItems])

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-900">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-xl font-semibold">Manage Team</h1>
      </div>
      <div className="flex-1 flex min-h-0 p-4 gap-4">
        {/* Left side: Team Members List */}
        <div className="w-80 flex-shrink-0 flex flex-col border-r border-slate-200 dark:border-slate-800 pr-4">
          <div className="flex-shrink-0 mb-3">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium">Team Members ({filteredMembers.length}{searchQuery && ` of ${members.length}`})</h4>
            </div>
            {members.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No team members added yet</p>
            ) : (
              <>
                <div className="mb-3">
                  <select
                    value={teamFilter}
                    onChange={e => setTeamFilter(e.target.value as typeof teamFilter)}
                    className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900"
                  >
                    <option value="All">All</option>
                    <option value="Architecture">Architecture</option>
                    <option value="Business Stakeholder">Business Stakeholder</option>
                    <option value="Tech Stakeholder">Tech Stakeholder</option>
                  </select>
                </div>
                <div className="mb-3">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-700 rounded"
                    placeholder="Search by name or manager..."
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            {members.length === 0 ? null : (
              <>
                {filteredMembers.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No team members match your search</p>
                ) : (
                  <div className="h-full overflow-y-scroll overflow-x-hidden space-y-2 pr-2">
                    {filteredMembers.map(member => (
                      <div
                        key={member.id}
                        onClick={() => startEdit(member)}
                        className={`flex items-center justify-between p-3 border rounded cursor-pointer transition-colors ${
                          editingId === member.id
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{member.name}</div>
                          {member.manager && (
                            <div className="text-sm text-slate-500 dark:text-slate-400">
                              Manager: {member.manager}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              startEdit(member)
                            }}
                            className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteMember(member.id!)
                            }}
                            className="px-2 py-1 text-sm border border-red-300 dark:border-red-700 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right side: Team Member Details */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          <div className="border border-slate-200 dark:border-slate-800 rounded p-4">
            <h4 className="font-medium mb-3">
              {editingId ? 'Edit Team Member' : 'Add Team Member'}
            </h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full px-2 py-1 border border-slate-300 dark:border-slate-700 rounded"
                    placeholder="Team member name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Manager</label>
                  <input
                    type="text"
                    value={manager}
                    onChange={e => setManager(e.target.value)}
                    list="manager-list"
                    className="w-full px-2 py-1 border border-slate-300 dark:border-slate-700 rounded"
                    placeholder="Manager name (optional)"
                  />
                  <datalist id="manager-list">
                    {managerOptions.map(m => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Team</label>
                  <select
                    value={team}
                    onChange={e => setTeam(e.target.value as TeamType)}
                    className="w-full px-2 py-1 border border-slate-300 dark:border-slate-700 rounded"
                  >
                    <option value="Architecture">Architecture</option>
                    <option value="Business Stakeholder">Business Stakeholder</option>
                    <option value="Tech Stakeholder">Tech Stakeholder</option>
                  </select>
                </div>
              </div>
              {(name || initialPersonName) && relatedItems.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-1">Related Architecture Items</label>
                  <div className="border border-slate-200 dark:border-slate-800 rounded p-2 bg-slate-50 dark:bg-slate-900/50 max-h-48 overflow-y-auto">
                    <div className="flex flex-wrap gap-1">
                      {relatedItems.map((item, idx) => (
                        <span
                          key={`${item.lens}-${item.name}-${idx}`}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                          title={`${item.lens}: ${item.name}`}
                        >
                          {item.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-3">
              <div className="flex gap-2">
                <button
                  onClick={save}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  {editingId ? 'Update' : 'Add'}
                </button>
                {editingId && (
                  <button
                    onClick={cancelEdit}
                    className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
            
            {/* Show referenced meeting notes and tasks when editing a person */}
            {(editingId || (initialPersonName && !editingId)) && (
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="grid grid-cols-3 gap-4">
                  {/* Meeting Notes Section */}
                  <div className="col-span-1">
                    <h4 className="font-medium mb-3 text-sm">Referenced in Meeting Notes</h4>
                    {referencedNotes.length > 0 ? (
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {referencedNotes.map(note => (
                          <button
                            key={note.id}
                            onClick={() => onOpenMeetingNote?.(note.id!)}
                            className="w-full text-left text-sm p-2 border border-slate-200 dark:border-slate-800 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                          >
                            <div className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                              {note.title || '(Untitled)'}
                            </div>
                            <div className="text-slate-600 dark:text-slate-400 text-xs mt-1">
                              {new Date(note.dateTime).toLocaleString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500 dark:text-slate-400">No meeting notes</div>
                    )}
                  </div>
                  
                  {/* Tasks Section */}
                  <div className="col-span-2">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-medium text-sm">Tasks Assigned</h4>
                      <button
                        onClick={() => {
                          setEditingTask(null)
                          setTaskDialogOpen(true)
                        }}
                        className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                      >
                        + Add Task
                      </button>
                    </div>
                    {assignedTasks.length > 0 ? (
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {assignedTasks.map((task) => {
                          const note = task.meetingNoteId ? referencedNotes.find(n => n.id === task.meetingNoteId) : undefined
                          const lensLabel = (lens: string) => LENSES.find(l => l.key === lens)?.label || lens
                          const isCompleted = !!task.completedAt
                          
                          return (
                            <div
                              key={task.id}
                              className={`text-sm p-2 border border-slate-200 dark:border-slate-800 rounded flex items-center gap-2 ${
                                isCompleted ? 'opacity-60 line-through' : ''
                              }`}
                            >
                              <button
                                onClick={async () => {
                                  const now = Date.now()
                                  await db.tasks.update(task.id!, {
                                    completedAt: isCompleted ? undefined : now,
                                    updatedAt: now,
                                  })
                                  await loadTasksForPerson(name || initialPersonName || '')
                                }}
                                className={`flex-shrink-0 ${
                                  isCompleted 
                                    ? 'text-green-600 hover:text-slate-500' 
                                    : 'text-slate-500 hover:text-green-600'
                                }`}
                                title={isCompleted ? 'Mark as incomplete' : 'Mark as complete'}
                              >
                                {isCompleted ? '✓' : '○'}
                              </button>
                              <span className={isCompleted ? 'text-slate-500' : ''}>
                                {task.description}
                              </span>
                              {task.itemReferences && task.itemReferences.length > 0 && (
                                <span className="text-xs text-slate-500 flex-shrink-0">
                                  ({task.itemReferences.map((itemId, idx) => {
                                    const item = itemMap.get(itemId)
                                    return item ? (
                                      <span key={itemId}>
                                        {idx > 0 && ', '}
                                        {lensLabel(item.lens)}: {item.name}
                                      </span>
                                    ) : null
                                  })})
                                </span>
                              )}
                              {note && (
                                <button
                                  onClick={() => onOpenMeetingNote?.(note.id!)}
                                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
                                >
                                  {note.title || '(Untitled)'}
                                </button>
                              )}
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
                                  onClick={async () => {
                                    if (confirm('Delete this task?')) {
                                      await db.tasks.delete(task.id!)
                                      await loadTasksForPerson(name || initialPersonName || '')
                                    }
                                  }}
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
                    ) : (
                      <div className="text-sm text-slate-500 dark:text-slate-400">No tasks assigned</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <TaskDialog
        open={taskDialogOpen}
        onClose={() => {
          setTaskDialogOpen(false)
          setEditingTask(null)
        }}
        onSaved={async () => {
          await loadTasksForPerson(name || initialPersonName || '')
          setEditingTask(null)
        }}
        initialAssignedTo={name || initialPersonName}
        task={editingTask}
      />
    </div>
  )
}

