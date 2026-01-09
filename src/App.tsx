import { useEffect, useMemo, useState } from 'react'
import './index.css'
import { Sidebar } from './components/Sidebar'
import { LensPanel } from './components/LensPanel'
import { Navigation } from './components/Navigation'
import { LENSES, type LensKey, type ExportBundle, type LensDefinition } from './types'
import { seedIfEmpty, db, ensureDbReady } from './db'
import { GraphModal } from './components/GraphModal'
import { TeamModal } from './components/TeamModal'
import { TeamManager } from './components/TeamManager'
import { MeetingNotesModal } from './components/MeetingNotesModal'
import { Settings } from './components/Settings'
import { loadTheme, applyTheme, saveTheme, type Theme } from './utils/theme'
import { TasksModal } from './components/TasksModal'
import { DivestReplacementView } from './components/DivestReplacementView'
import { invalidateLensesCache, getLensOrderSync } from './utils/lensOrder'
import { getAllLenses } from './db'
import { Modal } from './components/Modal'

type ViewType = 'main' | 'diagram' | 'architects' | 'stakeholders' | 'manage-team' | 'meeting-notes' | 'settings' | 'tasks' | 'divest-replacement'

function App() {
  const [lenses, setLenses] = useState<LensDefinition[]>(LENSES)
  const initialVisible = useMemo(() => Object.fromEntries(lenses.map(l => [l.key, true])) as Record<LensKey, boolean>, [lenses])
  const [visible, setVisible] = useState<Record<LensKey, boolean>>(initialVisible)
  const [query, setQuery] = useState('')
  const [currentView, setCurrentView] = useState<ViewType>('main')
  const [filteredLens, setFilteredLens] = useState<LensKey | null>(null) // Filter main view to single lens
  const [teamManagerPersonName, setTeamManagerPersonName] = useState<string | undefined>(undefined)
  const [teamModalRefreshKey, setTeamModalRefreshKey] = useState(0)
  const [lensOrderKey, setLensOrderKey] = useState(0)
  const [meetingNoteToOpen, setMeetingNoteToOpen] = useState<number | undefined>(undefined)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportOptions, setExportOptions] = useState<{
    all: boolean
    lenses: boolean
    people: boolean
    notes: boolean
    customLenses: boolean
    theme: boolean
  }>({
    all: true,
    lenses: false,
    people: false,
    notes: false,
    customLenses: false,
    theme: false,
  })
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importData, setImportData] = useState<ExportBundle | null>(null)
  const [importOptions, setImportOptions] = useState<{
    lenses: boolean
    people: boolean
    notes: boolean
    customLenses: boolean
    theme: boolean
  }>({
    lenses: false,
    people: false,
    notes: false,
    customLenses: false,
    theme: false,
  })

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
      try {
        // Load and apply theme
        const theme = loadTheme()
        applyTheme(theme)
        
        // Ensure database is ready (open and migrations complete)
        await ensureDbReady()
        await seedIfEmpty()
        // Load lenses from database (getAllLenses will seed if needed)
        const dbLenses = await getAllLenses()
        if (dbLenses.length > 0) {
          setLenses(dbLenses)
          setVisible(Object.fromEntries(dbLenses.map(l => [l.key, true])) as Record<LensKey, boolean>)
        } else {
          // If still no lenses after getAllLenses (which should have seeded), use defaults as fallback
          console.error('Failed to load lenses from database, using defaults')
          setLenses(LENSES)
          setVisible(Object.fromEntries(LENSES.map(l => [l.key, true])) as Record<LensKey, boolean>)
        }
      } catch (error) {
        console.error('Error initializing app:', error)
        // Fallback to defaults on error
        setLenses(LENSES)
        setVisible(Object.fromEntries(LENSES.map(l => [l.key, true])) as Record<LensKey, boolean>)
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

  // Listen for lens order updates
  useEffect(() => {
    function handleLensOrderUpdated() {
      // Increment lensOrderKey to force re-render of components that depend on lens order
      setLensOrderKey(k => k + 1)
    }
    window.addEventListener('lensOrderUpdated', handleLensOrderUpdated)
    return () => {
      window.removeEventListener('lensOrderUpdated', handleLensOrderUpdated)
    }
  }, [])
  
  // Reload lenses when returning from settings view
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
    
    function handleEditPerson(event: CustomEvent<{ personName: string }>) {
      setTeamManagerPersonName(event.detail.personName)
      setCurrentView('manage-team')
    }

    window.addEventListener('openMeetingNote', handleOpenMeetingNote as EventListener)
    window.addEventListener('editPerson', handleEditPerson as EventListener)
    return () => {
      window.removeEventListener('openMeetingNote', handleOpenMeetingNote as EventListener)
      window.removeEventListener('editPerson', handleEditPerson as EventListener)
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

  function handleExportClick() {
    setExportOptions({
      all: true,
      lenses: false,
      people: false,
      notes: false,
      customLenses: false,
      theme: false,
    })
    setExportDialogOpen(true)
  }

  async function onExport() {
    const bundle: ExportBundle = {
      version: 1,
      exportedAt: new Date().toISOString(),
      items: [],
      relationships: [],
    }

    if (exportOptions.all) {
      bundle.items = await db.items.toArray()
      bundle.relationships = await db.relationships.toArray()
      bundle.teamMembers = await db.teamMembers.toArray()
      bundle.meetingNotes = await db.meetingNotes.toArray()
      bundle.tasks = await db.tasks.toArray()
      bundle.lenses = await db.lenses.toArray()
      const theme = loadTheme()
      bundle.theme = theme
    } else {
      if (exportOptions.lenses) {
        bundle.items = await db.items.toArray()
        bundle.relationships = await db.relationships.toArray()
      }
      if (exportOptions.people) {
        bundle.teamMembers = await db.teamMembers.toArray()
      }
      if (exportOptions.notes) {
        bundle.meetingNotes = await db.meetingNotes.toArray()
        bundle.tasks = await db.tasks.toArray()
      }
      if (exportOptions.customLenses) {
        bundle.lenses = await db.lenses.toArray()
      }
      if (exportOptions.theme) {
        const theme = loadTheme()
        bundle.theme = theme
      }
    }

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'arch-lenses-export.json'
    a.click()
    URL.revokeObjectURL(url)
    setExportDialogOpen(false)
  }

  async function handleImportClick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    
    try {
      const text = await file.text()
      const data = JSON.parse(text) as ExportBundle
      setImportFile(file)
      setImportData(data)
      
      // Auto-detect what's available in the import file
      const hasLenses = !!(data.items && data.items.length > 0)
      const hasPeople = !!(data.teamMembers && data.teamMembers.length > 0)
      const hasNotes = !!((data.meetingNotes && data.meetingNotes.length > 0) || (data.tasks && data.tasks.length > 0))
      const hasCustomLenses = !!(data.lenses && data.lenses.length > 0)
      const hasTheme = !!data.theme
      
      setImportOptions({
        lenses: hasLenses,
        people: hasPeople,
        notes: hasNotes,
        customLenses: hasCustomLenses,
        theme: hasTheme,
      })
      
      setImportDialogOpen(true)
    } catch (error) {
      console.error('Error reading import file:', error)
      alert('Error reading import file. Please check the file format.')
    }
    // Reset file input
    e.target.value = ''
  }

  async function onImport() {
    if (!importData) return
    
    // Build confirmation message
    const selectedTypes: string[] = []
    if (importOptions.lenses) selectedTypes.push('Lenses (items and relationships)')
    if (importOptions.people) selectedTypes.push('People (team members)')
    if (importOptions.notes) selectedTypes.push('Notes (meeting notes and tasks)')
    if (importOptions.customLenses) selectedTypes.push('Custom Architecture Lenses')
    if (importOptions.theme) selectedTypes.push('Theme Settings')
    
    if (selectedTypes.length === 0) {
      alert('Please select at least one data type to import.')
      return
    }
    
    const message = `Import will REPLACE the following data types:\n\n${selectedTypes.join('\n')}\n\nThis will completely replace existing data of these types. Continue?`
    if (!confirm(message)) return
    
    try {
      // Ensure database is ready
      await ensureDbReady()
      
      // Determine which tables to clear and import
      const tablesToClear: string[] = []
      if (importOptions.lenses) {
        tablesToClear.push('items', 'relationships')
      }
      if (importOptions.people) {
        tablesToClear.push('teamMembers')
      }
      if (importOptions.notes) {
        tablesToClear.push('meetingNotes', 'tasks')
      }
      if (importOptions.customLenses) {
        tablesToClear.push('lenses')
      }
      
      await db.transaction('rw', [db.items, db.relationships, db.teamMembers, db.meetingNotes, db.tasks, db.lenses], async () => {
        // Clear only selected tables
        if (importOptions.lenses) {
          await db.items.clear()
          await db.relationships.clear()
        }
        if (importOptions.people) {
          await db.teamMembers.clear()
        }
        if (importOptions.notes) {
          await db.meetingNotes.clear()
          await db.tasks.clear()
        }
        if (importOptions.customLenses) {
          await db.lenses.clear()
        }
        
        // Import only selected data
        if (importOptions.lenses && importData.items) {
          await db.items.bulkAdd(importData.items)
          if (importData.relationships) {
            await db.relationships.bulkAdd(importData.relationships)
          }
        }
        if (importOptions.people && importData.teamMembers) {
          await db.teamMembers.bulkAdd(importData.teamMembers)
        }
        if (importOptions.notes) {
          if (importData.meetingNotes) {
            await db.meetingNotes.bulkAdd(importData.meetingNotes)
          }
          if (importData.tasks) {
            await db.tasks.bulkAdd(importData.tasks)
          }
        }
        if (importOptions.customLenses && importData.lenses) {
          // Remove id fields to avoid conflicts when adding
          const lensesToImport = importData.lenses.map(lens => {
            const { id, ...lensWithoutId } = lens
            return lensWithoutId
          })
          // Add all lenses (table was already cleared above)
          try {
            await db.lenses.bulkAdd(lensesToImport)
          } catch (error) {
            // If bulkAdd fails, try adding one by one to see which ones fail
            console.warn('bulkAdd failed, trying individual adds:', error)
            for (const lens of lensesToImport) {
              try {
                await db.lenses.add(lens)
              } catch (err) {
                console.error(`Failed to import lens ${lens.key}:`, err)
              }
            }
          }
        }
      })
      
      // Import theme if selected
      if (importOptions.theme && importData.theme) {
        // Validate and merge theme data
        const currentTheme = loadTheme()
        const incomingTheme = (importData.theme as any) || {}
        const importedTheme: Theme = {
          name: incomingTheme.name || currentTheme.name,
          colors: {
            ...currentTheme.colors,
            ...(incomingTheme.colors || {}),
          },
          fonts: {
            ...currentTheme.fonts,
            ...(incomingTheme.fonts || {}),
          },
        }
        saveTheme(importedTheme)
        applyTheme(importedTheme)
      }
      
      alert('Import complete')
      setImportDialogOpen(false)
      setImportFile(null)
      setImportData(null)
      setImportOptions({ lenses: false, people: false, notes: false, customLenses: false, theme: false })
      
      // Refresh views
      setTeamModalRefreshKey(k => k + 1)
      setLensOrderKey(k => k + 1)
      await reloadLenses()
    } catch (error) {
      console.error('Error during import:', error)
      alert(`Import failed: ${error instanceof Error ? error.message : String(error)}\n\nPlease check the browser console for details.`)
    }
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
    // Clear lens filter when navigating away from main view
    if (view !== 'main') {
      setFilteredLens(null)
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
              onFilterLens={(lens) => setFilteredLens(lens === filteredLens ? null : lens)}
              filteredLens={filteredLens}
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
                  <button className="px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700" onClick={handleExportClick}>Export</button>
                  <label className="px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700 cursor-pointer">
                    Import
                    <input type="file" accept="application/json" className="hidden" onChange={handleImportClick} />
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
                  const visibleLenses = orderedLenses.filter(l => visible[l.key])
                  const lensesToShow = filteredLens 
                    ? visibleLenses.filter(l => l.key === filteredLens)
                    : visibleLenses
                  return lensesToShow.length > 0 ? (
                    lensesToShow.map(l => (
                      <LensPanel key={l.key} lens={l.key} title={l.label} query={query} />
                    ))
                  ) : filteredLens ? (
                    <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                      The filtered lens is currently hidden. Use the checkbox to show it.
                    </div>
                  ) : null
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
        {(currentView === 'architects' || currentView === 'stakeholders') && (
          <TeamModal
            refreshKey={teamModalRefreshKey}
            visible={visible}
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
            onEditPerson={(personName) => {
              setTeamManagerPersonName(personName)
              handleNavigate('manage-team')
            }}
          />
        )}
        {currentView === 'settings' && (
          <Settings onNavigate={handleNavigate} />
        )}
        {currentView === 'tasks' && (
          <TasksModal
            onEditPerson={(personName) => {
              setTeamManagerPersonName(personName)
              handleNavigate('manage-team')
            }}
            onOpenMeetingNote={(noteId) => {
              setMeetingNoteToOpen(noteId)
              handleNavigate('meeting-notes')
            }}
            onNavigate={handleNavigate}
          />
        )}
        {currentView === 'divest-replacement' && (
          <DivestReplacementView onNavigate={handleNavigate} />
        )}
      </div>
      <Modal
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        title="Export Data"
        footer={
          <>
            <button
              className="px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-700"
              onClick={() => setExportDialogOpen(false)}
            >
              Cancel
            </button>
            <button
              className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white"
              onClick={onExport}
            >
              Export
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">Select what to export:</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="export-option"
              checked={exportOptions.all}
              onChange={() => setExportOptions({
                all: true,
                lenses: false,
                people: false,
                notes: false,
                customLenses: false,
                theme: false,
              })}
            />
            <span>All</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="export-option"
              checked={!exportOptions.all && exportOptions.lenses}
              onChange={() => setExportOptions({
                all: false,
                lenses: true,
                people: false,
                notes: false,
                customLenses: false,
                theme: false,
              })}
            />
            <span>Lenses (items and relationships)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="export-option"
              checked={!exportOptions.all && exportOptions.people}
              onChange={() => setExportOptions({
                all: false,
                lenses: false,
                people: true,
                notes: false,
                customLenses: false,
                theme: false,
              })}
            />
            <span>People (team members)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="export-option"
              checked={!exportOptions.all && exportOptions.notes}
              onChange={() => setExportOptions({
                all: false,
                lenses: false,
                people: false,
                notes: true,
                customLenses: false,
                theme: false,
              })}
            />
            <span>Notes (meeting notes and tasks)</span>
          </label>
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Additional options (when not exporting all):</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={exportOptions.customLenses}
                disabled={exportOptions.all}
                onChange={e => setExportOptions(prev => ({ ...prev, customLenses: e.target.checked }))}
              />
              <span>Custom Architecture Lenses</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={exportOptions.theme}
                disabled={exportOptions.all}
                onChange={e => setExportOptions(prev => ({ ...prev, theme: e.target.checked }))}
              />
              <span>Theme Settings</span>
            </label>
          </div>
        </div>
      </Modal>
      <Modal
        open={importDialogOpen}
        onClose={() => {
          setImportDialogOpen(false)
          setImportFile(null)
          setImportData(null)
          setImportOptions({ lenses: false, people: false, notes: false, customLenses: false, theme: false })
        }}
        title="Import Data"
        footer={
          <>
            <button
              className="px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-700"
              onClick={() => {
                setImportDialogOpen(false)
                setImportFile(null)
                setImportData(null)
                setImportOptions({ lenses: false, people: false, notes: false, customLenses: false, theme: false })
              }}
            >
              Cancel
            </button>
            <button
              className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white"
              onClick={onImport}
            >
              Import
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {importFile && (
            <div className="text-sm text-slate-600 dark:text-slate-400">
              <p className="font-medium mb-2">File: {importFile.name}</p>
              {importData && (
                <div className="text-xs space-y-1 mb-4">
                  {importData.items && importData.items.length > 0 && (
                    <p>• {importData.items.length} items, {importData.relationships?.length || 0} relationships</p>
                  )}
                  {importData.teamMembers && importData.teamMembers.length > 0 && (
                    <p>• {importData.teamMembers.length} team members</p>
                  )}
                  {((importData.meetingNotes && importData.meetingNotes.length > 0) || (importData.tasks && importData.tasks.length > 0)) && (
                    <p>• {importData.meetingNotes?.length || 0} meeting notes, {importData.tasks?.length || 0} tasks</p>
                  )}
                  {importData.lenses && importData.lenses.length > 0 && (
                    <p>• {importData.lenses.length} custom architecture lenses</p>
                  )}
                  {importData.theme && (
                    <p>• Theme settings</p>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Select what to import:</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              <strong>Note:</strong> Import will REPLACE (not merge) the selected data types. Existing data of the selected types will be completely replaced.
            </p>
            {importData && (
              <>
                {importData.items && importData.items.length > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importOptions.lenses}
                      onChange={e => setImportOptions(prev => ({ ...prev, lenses: e.target.checked }))}
                    />
                    <span>Lenses (items and relationships) - {importData.items.length} items, {importData.relationships?.length || 0} relationships</span>
                  </label>
                )}
                {importData.teamMembers && importData.teamMembers.length > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importOptions.people}
                      onChange={e => setImportOptions(prev => ({ ...prev, people: e.target.checked }))}
                    />
                    <span>People (team members) - {importData.teamMembers.length} members</span>
                  </label>
                )}
                {((importData.meetingNotes && importData.meetingNotes.length > 0) || (importData.tasks && importData.tasks.length > 0)) && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importOptions.notes}
                      onChange={e => setImportOptions(prev => ({ ...prev, notes: e.target.checked }))}
                    />
                    <span>Notes (meeting notes and tasks) - {importData.meetingNotes?.length || 0} notes, {importData.tasks?.length || 0} tasks</span>
                  </label>
                )}
                {importData.lenses && importData.lenses.length > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importOptions.customLenses}
                      onChange={e => setImportOptions(prev => ({ ...prev, customLenses: e.target.checked }))}
                    />
                    <span>Custom Architecture Lenses - {importData.lenses.length} lenses</span>
                  </label>
                )}
                {importData.theme && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importOptions.theme}
                      onChange={e => setImportOptions(prev => ({ ...prev, theme: e.target.checked }))}
                    />
                    <span>Theme Settings</span>
                  </label>
                )}
              </>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default App
