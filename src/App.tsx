import { useEffect, useMemo, useState } from 'react'
import './index.css'
import { Sidebar } from './components/Sidebar'
import { LensPanel } from './components/LensPanel'
import { Navigation } from './components/Navigation'
import { LENSES, type LensKey, type ExportBundle, type LensDefinition } from './types'
import { seedIfEmpty, db } from './db'
import { GraphModal } from './components/GraphModal'
import { TeamModal } from './components/TeamModal'
import { TeamManager } from './components/TeamManager'
import { MeetingNotesModal } from './components/MeetingNotesModal'
import { LensManager } from './components/LensManager'
import { invalidateLensesCache, getLensOrderSync } from './utils/lensOrder'
import { getAllLenses } from './db'

type ViewType = 'main' | 'diagram' | 'architects' | 'stakeholders' | 'manage-team' | 'meeting-notes' | 'manage-lenses'

function App() {
  const [lenses, setLenses] = useState<LensDefinition[]>(LENSES)
  const initialVisible = useMemo(() => Object.fromEntries(lenses.map(l => [l.key, true])) as Record<LensKey, boolean>, [lenses])
  const [visible, setVisible] = useState<Record<LensKey, boolean>>(initialVisible)
  const [query, setQuery] = useState('')
  const [currentView, setCurrentView] = useState<ViewType>('main')
  const [teamManagerPersonName, setTeamManagerPersonName] = useState<string | undefined>(undefined)
  const [teamModalRefreshKey, setTeamModalRefreshKey] = useState(0)
  const [lensOrderKey, setLensOrderKey] = useState(0)
  const [meetingNoteToOpen, setMeetingNoteToOpen] = useState<number | undefined>(undefined)

  async function reloadLenses() {
    invalidateLensesCache()
    const dbLenses = await getAllLenses()
    if (dbLenses.length > 0) {
      setLenses(dbLenses)
      // Update visible state for any new lenses
      setVisible(v => {
        const newVisible = { ...v }
        dbLenses.forEach(l => {
          if (!(l.key in newVisible)) {
            newVisible[l.key] = true
          }
        })
        return newVisible
      })
    }
    setLensOrderKey(k => k + 1)
  }

  useEffect(() => {
    async function init() {
      await seedIfEmpty()
      // Load lenses from database
      const dbLenses = await getAllLenses()
      if (dbLenses.length > 0) {
        setLenses(dbLenses)
        setVisible(Object.fromEntries(dbLenses.map(l => [l.key, true])) as Record<LensKey, boolean>)
      }
    }
    init()
  }, [])
  
  // Listen for lens updates
  useEffect(() => {
    function handleLensesUpdated() {
      reloadLenses()
    }
    window.addEventListener('lensesUpdated', handleLensesUpdated)
    return () => {
      window.removeEventListener('lensesUpdated', handleLensesUpdated)
    }
  }, [])
  
  // Reload lenses when returning from manage-lenses view
  useEffect(() => {
    if (currentView === 'main') {
      reloadLenses()
    }
  }, [currentView])

  useEffect(() => {
    function handleOpenMeetingNote(event: CustomEvent<{ noteId: number }>) {
      setMeetingNoteToOpen(event.detail.noteId)
      setCurrentView('meeting-notes')
    }

    window.addEventListener('openMeetingNote', handleOpenMeetingNote as EventListener)
    return () => {
      window.removeEventListener('openMeetingNote', handleOpenMeetingNote as EventListener)
    }
  }, [])

  function toggleLens(lens: LensKey) {
    setVisible(v => ({ ...v, [lens]: !v[lens] }))
  }

  function showAll() {
    setVisible(Object.fromEntries(lenses.map(l => [l.key, true])) as Record<LensKey, boolean>)
  }

  function hideAll() {
    setVisible(Object.fromEntries(lenses.map(l => [l.key, false])) as Record<LensKey, boolean>)
  }

  async function onExport() {
    const items = await db.items.toArray()
    const relationships = await db.relationships.toArray()
    const teamMembers = await db.teamMembers.toArray()
    const meetingNotes = await db.meetingNotes.toArray()
    const tasks = await db.tasks.toArray()
    const bundle: ExportBundle = {
      version: 1,
      exportedAt: new Date().toISOString(),
      items,
      relationships,
      teamMembers,
      meetingNotes,
      tasks,
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
    await db.transaction('rw', [db.items, db.relationships, db.teamMembers, db.meetingNotes, db.tasks], async () => {
      await db.items.clear()
      await db.relationships.clear()
      await db.teamMembers.clear()
      await db.meetingNotes.clear()
      await db.tasks.clear()
      await db.items.bulkAdd(data.items)
      await db.relationships.bulkAdd(data.relationships)
      if (data.teamMembers) {
        await db.teamMembers.bulkAdd(data.teamMembers)
      }
      if (data.meetingNotes) {
        await db.meetingNotes.bulkAdd(data.meetingNotes)
      }
      if (data.tasks) {
        await db.tasks.bulkAdd(data.tasks)
      }
    })
    alert('Import complete')
  }

  function handleNavigate(view: ViewType) {
    setCurrentView(view)
    // Reset related state when navigating
    if (view !== 'manage-team') {
      setTeamManagerPersonName(undefined)
    }
    if (view !== 'meeting-notes') {
      setMeetingNoteToOpen(undefined)
    }
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 dark:bg-slate-900">
      <Navigation currentView={currentView} onNavigate={handleNavigate} />
      <div className="flex flex-1 overflow-hidden">
        {currentView === 'main' && (
          <>
            <Sidebar 
              visible={visible} 
              onToggle={toggleLens} 
              onShowAll={showAll} 
              onHideAll={hideAll}
              onOrderChange={() => setLensOrderKey(k => k + 1)}
            />
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
                  <button className="px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700" onClick={onExport}>Export</button>
                  <label className="px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700 cursor-pointer">
                    Import
                    <input type="file" accept="application/json" className="hidden" onChange={e => {
                      const f = e.target.files?.[0]; if (f) onImport(f)
                    }} />
                  </label>
                </div>
              </header>
              <div className="grid grid-cols-1 gap-4" key={lensOrderKey}>
                {(() => {
                  // Use lenses from state (loaded from database) instead of static getOrderedLenses()
                  const order = getLensOrderSync()
                  const orderMap = new Map(order.map((key, idx) => [key, idx]))
                  const orderedLenses = [...lenses].sort((a, b) => {
                    const aIdx = orderMap.get(a.key) ?? 999
                    const bIdx = orderMap.get(b.key) ?? 999
                    return aIdx - bIdx
                  })
                  return orderedLenses.filter(l => visible[l.key]).map(l => (
                    <LensPanel key={l.key} lens={l.key} title={l.label} query={query} />
                  ))
                })()}
              </div>
            </main>
          </>
        )}
        {currentView === 'diagram' && (
          <GraphModal 
            visible={visible} 
            lensOrderKey={lensOrderKey}
            onNavigate={handleNavigate}
          />
        )}
        {currentView === 'architects' && (
          <TeamModal
            view="architects"
            refreshKey={teamModalRefreshKey}
            onOpenMeetingNote={(noteId) => {
              setMeetingNoteToOpen(noteId)
              handleNavigate('meeting-notes')
            }}
            onEditPerson={(personName) => {
              setTeamManagerPersonName(personName)
              handleNavigate('manage-team')
            }}
            onNavigate={handleNavigate}
          />
        )}
        {currentView === 'stakeholders' && (
          <TeamModal
            view="stakeholders"
            refreshKey={teamModalRefreshKey}
            onOpenMeetingNote={(noteId) => {
              setMeetingNoteToOpen(noteId)
              handleNavigate('meeting-notes')
            }}
            onEditPerson={(personName) => {
              setTeamManagerPersonName(personName)
              handleNavigate('manage-team')
            }}
            onNavigate={handleNavigate}
          />
        )}
        {currentView === 'manage-team' && (
          <TeamManager 
            initialPersonName={teamManagerPersonName}
            onSaved={() => {
              setTeamModalRefreshKey(k => k + 1)
            }}
            onOpenMeetingNote={(noteId) => {
              setMeetingNoteToOpen(noteId)
              handleNavigate('meeting-notes')
            }}
            onNavigate={handleNavigate}
          />
        )}
        {currentView === 'meeting-notes' && (
          <MeetingNotesModal
            initialNoteId={meetingNoteToOpen}
            onNoteDialogClose={() => {
              setMeetingNoteToOpen(undefined)
            }}
            onNavigate={handleNavigate}
          />
        )}
        {currentView === 'manage-lenses' && (
          <LensManager onNavigate={handleNavigate} />
        )}
      </div>
    </div>
  )
}

export default App
