import { useEffect, useMemo, useState } from 'react'
import { db, getAllItemNames, getAllPeopleNames } from '../db'
import { LENSES, type ItemRecord, type LensKey, type RelationshipRecord, type LifecycleStatus, type MeetingNote, type Hyperlink, type Task } from '../types'
import { Modal } from './Modal'
import { AutocompleteInput } from './AutocompleteInput'
import { TaskDialog } from './TaskDialog'

interface ItemDialogProps {
  open: boolean
  onClose: () => void
  lens: LensKey
  item?: ItemRecord | null
  onSaved?: () => void
  onOpenMeetingNote?: (noteId: number) => void // Callback to open meeting notes modal
  onEditPerson?: (personName: string) => void // Callback to navigate to person view
}

export function ItemDialog({ open, onClose, lens, item, onSaved, onOpenMeetingNote, onEditPerson }: ItemDialogProps) {
  const isNew = !item?.id
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [name, setName] = useState(item?.name || '')
  const [description, setDescription] = useState(item?.description || '')
  const [lifecycleStatus, setLifecycleStatus] = useState(item?.lifecycleStatus || '')
  const [businessContact, setBusinessContact] = useState(item?.businessContact || '')
  const [techContact, setTechContact] = useState(item?.techContact || '')
  const [primaryArchitect, setPrimaryArchitect] = useState(item?.primaryArchitect || '')
  const [secondaryArchitectsText, setSecondaryArchitectsText] = useState((item?.secondaryArchitects || []).join(', '))
  const [tagsText, setTagsText] = useState((item?.tags || []).join(', '))
  const [skillsGaps, setSkillsGaps] = useState(item?.skillsGaps || '')
  const [parent, setParent] = useState(item?.parent || '')
  const [hyperlinks, setHyperlinks] = useState<Hyperlink[]>(item?.hyperlinks || [])
  const [architectureManager, setArchitectureManager] = useState(item?.architectureManager || '')
  const [allItems, setAllItems] = useState<ItemRecord[]>([]) // For parent autocomplete
  const [peopleNames, setPeopleNames] = useState<string[]>([]) // For people autocomplete
  const [managerNames, setManagerNames] = useState<string[]>([]) // For architecture manager autocomplete

  // Relationships (outgoing from this item)
  const [rels, setRels] = useState<RelationshipRecord[]>([])
  const [relatedItems, setRelatedItems] = useState<Map<number, ItemRecord>>(new Map())
  const [referencedNotes, setReferencedNotes] = useState<MeetingNote[]>([])
  const [relatedTasks, setRelatedTasks] = useState<Task[]>([])
  const [itemMap, setItemMap] = useState<Map<number, { name: string; lens: string }>>(new Map())

  useEffect(() => {
    // Reset fields on item change
    setName(item?.name || '')
    setDescription(item?.description || '')
    setLifecycleStatus(item?.lifecycleStatus || '')
    setBusinessContact(item?.businessContact || '')
    setTechContact(item?.techContact || '')
    setPrimaryArchitect(item?.primaryArchitect || '')
    setSecondaryArchitectsText((item?.secondaryArchitects || []).join(', '))
    setTagsText((item?.tags || []).join(', '))
    setSkillsGaps(item?.skillsGaps || '')
    setParent(item?.parent || '')
    setHyperlinks(item?.hyperlinks || [])
    setArchitectureManager(item?.architectureManager || '')
    if (item?.id) {
      const itemId = item.id
      async function loadData() {
        const relationships = await db.relationships.where({ fromItemId: itemId }).toArray()
        setRels(relationships)
        // Load related items
        const itemsMap = new Map<number, ItemRecord>()
        for (const rel of relationships) {
          const relatedItem = await db.items.get(rel.toItemId)
          if (relatedItem) itemsMap.set(rel.toItemId, relatedItem)
        }
        setRelatedItems(itemsMap)
        // Load meeting notes that reference this item
        await loadReferencedNotes(itemId)
        // Load tasks that reference this item
        await loadRelatedTasks(itemId)
        // Load item map for task display
        await loadItemMap()
      }
      loadData()
    } else {
      setRels([])
      setRelatedItems(new Map())
      setReferencedNotes([])
    }
  }, [item?.id, item])

  async function loadReferencedNotes(itemId: number) {
    // Find notes that reference this item in two ways:
    // 1. Tasks that reference this item in their itemReferences array
    // 2. Notes that have this item in their relatedItems array
    const allTasks = await db.tasks.toArray()
    const relevantTasks = allTasks.filter(t => t.itemReferences && t.itemReferences.filter((id): id is number => id !== undefined).includes(itemId))
    const noteIdsFromTasks = Array.from(new Set(relevantTasks.map(t => t.meetingNoteId).filter((id): id is number => id !== undefined)))
    
    // Find notes with this item in relatedItems
    const allNotes = await db.meetingNotes.toArray()
    const notesWithRelatedItem = allNotes.filter(n => n.relatedItems && n.relatedItems.includes(itemId))
    const noteIdsFromRelated = notesWithRelatedItem.map(n => n.id!).filter((id): id is number => id !== undefined)
    
    // Combine both sets of note IDs
    const allNoteIds = Array.from(new Set([...noteIdsFromTasks, ...noteIdsFromRelated]))
    
    if (allNoteIds.length > 0) {
      const notes = await db.meetingNotes.bulkGet(allNoteIds)
      setReferencedNotes(notes.filter((n): n is MeetingNote => n !== undefined))
    } else {
      setReferencedNotes([])
    }
  }
  
  async function loadItemMap() {
    const items = await getAllItemNames()
    const map = new Map<number, { name: string; lens: string }>()
    items.forEach(item => {
      map.set(item.id, { name: item.name, lens: item.lens })
    })
    setItemMap(map)
  }
  
  async function loadRelatedTasks(itemId: number) {
    const allTasks = await db.tasks.toArray()
    const relevantTasks = allTasks.filter(t => t.itemReferences && t.itemReferences.filter((id): id is number => id !== undefined).includes(itemId))
    // Sort: incomplete first, then by creation date (newest first)
    relevantTasks.sort((a, b) => {
      const aCompleted = !!a.completedAt
      const bCompleted = !!b.completedAt
      if (aCompleted !== bCompleted) {
        return aCompleted ? 1 : -1
      }
      return (b.createdAt || 0) - (a.createdAt || 0)
    })
    setRelatedTasks(relevantTasks)
  }
  
  function lensLabel(lens: string): string {
    return LENSES.find(l => l.key === lens)?.label || lens
  }

  useEffect(() => {
    // Also clear when opening a fresh dialog to add
    if (open && isNew) {
      setName('')
      setDescription('')
      setLifecycleStatus('')
      setBusinessContact('')
      setTechContact('')
      setPrimaryArchitect('')
      setSecondaryArchitectsText('')
      setTagsText('')
      setSkillsGaps('')
      setParent('')
      setHyperlinks([])
      setRels([])
      setRelatedItems(new Map())
      setReferencedNotes([])
    }
  }, [open, isNew])

  // Load all items for parent autocomplete and people names
  useEffect(() => {
    async function loadAllItems() {
      const items = await db.items.toArray()
      setAllItems(items)
    }
    async function loadPeopleNames() {
      const names = await getAllPeopleNames()
      setPeopleNames(names)
    }
    async function loadManagerNames() {
      // Get all team members who are managers (have people reporting to them)
      const teamMembers = await db.teamMembers.toArray()
      const managers = new Set<string>()
      teamMembers.forEach(member => {
        // Check if this member has anyone reporting to them
        const hasReports = teamMembers.some(m => m.manager === member.name)
        if (hasReports) {
          managers.add(member.name)
        }
      })
      // Also include any architecture managers from items (in case they're not in team members)
      const items = await db.items.toArray()
      items.forEach(item => {
        if (item.architectureManager) {
          managers.add(item.architectureManager)
        }
      })
      setManagerNames(Array.from(managers).sort())
    }
    if (open) {
      loadAllItems()
      loadPeopleNames()
      loadManagerNames()
    }
  }, [open])

  const lensOptions = useMemo(() => LENSES, [])
  const [targetLens, setTargetLens] = useState<LensKey>('channels')
  const [targetQuery, setTargetQuery] = useState('')
  const [targetItems, setTargetItems] = useState<ItemRecord[]>([])

  useEffect(() => {
    async function loadTargets() {
      const rows = await db.items.where('lens').equals(targetLens).sortBy('name')
      const q = targetQuery.trim().toLowerCase()
      setTargetItems(q ? rows.filter(r => r.name.toLowerCase().includes(q)) : rows)
    }
    if (open) loadTargets()
  }, [targetLens, targetQuery, open])

  async function addRelationship(toItemId: number, toLens: LensKey) {
    if (!item?.id) return
    const now = Date.now()
    // prevent duplicates both directions
    const existing = await db.relationships.where({ fromItemId: item.id, toItemId }).first()
    if (!existing) {
      await db.relationships.add({ fromLens: lens, fromItemId: item.id, toLens, toItemId, createdAt: now })
    }
    const reverseExisting = await db.relationships.where({ fromItemId: toItemId, toItemId: item.id }).first()
    if (!reverseExisting) {
      await db.relationships.add({ fromLens: toLens, fromItemId: toItemId, toLens: lens, toItemId: item.id, createdAt: now })
    }
    const updated = await db.relationships.where({ fromItemId: item.id }).toArray()
    setRels(updated)
    // Reload related items
    const itemsMap = new Map<number, ItemRecord>()
    for (const rel of updated) {
      const relatedItem = await db.items.get(rel.toItemId)
      if (relatedItem) itemsMap.set(rel.toItemId, relatedItem)
    }
    setRelatedItems(itemsMap)
  }

  async function removeRelationship(id?: number) {
    if (!id || !item?.id) return
    const rel = await db.relationships.get(id)
    if (!rel) return
    await db.relationships.delete(id)
    // delete reverse as well
    const reverse = await db.relationships.where({ fromItemId: rel.toItemId, toItemId: rel.fromItemId }).first()
    if (reverse?.id) await db.relationships.delete(reverse.id)
    const updated = await db.relationships.where({ fromItemId: item.id }).toArray()
    setRels(updated)
    // Reload related items
    const itemsMap = new Map<number, ItemRecord>()
    for (const rel of updated) {
      const relatedItem = await db.items.get(rel.toItemId)
      if (relatedItem) itemsMap.set(rel.toItemId, relatedItem)
    }
    setRelatedItems(itemsMap)
  }

  async function save() {
    const trimmedName = name.trim()
    if (!trimmedName) {
      alert('Name is required')
      return
    }
    const now = Date.now()
    const secondaryArchitects = splitList(secondaryArchitectsText)
    const tags = splitList(tagsText)

    try {
      if (isNew) {
        await db.items.add({
          lens,
          name: trimmedName,
          description: description.trim() || undefined,
          lifecycleStatus: (lifecycleStatus || undefined) as LifecycleStatus | undefined,
          businessContact,
          techContact,
          primaryArchitect,
          secondaryArchitects,
          tags,
          skillsGaps,
          parent: parent.trim() || undefined,
          hyperlinks: hyperlinks.length > 0 ? hyperlinks : undefined,
          architectureManager: architectureManager.trim() || undefined,
          createdAt: now,
          updatedAt: now,
        })
      } else {
        const updateData: Partial<ItemRecord> = {
          name: trimmedName,
          description: description.trim() || undefined,
          lifecycleStatus: (lifecycleStatus || undefined) as LifecycleStatus | undefined,
          businessContact,
          techContact,
          primaryArchitect,
          secondaryArchitects,
          tags,
          skillsGaps,
          updatedAt: now,
        }
        // Only include parent if it has a value
        if (parent.trim()) {
          updateData.parent = parent.trim()
        } else {
          updateData.parent = undefined
        }
        // Only include hyperlinks if there are any
        if (hyperlinks.length > 0) {
          // Filter out any hyperlinks with empty label and url
          const validHyperlinks = hyperlinks.filter(h => h.label.trim() || h.url.trim())
          updateData.hyperlinks = validHyperlinks.length > 0 ? validHyperlinks : undefined
        } else {
          updateData.hyperlinks = undefined
        }
        // Only include architectureManager if it has a value
        if (architectureManager.trim()) {
          updateData.architectureManager = architectureManager.trim()
        } else {
          updateData.architectureManager = undefined
        }
        await db.items.update(item!.id!, updateData)
        // Verify the update worked by reloading the item
        const updated = await db.items.get(item!.id!)
        if (updated) {
          // Update local state to reflect saved values
          setParent(updated.parent || '')
          setHyperlinks(updated.hyperlinks && Array.isArray(updated.hyperlinks) ? updated.hyperlinks : [])
        }
      }
      onSaved?.()
      onClose()
    } catch (e) {
      alert('Name must be unique per lens.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={(isNew ? 'Add' : 'Edit') + ' ' + lensLabel(lens)} wide
      footer={(
        <>
          <button className="px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-700" onClick={onClose}>Cancel</button>
          <button className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white" onClick={save}>Save</button>
        </>
      )}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Name" required>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700" />
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700" rows={4} placeholder="Enter a description of this item..." />
        </Field>
        <Field label="Lifecycle Status">
          <select value={lifecycleStatus} onChange={e => setLifecycleStatus(e.target.value)} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700">
            <option value="">(None)</option>
            <option value="Plan">Plan</option>
            <option value="Emerging">Emerging</option>
            <option value="Invest">Invest</option>
            <option value="Divest">Divest</option>
            <option value="Stable">Stable</option>
          </select>
        </Field>
        <Field label="Business contact">
          <AutocompleteInput
            value={businessContact}
            onChange={setBusinessContact}
            suggestions={peopleNames}
            className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700"
          />
        </Field>
        <Field label="Tech contact">
          <AutocompleteInput
            value={techContact}
            onChange={setTechContact}
            suggestions={peopleNames}
            className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700"
          />
        </Field>
        <Field label="Primary SME Architect">
          <AutocompleteInput
            value={primaryArchitect}
            onChange={setPrimaryArchitect}
            suggestions={peopleNames}
            className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700"
          />
        </Field>
        <Field label="Secondary SME Architects (comma separated)">
          <input value={secondaryArchitectsText} onChange={e => setSecondaryArchitectsText(e.target.value)} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700" />
        </Field>
        <Field label="Architecture Manager">
          <AutocompleteInput
            value={architectureManager}
            onChange={setArchitectureManager}
            suggestions={managerNames}
            className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700"
          />
        </Field>
        <Field label="Tags (comma separated)">
          <input value={tagsText} onChange={e => setTagsText(e.target.value)} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700" />
        </Field>
        <Field label="Skills Gaps">
          <textarea value={skillsGaps} onChange={e => setSkillsGaps(e.target.value)} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700" rows={3} placeholder="Describe any skills gaps..." />
        </Field>
        <Field label="Parent">
          <input
            type="text"
            value={parent}
            onChange={e => setParent(e.target.value)}
            list="parent-list"
            className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700"
            placeholder="Parent name for grouping (optional)"
          />
          <datalist id="parent-list">
            {Array.from(new Set(allItems.map(i => i.parent).filter(Boolean))).map(p => (
              <option key={p} value={p!} />
            ))}
          </datalist>
        </Field>
        <Field label="Hyperlinks">
          <div className="space-y-2">
            {hyperlinks.map((link, index) => {
              // Show read-only view if both label and URL are filled
              const isComplete = link.label.trim() && link.url.trim()
              if (isComplete) {
                return (
                  <div key={index} className="flex gap-2 items-center">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 px-2 py-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {link.label}
                    </a>
                    <button
                      type="button"
                      onClick={() => setHyperlinks(hyperlinks.filter((_, i) => i !== index))}
                      className="px-2 py-1 text-sm rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      Delete
                    </button>
                  </div>
                )
              }
              // Show editable inputs if incomplete
              return (
                <div key={index} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={link.label}
                    onChange={e => {
                      const updated = [...hyperlinks]
                      updated[index] = { ...updated[index], label: e.target.value }
                      setHyperlinks(updated)
                    }}
                    className="flex-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700"
                    placeholder="Label"
                  />
                  <input
                    type="url"
                    value={link.url}
                    onChange={e => {
                      const updated = [...hyperlinks]
                      updated[index] = { ...updated[index], url: e.target.value }
                      setHyperlinks(updated)
                    }}
                    className="flex-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700"
                    placeholder="URL"
                  />
                  <button
                    type="button"
                    onClick={() => setHyperlinks(hyperlinks.filter((_, i) => i !== index))}
                    className="px-2 py-1 text-sm rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    Delete
                  </button>
                </div>
              )
            })}
            <button
              type="button"
              onClick={() => setHyperlinks([...hyperlinks, { label: '', url: '' }])}
              className="px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Add Hyperlink
            </button>
          </div>
        </Field>
      </div>

      {!isNew && (
        <div className="mt-6">
          <h4 className="font-medium mb-2">Relationships</h4>
          <div className="flex flex-wrap gap-2 mb-3">
            {rels.length === 0 && <span className="text-slate-500 text-sm">No relationships</span>}
            {rels.map(r => {
              const relatedItem = relatedItems.get(r.toItemId)
              return (
                <span key={r.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-800">
                  {lensLabel(r.toLens)}: {relatedItem?.name || `#${r.toItemId}`}
                  <button className="ml-1" onClick={() => removeRelationship(r.id)}>×</button>
                </span>
              )
            })}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
            <div>
              <label className="block text-xs mb-1">Target lens</label>
              <select value={targetLens} onChange={e => setTargetLens(e.target.value as LensKey)} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700">
                {lensOptions.map(o => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs mb-1">Search target items</label>
              <input value={targetQuery} onChange={e => setTargetQuery(e.target.value)} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700" placeholder="Type to search..." />
              <div className="mt-2 max-h-40 overflow-auto border border-slate-200 dark:border-slate-800 rounded">
                {targetItems.map(t => (
                  <button key={t.id} className="block w-full text-left px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => addRelationship(t.id!, t.lens)}>
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {!isNew && (
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="col-span-1">
            <h4 className="font-medium mb-2">Referenced in Meeting Notes</h4>
            {referencedNotes.length > 0 ? (
              <div className="space-y-2">
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
              <div className="text-sm text-slate-500 dark:text-slate-400">No meeting notes reference this item</div>
            )}
          </div>
          <div className="col-span-2">
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-medium">Related Tasks</h4>
              {!isNew && (
                <button
                  onClick={() => {
                    setEditingTask(null)
                    setTaskDialogOpen(true)
                  }}
                  className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                >
                  + Add Task
                </button>
              )}
            </div>
            {relatedTasks.length > 0 ? (
              <div className="space-y-2">
              {relatedTasks.map(task => {
                const note = task.meetingNoteId ? referencedNotes.find(n => n.id === task.meetingNoteId) : undefined
                const isCompleted = !!task.completedAt
                return (
                  <div
                    key={task.id}
                    className={`w-full text-left text-sm p-2 border border-slate-200 dark:border-slate-800 rounded flex items-start gap-2 ${
                      isCompleted ? 'opacity-60' : ''
                    }`}
                  >
                    <button
                      onClick={async () => {
                        const now = Date.now()
                        await db.tasks.update(task.id!, {
                          completedAt: isCompleted ? undefined : now,
                          updatedAt: now,
                        })
                        if (item?.id) {
                          await loadRelatedTasks(item.id)
                        }
                      }}
                      className={`flex-shrink-0 mt-0.5 ${
                        isCompleted 
                          ? 'text-green-600 hover:text-slate-500' 
                          : 'text-slate-500 hover:text-green-600'
                      }`}
                      title={isCompleted ? 'Mark as incomplete' : 'Mark as complete'}
                    >
                      {isCompleted ? '✓' : '○'}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={`${isCompleted ? 'line-through text-slate-500' : ''}`}>
                        {task.description}
                      </div>
                    {task.assignedTo && (
                      <div className="text-slate-600 dark:text-slate-400 text-xs mt-1">
                        Assigned to: <button
                          onClick={() => onEditPerson?.(task.assignedTo!)}
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {task.assignedTo}
                        </button>
                      </div>
                    )}
                    {task.itemReferences && task.itemReferences.length > 0 && (
                      <div className="text-slate-600 dark:text-slate-400 text-xs mt-1">
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
                    <div className="flex-shrink-0 flex gap-1 ml-2">
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
                            if (item?.id) {
                              await loadRelatedTasks(item.id)
                            }
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
              <div className="text-sm text-slate-500 dark:text-slate-400">No tasks reference this item</div>
            )}
          </div>
        </div>
      )}
      <TaskDialog
        open={taskDialogOpen}
        onClose={() => {
          setTaskDialogOpen(false)
          setEditingTask(null)
        }}
        onSaved={async () => {
          if (item?.id) {
            await loadRelatedTasks(item.id)
          }
          setEditingTask(null)
        }}
        initialItemId={item?.id}
        task={editingTask}
      />
    </Modal>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-slate-600 dark:text-slate-300">{label}{required && ' *'}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

function splitList(s: string): string[] {
  return s.split(',').map(t => t.trim()).filter(Boolean)
}

