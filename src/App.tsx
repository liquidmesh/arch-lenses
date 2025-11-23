import { useEffect, useMemo, useState } from 'react'
import './index.css'
import { Sidebar } from './components/Sidebar'
import { LensPanel } from './components/LensPanel'
import { LENSES, type LensKey, type ExportBundle } from './types'
import { seedIfEmpty, db } from './db'
import { GraphModal } from './components/GraphModal'
import { TeamModal } from './components/TeamModal'
import { TeamManager } from './components/TeamManager'

function App() {
  const initialVisible = useMemo(() => Object.fromEntries(LENSES.map(l => [l.key, true])) as Record<LensKey, boolean>, [])
  const [visible, setVisible] = useState<Record<LensKey, boolean>>(initialVisible)
  const [query, setQuery] = useState('')
  const [diagramOpen, setDiagramOpen] = useState(false)
  const [teamView, setTeamView] = useState<'architects' | 'stakeholders' | null>(null)
  const [teamManagerOpen, setTeamManagerOpen] = useState(false)
  const [teamManagerPersonName, setTeamManagerPersonName] = useState<string | undefined>(undefined)
  const [teamModalRefreshKey, setTeamModalRefreshKey] = useState(0)
  const [teamManagerOpenedFromModal, setTeamManagerOpenedFromModal] = useState(false)

  useEffect(() => {
    seedIfEmpty()
  }, [])

  function toggleLens(lens: LensKey) {
    setVisible(v => ({ ...v, [lens]: !v[lens] }))
  }

  function showAll() {
    setVisible(Object.fromEntries(LENSES.map(l => [l.key, true])) as Record<LensKey, boolean>)
  }

  function hideAll() {
    setVisible(Object.fromEntries(LENSES.map(l => [l.key, false])) as Record<LensKey, boolean>)
  }

  async function onExport() {
    const items = await db.items.toArray()
    const relationships = await db.relationships.toArray()
    const teamMembers = await db.teamMembers.toArray()
    const bundle: ExportBundle = {
      version: 1,
      exportedAt: new Date().toISOString(),
      items,
      relationships,
      teamMembers,
    }
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'arch-lenses-export.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function onImport(file: File) {
    const text = await file.text()
    const data = JSON.parse(text) as ExportBundle
    if (!confirm('Import will replace current data. Continue?')) return
    await db.transaction('rw', db.items, db.relationships, db.teamMembers, async () => {
      await db.items.clear()
      await db.relationships.clear()
      await db.teamMembers.clear()
      await db.items.bulkAdd(data.items)
      await db.relationships.bulkAdd(data.relationships)
      if (data.teamMembers) {
        await db.teamMembers.bulkAdd(data.teamMembers)
      }
    })
    alert('Import complete')
  }


  return (
    <div className="h-screen w-screen flex bg-slate-50 dark:bg-slate-900">
      <Sidebar visible={visible} onToggle={toggleLens} onShowAll={showAll} onHideAll={hideAll} />
      <main className="flex-1 p-4 overflow-auto">
        <header className="mb-4 flex items-center gap-3">
          <h1 className="text-xl font-semibold">Architecture Lenses</h1>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Global search..."
            className="ml-4 px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700 bg-transparent flex-1 max-w-md"
          />
          <div className="ml-auto flex gap-2 items-center">
            <button className="px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700" onClick={() => setDiagramOpen(true)}>Diagram</button>
            <button className="px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700" onClick={() => setTeamView('architects')}>Architecture Team</button>
            <button className="px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700" onClick={() => setTeamView('stakeholders')}>Stakeholders</button>
            <button className="px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700" onClick={() => {
              setTeamManagerPersonName(undefined)
              setTeamManagerOpenedFromModal(false)
              setTeamManagerOpen(true)
            }}>Manage Team</button>
            <button className="px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700" onClick={onExport}>Export</button>
            <label className="px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700 cursor-pointer">
              Import
              <input type="file" accept="application/json" className="hidden" onChange={e => {
                const f = e.target.files?.[0]; if (f) onImport(f)
              }} />
            </label>
          </div>
        </header>
        <div className="grid grid-cols-1 gap-4">
          {LENSES.filter(l => visible[l.key]).map(l => (
            <LensPanel key={l.key} lens={l.key} title={l.label} query={query} />
          ))}
        </div>
      </main>
      <GraphModal open={diagramOpen} onClose={() => setDiagramOpen(false)} visible={visible} />
      {teamView && (
        <TeamModal
          open={teamView !== null}
          onClose={() => setTeamView(null)}
          view={teamView}
          refreshKey={teamModalRefreshKey}
          onEditPerson={(personName) => {
            setTeamManagerPersonName(personName)
            setTeamManagerOpenedFromModal(true)
            setTeamManagerOpen(true)
          }}
        />
      )}
      <TeamManager 
        open={teamManagerOpen} 
        onClose={() => {
          setTeamManagerOpen(false)
          setTeamManagerPersonName(undefined)
          setTeamManagerOpenedFromModal(false)
        }}
        initialPersonName={teamManagerPersonName}
        autoCloseOnSave={teamManagerOpenedFromModal}
        onSaved={() => {
          if (teamManagerOpenedFromModal) {
            setTeamModalRefreshKey(k => k + 1)
          }
        }}
      />
    </div>
  )
}

export default App
