import { useEffect, useState } from 'react'
import { db } from '../db'
import { type TeamMember } from '../types'
import { Modal } from './Modal'

interface TeamManagerProps {
  open: boolean
  onClose: () => void
}

export function TeamManager({ open, onClose }: TeamManagerProps) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [manager, setManager] = useState('')

  useEffect(() => {
    if (!open) {
      setEditingId(null)
      setName('')
      setManager('')
      return
    }
    loadMembers()
  }, [open])

  async function loadMembers() {
    const all = await db.teamMembers.toArray()
    setMembers(all)
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
          createdAt: now,
          updatedAt: now,
        })
      }
      await loadMembers()
      setEditingId(null)
      setName('')
      setManager('')
    } catch (e) {
      alert('Error saving team member')
    }
  }

  async function deleteMember(id: number) {
    if (!confirm('Delete this team member?')) return
    await db.teamMembers.delete(id)
    await loadMembers()
  }

  function startEdit(member: TeamMember) {
    setEditingId(member.id!)
    setName(member.name)
    setManager(member.manager || '')
  }

  function cancelEdit() {
    setEditingId(null)
    setName('')
    setManager('')
  }

  // Get unique manager names for autocomplete
  const managerOptions = Array.from(new Set(members.map(m => m.manager).filter(Boolean)))

  return (
    <Modal open={open} onClose={onClose} title="Manage Architecture Team">
      <div className="space-y-4">
        <div className="border border-slate-200 dark:border-slate-800 rounded p-4">
          <h4 className="font-medium mb-3">
            {editingId ? 'Edit Team Member' : 'Add Team Member'}
          </h4>
          <div className="space-y-3">
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
        </div>

        <div>
          <h4 className="font-medium mb-3">Team Members ({members.length})</h4>
          {members.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No team members added yet</p>
          ) : (
            <div className="space-y-2">
              {members.map(member => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-800 rounded"
                >
                  <div>
                    <div className="font-medium">{member.name}</div>
                    {member.manager && (
                      <div className="text-sm text-slate-500 dark:text-slate-400">
                        Manager: {member.manager}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEdit(member)}
                      className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteMember(member.id!)}
                      className="px-2 py-1 text-sm border border-red-300 dark:border-red-700 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

