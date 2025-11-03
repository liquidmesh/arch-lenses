import { useEffect, useMemo, useState } from 'react'
import { db } from '../db'
import { hasGap, type ItemRecord, type LensKey } from '../types'
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

  async function load() {
    const rows = await db.items.where('lens').equals(lens).sortBy('name')
    setItems(rows)
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(i => (
      i.name.toLowerCase().includes(q) ||
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
              <th className="py-2 pr-2">Business</th>
              <th className="py-2 pr-2">Tech</th>
              <th className="py-2 pr-2">Primary SME</th>
              <th className="py-2 pr-2">Secondary SMEs</th>
              <th className="py-2 pr-2">Tags</th>
              <th className="py-2 pr-2 w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-2 pr-2"><GapDot item={item} /></td>
                <td className="py-2 pr-2">{item.name}</td>
                <td className="py-2 pr-2">{item.businessContact || <span className="text-slate-400">(blank)</span>}</td>
                <td className="py-2 pr-2">{item.techContact || <span className="text-slate-400">(blank)</span>}</td>
                <td className="py-2 pr-2">{item.primaryArchitect || <span className="text-slate-400">(blank)</span>}</td>
                <td className="py-2 pr-2">
                  {item.secondaryArchitects.length === 0 ? <span className="text-slate-400">(none)</span> : item.secondaryArchitects.join(', ')}
                </td>
                <td className="py-2 pr-2">
                  {item.tags.length === 0 ? <span className="text-slate-400">(none)</span> : item.tags.join(', ')}
                </td>
                <td className="py-2 pr-2 flex gap-2">
                  <button className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => openEdit(item)}>Edit</button>
                  <button className="px-2 py-1 text-xs rounded border border-red-300 text-red-700 hover:bg-red-50" onClick={() => removeItem(item.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-slate-500 py-6">No items</td>
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
        onSaved={load}
      />
    </section>
  )
}
