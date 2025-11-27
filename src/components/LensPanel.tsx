import { useEffect, useMemo, useState } from 'react'
import { db } from '../db'
import { hasGap, type ItemRecord, type LensKey, type RelationshipRecord } from '../types'
import { LENSES } from '../types'
import clsx from 'clsx'
import { ItemDialog } from './ItemDialog'

interface LensPanelProps {
  lens: LensKey
  title: string
  query: string
}

export function LensPanel({ lens, title, query }: LensPanelProps) {
  const [items, setItems] = useState<ItemRecord[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogItem, setDialogItem] = useState<ItemRecord | null>(null)
  const [relationships, setRelationships] = useState<RelationshipRecord[]>([])
  const [relatedItemsMap, setRelatedItemsMap] = useState<Map<number, ItemRecord>>(new Map())

  async function load() {
    const rows = await db.items.where('lens').equals(lens).sortBy('name')
    setItems(rows)
    
    // Load all relationships for items in this lens
    const allRels = await db.relationships.toArray()
    const itemIds = new Set(rows.map(r => r.id).filter((id): id is number => !!id))
    const relevantRels = allRels.filter(r => itemIds.has(r.fromItemId) || itemIds.has(r.toItemId))
    setRelationships(relevantRels)
    
    // Load related items
    const relatedIds = new Set<number>()
    relevantRels.forEach(r => {
      if (itemIds.has(r.fromItemId)) relatedIds.add(r.toItemId)
      if (itemIds.has(r.toItemId)) relatedIds.add(r.fromItemId)
    })
    const relatedItems = await db.items.bulkGet(Array.from(relatedIds))
    const map = new Map<number, ItemRecord>()
    relatedItems.forEach(item => {
      if (item) map.set(item.id!, item)
    })
    setRelatedItemsMap(map)
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(i => (
      i.name.toLowerCase().includes(q) ||
      i.description?.toLowerCase().includes(q) ||
      i.lifecycleStatus?.toLowerCase().includes(q) ||
      i.businessContact?.toLowerCase().includes(q) ||
      i.techContact?.toLowerCase().includes(q) ||
      i.primaryArchitect?.toLowerCase().includes(q) ||
      i.tags.some(t => t.toLowerCase().includes(q))
    ))
  }, [items, query])

  function openAdd() {
    setDialogItem(null)
    setDialogOpen(true)
  }

  function openEdit(item: ItemRecord) {
    setDialogItem(item)
    setDialogOpen(true)
  }

  async function removeItem(id?: number) {
    if (!id) return
    // Delete all relationships that reference this item (both from and to)
    await db.relationships.where('fromItemId').equals(id).delete()
    await db.relationships.where('toItemId').equals(id).delete()
    // Delete the item
    await db.items.delete(id)
    await load()
  }

  function GapDot({ item }: { item: ItemRecord }) {
    const gap = hasGap(item)
    return (
      <span title={gap ? 'Gap in coverage' : 'Complete'}
        className={clsx('inline-block h-2.5 w-2.5 rounded-full', gap ? 'bg-red-500' : 'bg-green-500')} />
    )
  }

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <header className="flex items-center gap-3 mb-3">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
        <div className="ml-auto">
          <button onClick={openAdd} className="px-2 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Add</button>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-2 pr-2">Gap</th>
              <th className="py-2 pr-2">Name</th>
              <th className="py-2 pr-2">Description</th>
              <th className="py-2 pr-2">Lifecycle</th>
              <th className="py-2 pr-2">Business</th>
              <th className="py-2 pr-2">Tech</th>
              <th className="py-2 pr-2">Primary SME</th>
              <th className="py-2 pr-2">Secondary SMEs</th>
              <th className="py-2 pr-2">Tags</th>
              <th className="py-2 pr-2">Related Items</th>
              <th className="py-2 pr-2">Skills Gaps</th>
              <th className="py-2 pr-2 w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-2 pr-2"><GapDot item={item} /></td>
                <td className="py-2 pr-2">{item.name}</td>
                <td className="py-2 pr-2 max-w-xs">
                  {item.description ? (
                    <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{item.description}</div>
                  ) : (
                    <span className="text-slate-400">(none)</span>
                  )}
                </td>
                <td className="py-2 pr-2">{item.lifecycleStatus || <span className="text-slate-400">(none)</span>}</td>
                <td className="py-2 pr-2">{item.businessContact || <span className="text-slate-400">(blank)</span>}</td>
                <td className="py-2 pr-2">{item.techContact || <span className="text-slate-400">(blank)</span>}</td>
                <td className="py-2 pr-2">{item.primaryArchitect || <span className="text-slate-400">(blank)</span>}</td>
                <td className="py-2 pr-2">
                  {item.secondaryArchitects.length === 0 ? <span className="text-slate-400">(none)</span> : item.secondaryArchitects.join(', ')}
                </td>
                <td className="py-2 pr-2">
                  {item.tags.length === 0 ? <span className="text-slate-400">(none)</span> : item.tags.join(', ')}
                </td>
                <td className="py-2 pr-2">
                  {(() => {
                    const itemRels = relationships.filter(r => r.fromItemId === item.id || r.toItemId === item.id)
                    if (itemRels.length === 0) return <span className="text-slate-400">(none)</span>
                    
                    // Deduplicate by related item ID to avoid showing the same relationship twice
                    const seenRelatedIds = new Set<number>()
                    const uniqueRels = itemRels.filter(r => {
                      const relatedId = r.fromItemId === item.id ? r.toItemId : r.fromItemId
                      if (seenRelatedIds.has(relatedId)) {
                        return false
                      }
                      seenRelatedIds.add(relatedId)
                      return true
                    })
                    
                    return (
                      <div className="flex flex-wrap gap-1">
                        {uniqueRels.map(r => {
                          const relatedId = r.fromItemId === item.id ? r.toItemId : r.fromItemId
                          const relatedItem = relatedItemsMap.get(relatedId)
                          const relatedLens = LENSES.find(l => l.key === (r.fromItemId === item.id ? r.toLens : r.fromLens))
                          return (
                            <span key={r.id} className="px-1.5 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-800">
                              {relatedLens?.label || 'Unknown'}: {relatedItem?.name || `#${relatedId}`}
                            </span>
                          )
                        })}
                      </div>
                    )
                  })()}
                </td>
                <td className="py-2 pr-2">
                  {item.skillsGaps || <span className="text-slate-400">(none)</span>}
                </td>
                <td className="py-2 pr-2 flex gap-2">
                  <button className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => openEdit(item)}>Edit</button>
                  <button className="px-2 py-1 text-xs rounded border border-red-300 text-red-700 hover:bg-red-50" onClick={() => removeItem(item.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={12} className="text-center text-slate-500 py-6">No items</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ItemDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        lens={lens}
        item={dialogItem}
        onSaved={async () => {
          await load()
          // Update dialogItem if we're editing an existing item
          if (dialogItem?.id) {
            const updatedItem = await db.items.get(dialogItem.id)
            if (updatedItem) {
              setDialogItem(updatedItem)
            }
          }
        }}
        onOpenMeetingNote={(noteId) => {
          window.dispatchEvent(new CustomEvent('openMeetingNote', { detail: { noteId } }))
        }}
        onEditPerson={(personName) => {
          window.dispatchEvent(new CustomEvent('editPerson', { detail: { personName } }))
        }}
      />
    </section>
  )
}
