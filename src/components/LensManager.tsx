import { useEffect, useState } from 'react'
import { db, getAllLenses } from '../db'
import { type LensDefinition } from '../types'
import { invalidateLensesCache } from '../utils/lensOrder'

type ViewType = 'main' | 'diagram' | 'architects' | 'stakeholders' | 'manage-team' | 'meeting-notes'

interface LensManagerProps {
  onNavigate: (view: ViewType) => void
}

export function LensManager({ onNavigate: _onNavigate }: LensManagerProps) {
  const [lenses, setLenses] = useState<LensDefinition[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [newLensKey, setNewLensKey] = useState('')
  const [newLensLabel, setNewLensLabel] = useState('')

  useEffect(() => {
    loadLenses()
  }, [])

  async function loadLenses() {
    const allLenses = await getAllLenses()
    setLenses(allLenses)
  }

  async function handleSaveEdit() {
    if (!editingId || !editLabel.trim()) return
    
    const lens = lenses.find(l => l.id === editingId)
    if (!lens) return

    const now = Date.now()
    await db.lenses.update(editingId, {
      label: editLabel.trim(),
      updatedAt: now,
    })
    
    invalidateLensesCache()
    setEditingId(null)
    setEditLabel('')
    await loadLenses()
    // Trigger a custom event to notify the app to reload lenses
    window.dispatchEvent(new CustomEvent('lensesUpdated'))
  }

  async function handleCreateLens() {
    if (!newLensKey.trim() || !newLensLabel.trim()) {
      alert('Both key and label are required')
      return
    }

    // Check if key already exists
    const existing = await db.lenses.where('key').equals(newLensKey.trim()).first()
    if (existing) {
      alert('A lens with this key already exists')
      return
    }

    const now = Date.now()
    const maxOrder = lenses.length > 0 ? Math.max(...lenses.map(l => l.order)) : -1
    
    await db.lenses.add({
      key: newLensKey.trim(),
      label: newLensLabel.trim(),
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    })

    invalidateLensesCache()
    setNewLensKey('')
    setNewLensLabel('')
    await loadLenses()
    // Trigger a custom event to notify the app to reload lenses
    window.dispatchEvent(new CustomEvent('lensesUpdated'))
  }

  async function handleDeleteLens(lensId: number) {
    if (!confirm('Delete this lens? This will also delete all items in this lens.')) return
    
    const lens = lenses.find(l => l.id === lensId)
    if (!lens) return

    // Delete all items in this lens
    await db.items.where('lens').equals(lens.key).delete()
    // Delete all relationships involving this lens
    await db.relationships.where('fromLens').equals(lens.key).delete()
    await db.relationships.where('toLens').equals(lens.key).delete()
    // Delete the lens
    await db.lenses.delete(lensId)
    
    invalidateLensesCache()
    await loadLenses()
    // Trigger a custom event to notify the app to reload lenses
    window.dispatchEvent(new CustomEvent('lensesUpdated'))
  }

  function startEdit(lens: LensDefinition) {
    setEditingId(lens.id!)
    setEditLabel(lens.label)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditLabel('')
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-900">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-xl font-semibold">Manage Architecture Lenses</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Create New Lens */}
          <div className="border border-slate-200 dark:border-slate-800 rounded p-4">
            <h2 className="font-medium mb-3">Create New Lens</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1">Key (unique identifier)</label>
                <input
                  type="text"
                  value={newLensKey}
                  onChange={e => setNewLensKey(e.target.value)}
                  placeholder="e.g., dataPlatforms"
                  className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Label (display name)</label>
                <input
                  type="text"
                  value={newLensLabel}
                  onChange={e => setNewLensLabel(e.target.value)}
                  placeholder="e.g., Data Platforms"
                  className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700"
                />
              </div>
            </div>
            <button
              onClick={handleCreateLens}
              className="mt-3 px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Create Lens
            </button>
          </div>

          {/* Existing Lenses */}
          <div>
            <h2 className="font-medium mb-3">Existing Lenses</h2>
            <div className="space-y-2">
              {lenses.map(lens => (
                <div
                  key={lens.id}
                  className="border border-slate-200 dark:border-slate-800 rounded p-3 flex items-center justify-between"
                >
                  {editingId === lens.id ? (
                    <>
                      <div className="flex-1 flex items-center gap-3">
                        <span className="text-sm text-slate-500 dark:text-slate-400">{lens.key}</span>
                        <input
                          type="text"
                          value={editLabel}
                          onChange={e => setEditLabel(e.target.value)}
                          className="flex-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveEdit}
                          className="px-2 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <div className="font-medium">{lens.label}</div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">{lens.key}</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(lens)}
                          className="px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteLens(lens.id!)}
                          className="px-2 py-1 text-sm rounded border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400"
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

