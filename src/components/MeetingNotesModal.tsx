import { useEffect, useState, useMemo } from 'react'
import { db, getAllItemNames } from '../db'
import { type MeetingNote, type Task, LENSES } from '../types'
import { MeetingNoteDialog } from './MeetingNoteDialog'

type ViewType = 'main' | 'diagram' | 'architects' | 'stakeholders' | 'manage-team' | 'meeting-notes'

interface MeetingNotesModalProps {
  initialNoteId?: number // Optional note ID to open/edit when modal opens
  onNoteDialogClose?: () => void // Callback when note dialog closes (to clear initialNoteId in parent)
  onNavigate: (view: ViewType) => void
}

export function MeetingNotesModal({ initialNoteId, onNoteDialogClose, onNavigate }: MeetingNotesModalProps) {
  const [notes, setNotes] = useState<MeetingNote[]>([])
  const [selectedNote, setSelectedNote] = useState<MeetingNote | null>(null)
  const [viewingNoteId, setViewingNoteId] = useState<number | null>(null) // Note being viewed in right panel
  const [dialogOpen, setDialogOpen] = useState(false)
  const [tasks, setTasks] = useState<Map<number, Task[]>>(new Map())
  const [refreshKey, setRefreshKey] = useState(0)
  const [itemMap, setItemMap] = useState<Map<number, { name: string; lens: string }>>(new Map())
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadNotes()
    loadTasks()
    loadItems()
  }, [refreshKey])

  async function loadItems() {
    const items = await getAllItemNames()
    const map = new Map<number, { name: string; lens: string }>()
    items.forEach(item => {
      map.set(item.id, { name: item.name, lens: item.lens })
    })
    setItemMap(map)
  }

  function lensLabel(lens: string): string {
    return LENSES.find(l => l.key === lens)?.label || lens
  }

  // Listen for edit meeting note event
  useEffect(() => {
    function handleEditMeetingNote(event: CustomEvent<{ noteId: number }>) {
      const note = notes.find(n => n.id === event.detail.noteId)
      if (note) {
        setSelectedNote(note)
        setDialogOpen(true)
        setHasOpenedInitialNote(false) // Switch from readonly to edit mode
      }
    }

    window.addEventListener('editMeetingNote', handleEditMeetingNote as EventListener)
    return () => {
      window.removeEventListener('editMeetingNote', handleEditMeetingNote as EventListener)
    }
  }, [notes])

  // Handle initialNoteId after notes are loaded
  const [hasOpenedInitialNote, setHasOpenedInitialNote] = useState(false)
  
  useEffect(() => {
    if (initialNoteId && notes.length > 0 && !dialogOpen && !hasOpenedInitialNote) {
      const note = notes.find(n => n.id === initialNoteId)
      if (note) {
        setSelectedNote(note)
        setViewingNoteId(note.id!)
        setDialogOpen(true)
        setHasOpenedInitialNote(true)
      }
    }
  }, [initialNoteId, notes, dialogOpen, hasOpenedInitialNote])
  
  // Set viewing note when notes are loaded
  useEffect(() => {
    if (notes.length > 0 && !viewingNoteId && !initialNoteId) {
      // Auto-select first note if none selected
      setViewingNoteId(notes[0].id!)
    }
  }, [notes, viewingNoteId, initialNoteId])

  useEffect(() => {
    if (!dialogOpen) {
      setHasOpenedInitialNote(false)
    }
  }, [dialogOpen])

  async function loadNotes() {
    const allNotes = await db.meetingNotes.orderBy('dateTime').reverse().toArray()
    setNotes(allNotes)
  }

  async function loadTasks() {
    const allTasks = await db.tasks.toArray()
    const tasksMap = new Map<number, Task[]>()
    allTasks.forEach(task => {
      const existing = tasksMap.get(task.meetingNoteId) || []
      existing.push(task)
      tasksMap.set(task.meetingNoteId, existing)
    })
    setTasks(tasksMap)
  }

  function formatDateTime(timestamp: number): string {
    const date = new Date(timestamp)
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function handleNewNote() {
    setSelectedNote(null)
    setDialogOpen(true)
  }

  function handleEditNote(note: MeetingNote) {
    setSelectedNote(note)
    setViewingNoteId(note.id!)
    setDialogOpen(true)
  }
  
  function handleViewNote(note: MeetingNote) {
    setViewingNoteId(note.id!)
  }
  
  const viewingNote = notes.find(n => n.id === viewingNoteId)

  function handleDeleteNote(note: MeetingNote) {
    if (!confirm('Delete this meeting note?')) return
    db.meetingNotes.delete(note.id!)
      .then(() => {
        // Also delete associated tasks
        return db.tasks.where('meetingNoteId').equals(note.id!).delete()
      })
      .then(() => {
        setRefreshKey(k => k + 1)
      })
  }

  async function handleToggleTaskComplete(task: Task) {
    const now = Date.now()
    if (task.completedAt) {
      // Mark as incomplete
      await db.tasks.update(task.id!, {
        completedAt: undefined,
        updatedAt: now,
      })
    } else {
      // Mark as complete
      await db.tasks.update(task.id!, {
        completedAt: now,
        updatedAt: now,
      })
    }
    setRefreshKey(k => k + 1)
  }

  const noteTasks = useMemo(() => {
    return (noteId: number) => tasks.get(noteId) || []
  }, [tasks])

  if (dialogOpen) {
    return (
      <MeetingNoteDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false)
          setSelectedNote(null)
          setHasOpenedInitialNote(false)
          // If opened from a link (initialNoteId), navigate back to main
          // If opened from list, just close the dialog (stay on list)
          if (initialNoteId) {
            onNoteDialogClose?.()
            onNavigate('main') // Navigate back to main view
          }
        }}
        note={selectedNote}
        readonly={!!initialNoteId && hasOpenedInitialNote} // Read-only when opened from a link and not yet edited
        onSaved={() => {
          setRefreshKey(k => k + 1)
          // After saving, if opened from a link, navigate back to main
          // If opened from list, return to list
          if (initialNoteId) {
            setDialogOpen(false)
            setSelectedNote(null)
            setHasOpenedInitialNote(false)
            onNoteDialogClose?.()
            onNavigate('main') // Navigate back to main view
          } else {
            // Opened from list - return to list
            setDialogOpen(false)
            setSelectedNote(null)
          }
        }}
      />
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-900">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-semibold">Meeting Notes</h1>
          <button
            onClick={handleNewNote}
            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            New Meeting Note
          </button>
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden">
        {/* Left side: Note list */}
        <div className="w-80 border-r border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-200 dark:border-slate-800">
            <input
              type="text"
              placeholder="Search notes and tasks..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full px-2 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
            <div className="text-sm text-slate-600 dark:text-slate-400 mt-2">
              {notes.length} meeting note{notes.length !== 1 ? 's' : ''}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {notes.length === 0 ? (
              <div className="p-4 text-center text-slate-500 dark:text-slate-400">
                No meeting notes yet. Click "New Meeting Note" to create one.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {(() => {
                  const q = searchQuery.toLowerCase().trim()
                  const filteredNotes = q ? notes.filter(note => {
                    // Search in title
                    if (note.title?.toLowerCase().includes(q)) return true
                    // Search in participants
                    if (note.participants?.toLowerCase().includes(q)) return true
                    // Search in content
                    if (note.content?.toLowerCase().includes(q)) return true
                    // Search in tasks
                    const noteTasksList = noteTasks(note.id!)
                    const taskMatches = noteTasksList.some(task => 
                      task.description?.toLowerCase().includes(q) ||
                      task.assignedTo?.toLowerCase().includes(q)
                    )
                    if (taskMatches) return true
                    return false
                  }) : notes
                  
                  return filteredNotes.length === 0 ? (
                    <div className="p-4 text-center text-slate-500 dark:text-slate-400">
                      No notes match your search
                    </div>
                  ) : (
                    filteredNotes.map(note => (
                      <button
                        key={note.id}
                        onClick={() => handleViewNote(note)}
                        className={`w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                          viewingNoteId === note.id ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-600' : ''
                        }`}
                      >
                        <div className="font-medium">{note.title || '(Untitled)'}</div>
                        <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                          {formatDateTime(note.dateTime)}
                        </div>
                      </button>
                    ))
                  )
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Right side: Note details */}
        <div className="flex-1 overflow-y-auto p-4">
          {viewingNote ? (
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-semibold">{viewingNote.title || '(Untitled)'}</h2>
                  <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {formatDateTime(viewingNote.dateTime)} • Participants: {viewingNote.participants || '(none)'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditNote(viewingNote)}
                    className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteNote(viewingNote)}
                    className="px-2 py-1 text-sm border border-red-300 dark:border-red-700 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Tasks Summary */}
              {(() => {
                const noteTasksList = noteTasks(viewingNote.id!)
                const completedTasks = noteTasksList.filter(t => t.completedAt)
                const pendingTasks = noteTasksList.filter(t => !t.completedAt)
                
                return noteTasksList.length > 0 ? (
                  <div className="border border-slate-200 dark:border-slate-800 rounded p-4">
                    <div className="text-sm font-medium mb-2">Tasks:</div>
                    <div className="space-y-1">
                      {pendingTasks.map(task => (
                        <div key={task.id} className="text-sm flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => handleToggleTaskComplete(task)}
                            className="text-slate-500 hover:text-green-600"
                            title="Mark as complete"
                          >
                            ○
                          </button>
                          <span>{task.description}</span>
                          {task.assignedTo && (
                            <span className="text-xs text-slate-500">@ {task.assignedTo}</span>
                          )}
                          {task.itemReferences && task.itemReferences.length > 0 && (
                            <span className="text-xs text-slate-500">
                              {task.itemReferences.map((itemId, idx) => {
                                const item = itemMap.get(itemId)
                                return item ? (
                                  <span key={itemId}>
                                    {idx > 0 && ', '}
                                    {lensLabel(item.lens)}: {item.name}
                                  </span>
                                ) : null
                              })}
                            </span>
                          )}
                        </div>
                      ))}
                      {completedTasks.map(task => (
                        <div key={task.id} className="text-sm flex items-center gap-2 line-through text-slate-500 flex-wrap">
                          <button
                            onClick={() => handleToggleTaskComplete(task)}
                            className="text-green-600 hover:text-slate-500"
                            title="Mark as incomplete"
                          >
                            ✓
                          </button>
                          <span>{task.description}</span>
                          {task.assignedTo && (
                            <span className="text-xs">@ {task.assignedTo}</span>
                          )}
                          {task.itemReferences && task.itemReferences.length > 0 && (
                            <span className="text-xs text-slate-500">
                              {task.itemReferences.map((itemId, idx) => {
                                const item = itemMap.get(itemId)
                                return item ? (
                                  <span key={itemId}>
                                    {idx > 0 && ', '}
                                    {lensLabel(item.lens)}: {item.name}
                                  </span>
                                ) : null
                              })}
                            </span>
                          )}
                          {task.completedAt && (
                            <span className="text-xs text-slate-400">
                              (completed {formatDateTime(task.completedAt)})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null
              })()}

              {/* Related Architecture Lens Items */}
              {viewingNote.relatedItems && viewingNote.relatedItems.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-800 rounded p-4">
                  <div className="text-sm font-medium mb-2">Related Architecture Lens Items:</div>
                  <div className="flex flex-wrap gap-1">
                    {viewingNote.relatedItems.map(itemId => {
                      const item = itemMap.get(itemId)
                      return item ? (
                        <span
                          key={itemId}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-800"
                        >
                          {lensLabel(item.lens)}: {item.name}
                        </span>
                      ) : null
                    })}
                  </div>
                </div>
              )}

              {/* Note Content */}
              {viewingNote.content && (
                <div className="border border-slate-200 dark:border-slate-800 rounded p-4">
                  <div 
                    className="text-sm prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: viewingNote.content }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              Select a note from the list to view details
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

