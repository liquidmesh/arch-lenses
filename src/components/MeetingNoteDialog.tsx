import { useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import OrderedList from '@tiptap/extension-ordered-list'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { Extension } from '@tiptap/core'
import { db, getAllPeopleNames, getAllItemNames } from '../db'
import { type MeetingNote, type Task } from '../types'
import { Modal } from './Modal'
import { LENSES } from '../types'
import { AutocompleteInput, CommaSeparatedAutocompleteInput } from './AutocompleteInput'

// Custom FontSize extension
const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() {
    return {
      types: ['textStyle'],
    }
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: element => element.style.fontSize?.replace('px', '') || null,
            renderHTML: attributes => {
              if (!attributes.fontSize) {
                return {}
              }
              return {
                style: `font-size: ${attributes.fontSize}px`,
              }
            },
          },
        },
      },
    ]
  },
  addCommands() {
    return {
      setFontSize: (fontSize: string) => ({ chain }) => {
        return chain()
          .setMark('textStyle', { fontSize })
          .run()
      },
      unsetFontSize: () => ({ chain }) => {
        return chain()
          .setMark('textStyle', { fontSize: null })
          .removeEmptyTextStyle()
          .run()
      },
    }
  },
})

interface MeetingNoteDialogProps {
  open: boolean
  onClose: () => void
  note?: MeetingNote | null
  onSaved?: () => void
  readonly?: boolean // If true, show in read-only mode
  onEditPerson?: (personName: string) => void // Callback to navigate to person view
}

interface TaskFormData {
  id?: number
  description: string
  assignedTo: string
  itemIds: number[]
}

export function MeetingNoteDialog({ open, onClose, note, onSaved, readonly = false, onEditPerson }: MeetingNoteDialogProps) {
  const isNew = !note?.id
  const [title, setTitle] = useState(note?.title || '')
  const [participants, setParticipants] = useState(note?.participants || '')
  const [dateTime, setDateTime] = useState(() => {
    if (note?.dateTime) {
      const date = new Date(note.dateTime)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      return `${year}-${month}-${day}T${hours}:${minutes}`
    }
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  })
  const [relatedItems, setRelatedItems] = useState<number[]>(note?.relatedItems || [])
  
  // Rich text editor (only for edit mode, not readonly)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable default ordered list to use our custom one
        orderedList: false,
      }),
      OrderedList.configure({
        HTMLAttributes: {
          class: 'ordered-list',
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 dark:text-blue-400 underline cursor-pointer',
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'border-collapse border border-slate-300 dark:border-slate-700',
        },
      }),
      TableRow.configure({
        HTMLAttributes: {
          class: 'border border-slate-300 dark:border-slate-700',
        },
      }),
      TableHeader.configure({
        HTMLAttributes: {
          class: 'border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 font-semibold px-2 py-1',
        },
      }),
      TableCell.configure({
        HTMLAttributes: {
          class: 'border border-slate-300 dark:border-slate-700 px-2 py-1',
        },
      }),
      TextStyle,
      Color,
      FontSize,
    ],
    content: note?.content || '',
    editable: !readonly,
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none px-3 py-2 min-h-full',
      },
    },
  })
  
  // Update editor content when note changes
  useEffect(() => {
    if (editor && note?.content !== undefined) {
      editor.commands.setContent(note.content || '')
    } else if (editor && !note && open && !readonly) {
      editor.commands.setContent('')
    }
  }, [editor, note?.id, note?.content, open, readonly])
  const [tasks, setTasks] = useState<TaskFormData[]>([])
  const [existingTasks, setExistingTasks] = useState<Task[]>([]) // For edit mode - actual Task objects with completion status
  const [peopleNames, setPeopleNames] = useState<string[]>([])
  const [itemNames, setItemNames] = useState<Array<{ id: number; name: string; lens: string }>>([])
  const [itemMap, setItemMap] = useState<Map<number, { name: string; lens: string }>>(new Map())
  const [noteTasks, setNoteTasks] = useState<Task[]>([]) // For readonly mode

  useEffect(() => {
    if (open) {
      loadPeopleNames()
      loadItemNames()
      if (note?.id) {
        if (readonly) {
          loadNoteTasksForReadonly(note.id)
        } else {
          // In edit mode, load both TaskFormData for new tasks and Task objects for existing tasks
          loadTasks(note.id)
          loadExistingTasks(note.id)
        }
      } else {
        setTasks([])
        setExistingTasks([])
        setNoteTasks([])
      }
    }
  }, [open, note?.id, readonly])

  useEffect(() => {
    if (note) {
      setTitle(note.title || '')
      setParticipants(note.participants || '')
      if (note.dateTime) {
        const date = new Date(note.dateTime)
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        setDateTime(`${year}-${month}-${day}T${hours}:${minutes}`)
      }
      // Editor content is set via useEffect
    } else if (open && isNew) {
      setTitle('')
      setParticipants('')
      setRelatedItems([])
      // Editor content is cleared via useEffect
      const now = new Date()
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      const hours = String(now.getHours()).padStart(2, '0')
      const minutes = String(now.getMinutes()).padStart(2, '0')
      setDateTime(`${year}-${month}-${day}T${hours}:${minutes}`)
      setTasks([])
      // Editor content is cleared via useEffect
    }
  }, [note, open, isNew])

  async function loadPeopleNames() {
    const names = await getAllPeopleNames()
    setPeopleNames(names)
  }

  async function loadItemNames() {
    const items = await getAllItemNames()
    setItemNames(items)
    const map = new Map<number, { name: string; lens: string }>()
    items.forEach(item => {
      map.set(item.id, { name: item.name, lens: item.lens })
    })
    setItemMap(map)
  }

  async function loadTasks(_meetingNoteId: number) {
    // This loads tasks as TaskFormData for editing (new tasks only)
    // Existing tasks are loaded separately via loadExistingTasks
    setTasks([])
  }

  async function loadExistingTasks(meetingNoteId: number) {
    const tasks = await db.tasks.where('meetingNoteId').equals(meetingNoteId).toArray()
    setExistingTasks(tasks)
  }

  async function loadNoteTasksForReadonly(meetingNoteId: number) {
    const allTasks = await db.tasks.where('meetingNoteId').equals(meetingNoteId).toArray()
    setNoteTasks(allTasks)
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

  async function handleToggleTaskComplete(task: Task) {
    const now = Date.now()
    if (task.completedAt) {
      await db.tasks.update(task.id!, {
        completedAt: undefined,
        updatedAt: now,
      })
    } else {
      await db.tasks.update(task.id!, {
        completedAt: now,
        updatedAt: now,
      })
    }
    if (note?.id) {
      if (readonly) {
        await loadNoteTasksForReadonly(note.id)
      } else {
        await loadExistingTasks(note.id)
      }
    }
    onSaved?.() // Refresh parent view
  }

  async function handleUpdateTask(task: Task, updates: { description?: string; assignedTo?: string; itemReferences?: number[] }) {
    const now = Date.now()
    // If updating itemReferences, merge with existing ones to avoid race conditions
    if (updates.itemReferences !== undefined) {
      const currentTask = await db.tasks.get(task.id!)
      if (currentTask) {
        const currentRefs = currentTask.itemReferences || []
        // If the new array is longer, it means we're adding; if shorter, we're removing
        // For adding, merge to ensure we don't lose any items
        if (updates.itemReferences.length > currentRefs.length) {
          // Adding items - merge arrays and remove duplicates
          const merged = [...new Set([...currentRefs, ...updates.itemReferences])]
          updates.itemReferences = merged
        }
      }
    }
    await db.tasks.update(task.id!, {
      ...updates,
      updatedAt: now,
    })
    if (note?.id) {
      await loadExistingTasks(note.id)
    }
  }

  async function handleDeleteExistingTask(taskId: number) {
    await db.tasks.delete(taskId)
    if (note?.id) {
      await loadExistingTasks(note.id)
    }
  }

  async function handleDeleteNote() {
    if (!note?.id) return
    if (!confirm('Delete this meeting note?')) return
    await db.meetingNotes.delete(note.id)
    await db.tasks.where('meetingNoteId').equals(note.id).delete()
    onSaved?.()
    onClose()
  }

  function handleEditNote() {
    // Switch to edit mode by dispatching edit event
    // This will be handled by MeetingNotesModal to switch from readonly to edit mode
    if (note?.id) {
      window.dispatchEvent(new CustomEvent('editMeetingNote', { detail: { noteId: note.id } }))
    }
  }

  function addTask() {
    setTasks([...tasks, { description: '', assignedTo: '', itemIds: [] }])
  }

  function updateTask(index: number, updates: Partial<TaskFormData>) {
    const updated = [...tasks]
    const currentTask = updated[index]
    if (!currentTask) return
    updated[index] = { 
      ...currentTask, 
      ...updates,
      // Ensure itemIds is always an array
      itemIds: updates.itemIds !== undefined ? updates.itemIds : (currentTask.itemIds || [])
    }
    setTasks(updated)
  }

  function removeTask(index: number) {
    setTasks(tasks.filter((_, i) => i !== index))
  }

  function addItemToTask(taskIndex: number, itemId: number) {
    const task = tasks[taskIndex]
    if (!task) return
    const currentItemIds = task.itemIds || []
    if (!currentItemIds.includes(itemId)) {
      updateTask(taskIndex, { itemIds: [...currentItemIds, itemId] })
    }
  }

  function removeItemFromTask(taskIndex: number, itemId: number) {
    const task = tasks[taskIndex]
    updateTask(taskIndex, { itemIds: task.itemIds.filter(id => id !== itemId) })
  }

  async function save() {
    if (!title.trim()) {
      alert('Title is required')
      return
    }
    
    // Convert local datetime to UTC timestamp
    const localDate = new Date(dateTime)
    const utcTimestamp = localDate.getTime()

    const now = Date.now()
    let meetingNoteId: number

    try {
      // Get HTML content from editor
      const htmlContent = editor?.getHTML() || ''
      
      if (isNew) {
        meetingNoteId = await db.meetingNotes.add({
          title: title.trim(),
          participants: participants.trim(),
          dateTime: utcTimestamp,
          content: htmlContent,
          relatedItems: relatedItems,
          createdAt: now,
          updatedAt: now,
        }) as number
      } else {
        meetingNoteId = note!.id!
        await db.meetingNotes.update(meetingNoteId, {
          title: title.trim(),
          participants: participants.trim(),
          dateTime: utcTimestamp,
          content: htmlContent,
          relatedItems: relatedItems,
          updatedAt: now,
        })
        // Don't delete existing tasks - they're managed separately via handleUpdateTask
      }

      // Save new tasks only (existing tasks are already saved via handleUpdateTask)
      const tasksToSave = tasks
        .filter(t => t.description.trim())
        .map(t => ({
          meetingNoteId,
          description: t.description.trim(),
          assignedTo: t.assignedTo.trim() || undefined,
          itemReferences: t.itemIds || [],
          createdAt: now,
          updatedAt: now,
        }))

      if (tasksToSave.length > 0) {
        await db.tasks.bulkAdd(tasksToSave)
        // Reload existing tasks to include the new ones
        await loadExistingTasks(meetingNoteId)
        setTasks([]) // Clear new tasks
      }

      onSaved?.()
      onClose()
    } catch (e) {
      console.error('Error saving meeting note:', e)
      alert('Error saving meeting note')
    }
  }

  function lensLabel(lens: string): string {
    return LENSES.find(l => l.key === lens)?.label || lens
  }

  // For readonly mode, show in list view format
  if (readonly && note) {
    const completedTasks = noteTasks.filter(t => t.completedAt)
    const pendingTasks = noteTasks.filter(t => !t.completedAt)

    return (
      <Modal 
        open={open} 
        onClose={onClose} 
        title="Meeting Note"
        wide
        footer={(
          <button className="px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-700" onClick={onClose}>Close</button>
        )}
      >
        <div className="border border-slate-200 dark:border-slate-800 rounded p-4">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="font-medium text-lg">{note.title || '(Untitled)'}</div>
              <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                {formatDateTime(note.dateTime)} • Participants: {note.participants ? (
                  note.participants.split(',').map((p, idx) => {
                    const name = p.trim()
                    return (
                      <span key={idx}>
                        {idx > 0 && ', '}
                        <button
                          onClick={() => onEditPerson?.(name)}
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {name}
                        </button>
                      </span>
                    )
                  })
                ) : '(none)'}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleEditNote}
                className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Edit
              </button>
              <button
                onClick={handleDeleteNote}
                className="px-2 py-1 text-sm border border-red-300 dark:border-red-700 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400"
              >
                Delete
              </button>
            </div>
          </div>

          {/* Tasks Summary */}
          {noteTasks.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
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
                      <button
                        onClick={() => onEditPerson?.(task.assignedTo!)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        @ {task.assignedTo}
                      </button>
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
          )}

          {/* Related Architecture Lens Items */}
          {note.relatedItems && note.relatedItems.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
              <div className="text-sm font-medium mb-2">Related Architecture Lens Items:</div>
              <div className="flex flex-wrap gap-1">
                {note.relatedItems.map(itemId => {
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

          {/* Note Content Preview */}
          {note.content && (
            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
              <div 
                className="text-sm ProseMirror prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: note.content }}
              />
            </div>
          )}
        </div>
      </Modal>
    )
  }

  // Edit mode (existing form)
  return (
    <Modal 
      open={open} 
      onClose={onClose} 
      title={isNew ? 'New Meeting Note' : 'Edit Meeting Note'}
      fullScreen
    >
      <div className="h-full flex flex-col">
        {/* Footer buttons at top */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 justify-end shrink-0">
          <button className="px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-700" onClick={onClose}>Cancel</button>
          <button className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white" onClick={save}>Save</button>
        </div>
        
        {/* Main content area with two columns */}
        <div className="flex-1 min-h-0 flex gap-4 p-4 overflow-hidden">
          {/* Left side: Other fields */}
          <div className="w-96 flex-shrink-0 overflow-y-auto space-y-4 pr-2">
            <div>
              <label className="block text-sm font-medium mb-1">Title *</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700"
                placeholder="Meeting note title"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Participants (comma-separated)</label>
              <CommaSeparatedAutocompleteInput
                value={participants}
                onChange={setParticipants}
                suggestions={peopleNames}
                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700"
                placeholder="John Doe, Jane Smith"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Date & Time</label>
              <input
                type="datetime-local"
                value={dateTime}
                onChange={e => setDateTime(e.target.value)}
                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700"
              />
            </div>

            
            <div>
              <label className="block text-sm font-medium mb-1">Related Architecture Lens Items</label>
          <div className="flex flex-wrap gap-1 mb-2">
            {relatedItems.map(itemId => {
              const item = itemMap.get(itemId)
              return item ? (
                <span
                  key={itemId}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-800"
                >
                  {lensLabel(item.lens)}: {item.name}
                  <button
                    type="button"
                    onClick={() => setRelatedItems(relatedItems.filter(id => id !== itemId))}
                    className="text-slate-500 hover:text-red-600"
                  >
                    ×
                  </button>
                </span>
              ) : null
            })}
          </div>
          <input
            type="text"
            list="related-items-list"
            className="w-full px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700"
            placeholder="Search and select items..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const input = e.currentTarget
                const value = input.value.trim()
                if (!value) return
                
                const item = itemNames.find(i => i.name.toLowerCase() === value.toLowerCase())
                if (item && !relatedItems.includes(item.id)) {
                  setRelatedItems([...relatedItems, item.id])
                  input.value = ''
                } else if (item) {
                  input.value = ''
                } else {
                  alert(`Item "${value}" not found. Please select from the dropdown or type an exact match.`)
                }
              }
            }}
            onChange={(e) => {
              // Handle when user selects from datalist dropdown (exact match only)
              const value = e.target.value.trim()
              if (!value) return
              
              const item = itemNames.find(i => i.name === value || i.name.toLowerCase() === value.toLowerCase())
              if (item && !relatedItems.includes(item.id)) {
                setRelatedItems([...relatedItems, item.id])
                setTimeout(() => {
                  e.target.value = ''
                }, 50)
              }
            }}
          />
          <datalist id="related-items-list">
            {itemNames.map(item => (
              <option key={item.id} value={item.name} />
            ))}
          </datalist>
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <label className="block text-sm font-medium">Tasks</label>
            {!readonly && (
              <button
                type="button"
                onClick={addTask}
                className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                + Add Task
              </button>
            )}
          </div>

          {/* Existing tasks with completion toggles (like list view) */}
          {existingTasks.length > 0 && (
            <div className="mb-4 space-y-1">
              {existingTasks.filter(t => !t.completedAt).map(task => (
                <div key={task.id} className="text-sm flex items-center gap-2 flex-wrap p-2 border border-slate-200 dark:border-slate-800 rounded">
                  <button
                    onClick={() => handleToggleTaskComplete(task)}
                    className="text-slate-500 hover:text-green-600"
                    title="Mark as complete"
                  >
                    ○
                  </button>
                  <input
                    type="text"
                    value={task.description}
                    onChange={e => handleUpdateTask(task, { description: e.target.value })}
                    className="flex-1 px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700 min-w-[200px]"
                    placeholder="Task description"
                  />
                  <AutocompleteInput
                    value={task.assignedTo || ''}
                    onChange={(value) => handleUpdateTask(task, { assignedTo: value })}
                    suggestions={peopleNames}
                    className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 w-32"
                    placeholder="Assigned to"
                  />
                  <div className="flex flex-wrap gap-1">
                    {task.itemReferences?.map(itemId => {
                      const item = itemMap.get(itemId)
                      return item ? (
                        <span
                          key={itemId}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-800"
                        >
                          {lensLabel(item.lens)}: {item.name}
                          <button
                            type="button"
                            onClick={() => handleUpdateTask(task, { itemReferences: (task.itemReferences || []).filter(id => id !== itemId) })}
                            className="text-slate-500 hover:text-red-600"
                          >
                            ×
                          </button>
                        </span>
                      ) : null
                    })}
                  </div>
                  <input
                    type="text"
                    list={`items-list-existing-${task.id}`}
                    className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 w-40"
                    placeholder="Add item..."
                    onChange={async (e) => {
                      // Handle when user selects from datalist dropdown (exact match only)
                      const value = e.target.value.trim()
                      if (!value) return
                      
                      // Only process if it's an exact match (user selected from dropdown)
                      const item = itemNames.find(i => i.name === value || i.name.toLowerCase() === value.toLowerCase())
                      if (item) {
                        // Get the latest task data from the database to avoid stale state
                        const currentTask = await db.tasks.get(task.id!)
                        if (currentTask) {
                          const currentRefs = currentTask.itemReferences || []
                          if (!currentRefs.includes(item.id)) {
                            await handleUpdateTask(task, { itemReferences: [...currentRefs, item.id] })
                            // Clear input after update
                            setTimeout(() => {
                              e.target.value = ''
                            }, 50)
                          } else {
                            // Item already exists, just clear the input
                            e.target.value = ''
                          }
                        }
                      }
                    }}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const input = e.currentTarget
                        const value = input.value.trim()
                        if (!value) return
                        
                        const item = itemNames.find(i => i.name.toLowerCase() === value.toLowerCase())
                        if (item) {
                          // Get the latest task data from the database to avoid stale state
                          const currentTask = await db.tasks.get(task.id!)
                          if (currentTask) {
                            const currentRefs = currentTask.itemReferences || []
                            if (!currentRefs.includes(item.id)) {
                              await handleUpdateTask(task, { itemReferences: [...currentRefs, item.id] })
                              input.value = ''
                            } else {
                              // Item already exists, just clear the input
                              input.value = ''
                            }
                          }
                        } else {
                          // Item not found - show message
                          alert(`Item "${value}" not found. Please select from the dropdown or type an exact match.`)
                        }
                      }
                    }}
                  />
                  <datalist id={`items-list-existing-${task.id}`}>
                    {itemNames.map(item => (
                      <option key={item.id} value={item.name} />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    onClick={() => handleDeleteExistingTask(task.id!)}
                    className="px-2 py-1 text-xs rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    Delete
                  </button>
                </div>
              ))}
              {existingTasks.filter(t => t.completedAt).map(task => (
                <div key={task.id} className="text-sm flex items-center gap-2 line-through text-slate-500 flex-wrap p-2 border border-slate-200 dark:border-slate-800 rounded">
                  <button
                    onClick={() => handleToggleTaskComplete(task)}
                    className="text-green-600 hover:text-slate-500"
                    title="Mark as incomplete"
                  >
                    ✓
                  </button>
                  <input
                    type="text"
                    value={task.description}
                    onChange={e => handleUpdateTask(task, { description: e.target.value })}
                    className="flex-1 px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700 min-w-[200px]"
                    placeholder="Task description"
                  />
                  <AutocompleteInput
                    value={task.assignedTo || ''}
                    onChange={(value) => handleUpdateTask(task, { assignedTo: value })}
                    suggestions={peopleNames}
                    className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 w-32"
                    placeholder="Assigned to"
                  />
                  <div className="flex flex-wrap gap-1">
                    {task.itemReferences?.map(itemId => {
                      const item = itemMap.get(itemId)
                      return item ? (
                        <span
                          key={itemId}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-800"
                        >
                          {lensLabel(item.lens)}: {item.name}
                          <button
                            type="button"
                            onClick={() => handleUpdateTask(task, { itemReferences: (task.itemReferences || []).filter(id => id !== itemId) })}
                            className="text-slate-500 hover:text-red-600"
                          >
                            ×
                          </button>
                        </span>
                      ) : null
                    })}
                  </div>
                  {task.completedAt && (
                    <span className="text-xs text-slate-400">
                      (completed {formatDateTime(task.completedAt)})
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteExistingTask(task.id!)}
                    className="px-2 py-1 text-xs rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* New tasks (form inputs) */}
          {tasks.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">New Tasks:</div>
              {tasks.map((task, index) => (
                <div key={index} className="border border-slate-200 dark:border-slate-800 rounded p-3 space-y-2">
                  <div className="flex gap-2 items-start">
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={task.description}
                        onChange={e => updateTask(index, { description: e.target.value })}
                        className="w-full px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700"
                        placeholder="Task description"
                      />
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Assigned to</label>
                          <AutocompleteInput
                            value={task.assignedTo}
                            onChange={(value) => updateTask(index, { assignedTo: value })}
                            suggestions={peopleNames}
                            className="w-full px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700"
                            placeholder="Person name"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Related items</label>
                          <div className="flex flex-wrap gap-1 mb-1">
                            {task.itemIds.map(itemId => {
                              const item = itemMap.get(itemId)
                              return item ? (
                                <span
                                  key={itemId}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-800"
                                >
                                  {lensLabel(item.lens)}: {item.name}
                                  <button
                                    type="button"
                                    onClick={() => removeItemFromTask(index, itemId)}
                                    className="text-slate-500 hover:text-red-600"
                                  >
                                    ×
                                  </button>
                                </span>
                              ) : null
                            })}
                          </div>
                          <input
                            type="text"
                            list={`items-list-${index}`}
                            className="w-full px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700"
                            placeholder="Search and select items..."
                            onChange={(e) => {
                              // Handle when user selects from datalist dropdown (exact match only)
                              const value = e.target.value.trim()
                              if (!value) return
                              
                              // Only process if it's an exact match (user selected from dropdown)
                              const item = itemNames.find(i => i.name === value || i.name.toLowerCase() === value.toLowerCase())
                              if (item && !task.itemIds.includes(item.id)) {
                                addItemToTask(index, item.id)
                                // Clear input after a short delay to allow the selection to be processed
                                setTimeout(() => {
                                  e.target.value = ''
                                }, 50)
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                const input = e.currentTarget
                                const value = input.value.trim()
                                if (!value) return
                                
                                const item = itemNames.find(i => i.name.toLowerCase() === value.toLowerCase())
                                if (item) {
                                  if (!task.itemIds.includes(item.id)) {
                                    addItemToTask(index, item.id)
                                  }
                                  input.value = ''
                                } else {
                                  // Item not found - show message
                                  alert(`Item "${value}" not found. Please select from the dropdown or type an exact match.`)
                                }
                              }
                            }}
                          />
                          <datalist id={`items-list-${index}`}>
                            {itemNames.map(item => (
                              <option key={item.id} value={item.name} />
                            ))}
                          </datalist>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeTask(index)}
                      className="px-2 py-1 text-xs rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {existingTasks.length === 0 && tasks.length === 0 && (
            <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-4 border border-dashed border-slate-300 dark:border-slate-700 rounded">
              No tasks yet. Click "Add Task" to create one.
            </div>
          )}
            </div>
          </div>
          
          {/* Right side: Meeting Notes rich text editor (takes up more space) */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">Meeting Notes</label>
              {editor && (
                <div className="flex gap-1 border border-slate-300 dark:border-slate-700 rounded p-1">
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className={`px-2 py-1 text-xs rounded ${editor.isActive('bold') ? 'bg-blue-100 dark:bg-blue-900' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    title="Bold"
                  >
                    <strong>B</strong>
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={`px-2 py-1 text-xs rounded ${editor.isActive('italic') ? 'bg-blue-100 dark:bg-blue-900' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    title="Italic"
                  >
                    <em>I</em>
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={`px-2 py-1 text-xs rounded ${editor.isActive('bulletList') ? 'bg-blue-100 dark:bg-blue-900' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    title="Bullet List"
                  >
                    •
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    className={`px-2 py-1 text-xs rounded ${editor.isActive('orderedList') ? 'bg-blue-100 dark:bg-blue-900' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    title="Numbered List"
                  >
                    1.
                  </button>
                  <div className="w-px bg-slate-300 dark:bg-slate-700 mx-1" />
                  <select
                    onChange={(e) => {
                      const size = e.target.value
                      if (size === '') {
                        editor.chain().focus().unsetFontSize().run()
                      } else {
                        editor.chain().focus().setFontSize(size).run()
                      }
                    }}
                    className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    title="Font Size"
                    value=""
                  >
                    <option value="">Size</option>
                    <option value="12px">12px</option>
                    <option value="14px">14px</option>
                    <option value="16px">16px</option>
                    <option value="18px">18px</option>
                    <option value="20px">20px</option>
                    <option value="24px">24px</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const url = window.prompt('Enter URL:')
                      if (url) {
                        editor.chain().focus().setLink({ href: url }).run()
                      } else if (url === '') {
                        editor.chain().focus().unsetLink().run()
                      }
                    }}
                    className={`px-2 py-1 text-xs rounded ${editor.isActive('link') ? 'bg-blue-100 dark:bg-blue-900' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    title="Add/Remove Link"
                  >
                    🔗
                  </button>
                  <div className="w-px bg-slate-300 dark:bg-slate-700 mx-1" />
                  <button
                    type="button"
                    onClick={() => {
                      const rows = parseInt(window.prompt('Number of rows:', '3') || '3')
                      const cols = parseInt(window.prompt('Number of columns:', '3') || '3')
                      if (rows > 0 && cols > 0) {
                        editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
                      }
                    }}
                    className="px-2 py-1 text-xs rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Insert Table"
                  >
                    ⧉
                  </button>
                </div>
              )}
            </div>
            <div className="flex-1 flex flex-col min-h-0 border border-slate-300 dark:border-slate-700 rounded overflow-hidden">
              {editor && (
                <EditorContent 
                  editor={editor} 
                  className="flex-1 overflow-y-auto min-h-0"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
