import { useState, useEffect } from 'react'
import { db, getAllPeopleNames, getAllItemNames } from '../db'
import { type Task } from '../types'
import { Modal } from './Modal'
import { AutocompleteInput } from './AutocompleteInput'
import { LENSES } from '../types'

interface TaskDialogProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  initialAssignedTo?: string // Pre-fill assigned to person
  initialItemId?: number // Pre-fill related item
  task?: Task | null // If provided, edit existing task
}

export function TaskDialog({ open, onClose, onSaved, initialAssignedTo, initialItemId, task }: TaskDialogProps) {
  const isNew = !task?.id
  const [description, setDescription] = useState(task?.description || '')
  const [assignedTo, setAssignedTo] = useState(task?.assignedTo || initialAssignedTo || '')
  const [itemIds, setItemIds] = useState<number[]>(task?.itemReferences || (initialItemId ? [initialItemId] : []))
  const [peopleNames, setPeopleNames] = useState<string[]>([])
  const [itemMap, setItemMap] = useState<Map<number, { name: string; lens: string }>>(new Map())
  const [itemNames, setItemNames] = useState<string[]>([])
  const [newItemInput, setNewItemInput] = useState('')

  useEffect(() => {
    if (open) {
      loadPeopleNames()
      loadItemNames()
      if (task) {
        setDescription(task.description)
        setAssignedTo(task.assignedTo || '')
        setItemIds(task.itemReferences || [])
      } else {
        setDescription('')
        setAssignedTo(initialAssignedTo || '')
        setItemIds(initialItemId ? [initialItemId] : [])
      }
    }
  }, [open, task, initialAssignedTo, initialItemId])

  async function loadPeopleNames() {
    const names = await getAllPeopleNames()
    setPeopleNames(names)
  }

  async function loadItemNames() {
    const items = await getAllItemNames()
    const map = new Map<number, { name: string; lens: string }>()
    const names: string[] = []
    items.forEach(item => {
      map.set(item.id, { name: item.name, lens: item.lens })
      const lensLabel = LENSES.find(l => l.key === item.lens)?.label || item.lens
      names.push(`${lensLabel}: ${item.name}`)
    })
    setItemMap(map)
    setItemNames(names)
  }

  function lensLabel(lens: string): string {
    return LENSES.find(l => l.key === lens)?.label || lens
  }

  function addItemToTask() {
    const input = newItemInput.trim()
    if (!input) return

    // Try to find item by "Lens: Name" format
    const parts = input.split(':').map(s => s.trim())
    if (parts.length === 2) {
      const [lensLabel, itemName] = parts
      const lens = LENSES.find(l => l.label === lensLabel)?.key
      if (lens) {
        const item = Array.from(itemMap.entries()).find(([_, v]) => v.lens === lens && v.name === itemName)
        if (item && !itemIds.includes(item[0])) {
          setItemIds([...itemIds, item[0]])
          setNewItemInput('')
          return
        }
      }
    }

    // Try to find by name only (if unique)
    const matchingItems = Array.from(itemMap.entries()).filter(([_, v]) => v.name === input)
    if (matchingItems.length === 1 && !itemIds.includes(matchingItems[0][0])) {
      setItemIds([...itemIds, matchingItems[0][0]])
      setNewItemInput('')
    }
  }

  function removeItemFromTask(itemId: number) {
    setItemIds(itemIds.filter(id => id !== itemId))
  }

  async function save() {
    if (!description.trim()) {
      alert('Task description is required')
      return
    }

    const now = Date.now()
    const taskData: Omit<Task, 'id'> = {
      meetingNoteId: undefined, // Standalone task
      description: description.trim(),
      assignedTo: assignedTo.trim() || undefined,
      itemReferences: itemIds,
      completedAt: task?.completedAt,
      createdAt: task?.createdAt || now,
      updatedAt: now,
    }

    try {
      if (isNew) {
        await db.tasks.add(taskData)
      } else {
        await db.tasks.update(task.id!, taskData)
      }
      onSaved()
      onClose()
    } catch (e) {
      console.error('Error saving task:', e)
      alert('Error saving task')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isNew ? 'New Task' : 'Edit Task'}
      footer={(
        <>
          <button className="px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-700" onClick={onClose}>Cancel</button>
          <button className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white" onClick={save}>Save</button>
        </>
      )}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Description *</label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700"
            placeholder="Task description"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Assigned to</label>
          <AutocompleteInput
            value={assignedTo}
            onChange={setAssignedTo}
            suggestions={peopleNames}
            className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700"
            placeholder="Person name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Related Architecture Lens Items</label>
          <div className="flex flex-wrap gap-1 mb-2">
            {itemIds.map(itemId => {
              const item = itemMap.get(itemId)
              return item ? (
                <span
                  key={itemId}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-800"
                >
                  {lensLabel(item.lens)}: {item.name}
                  <button
                    type="button"
                    onClick={() => removeItemFromTask(itemId)}
                    className="text-slate-500 hover:text-red-600"
                  >
                    ×
                  </button>
                </span>
              ) : null
            })}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newItemInput}
              onChange={e => setNewItemInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addItemToTask()
                }
              }}
              list="item-names"
              className="flex-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700"
              placeholder="Type 'Lens: Item Name' or item name"
            />
            <datalist id="item-names">
              {itemNames.map(name => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={addItemToTask}
              className="px-3 py-1 text-sm rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

