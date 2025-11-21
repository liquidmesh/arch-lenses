import { useEffect, useMemo, useState } from 'react'
import { db } from '../db'
import { LENSES, type ItemRecord, type LensKey, type RelationshipRecord } from '../types'
import { Modal } from './Modal'

interface ItemDialogProps {
  open: boolean
  onClose: () => void
  lens: LensKey
  item?: ItemRecord | null
  onSaved?: () => void
}

export function ItemDialog({ open, onClose, lens, item, onSaved }: ItemDialogProps) {
  const isNew = !item?.id
  const [name, setName] = useState(item?.name || '')
  const [description, setDescription] = useState(item?.description || '')
  const [businessContact, setBusinessContact] = useState(item?.businessContact || '')
  const [techContact, setTechContact] = useState(item?.techContact || '')
  const [primaryArchitect, setPrimaryArchitect] = useState(item?.primaryArchitect || '')
  const [secondaryArchitectsText, setSecondaryArchitectsText] = useState((item?.secondaryArchitects || []).join(', '))
  const [tagsText, setTagsText] = useState((item?.tags || []).join(', '))
  const [skillsGaps, setSkillsGaps] = useState(item?.skillsGaps || '')

  // Relationships (outgoing from this item)
  const [rels, setRels] = useState<RelationshipRecord[]>([])
  const [relatedItems, setRelatedItems] = useState<Map<number, ItemRecord>>(new Map())

  useEffect(() => {
    // Reset fields on item change
    setName(item?.name || '')
    setDescription(item?.description || '')
    setBusinessContact(item?.businessContact || '')
    setTechContact(item?.techContact || '')
    setPrimaryArchitect(item?.primaryArchitect || '')
    setSecondaryArchitectsText((item?.secondaryArchitects || []).join(', '))
    setTagsText((item?.tags || []).join(', '))
    setSkillsGaps(item?.skillsGaps || '')
    if (item?.id) {
      db.relationships.where({ fromItemId: item.id }).toArray().then(async (relationships) => {
        setRels(relationships)
        // Load related items
        const itemsMap = new Map<number, ItemRecord>()
        for (const rel of relationships) {
          const relatedItem = await db.items.get(rel.toItemId)
          if (relatedItem) itemsMap.set(rel.toItemId, relatedItem)
        }
        setRelatedItems(itemsMap)
      })
    } else {
      setRels([])
      setRelatedItems(new Map())
    }
  }, [item?.id, item])

  useEffect(() => {
    // Also clear when opening a fresh dialog to add
    if (open && isNew) {
      setName('')
      setDescription('')
      setBusinessContact('')
      setTechContact('')
      setPrimaryArchitect('')
      setSecondaryArchitectsText('')
      setTagsText('')
      setSkillsGaps('')
      setRels([])
      setRelatedItems(new Map())
    }
  }, [open, isNew])

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
          businessContact,
          techContact,
          primaryArchitect,
          secondaryArchitects,
          tags,
          skillsGaps,
          createdAt: now,
          updatedAt: now,
        })
      } else {
        await db.items.update(item!.id!, {
          name: trimmedName,
          description: description.trim() || undefined,
          businessContact,
          techContact,
          primaryArchitect,
          secondaryArchitects,
          tags,
          skillsGaps,
          updatedAt: now,
        })
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
        <Field label="Business contact">
          <input value={businessContact} onChange={e => setBusinessContact(e.target.value)} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700" />
        </Field>
        <Field label="Tech contact">
          <input value={techContact} onChange={e => setTechContact(e.target.value)} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700" />
        </Field>
        <Field label="Primary SME Architect">
          <input value={primaryArchitect} onChange={e => setPrimaryArchitect(e.target.value)} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700" />
        </Field>
        <Field label="Secondary SME Architects (comma separated)">
          <input value={secondaryArchitectsText} onChange={e => setSecondaryArchitectsText(e.target.value)} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700" />
        </Field>
        <Field label="Tags (comma separated)">
          <input value={tagsText} onChange={e => setTagsText(e.target.value)} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700" />
        </Field>
        <Field label="Skills Gaps">
          <textarea value={skillsGaps} onChange={e => setSkillsGaps(e.target.value)} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700" rows={3} placeholder="Describe any skills gaps..." />
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

function lensLabel(lens: LensKey): string {
  return LENSES.find(l => l.key === lens)?.label || lens
}
