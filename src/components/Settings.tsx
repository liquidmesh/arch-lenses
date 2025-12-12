import { useEffect, useState } from 'react'
import { db, getAllLenses } from '../db'
import { type LensDefinition } from '../types'
import { invalidateLensesCache } from '../utils/lensOrder'
import { type Theme, defaultTheme, loadTheme, saveTheme, applyTheme } from '../utils/theme'

type ViewType = 'main' | 'diagram' | 'architects' | 'stakeholders' | 'manage-team' | 'meeting-notes'

interface SettingsProps {
  onNavigate: (view: ViewType) => void
}

export function Settings({ onNavigate: _onNavigate }: SettingsProps) {
  const [activeSection, setActiveSection] = useState<'lenses' | 'themes'>('lenses')
  const [theme, setTheme] = useState<Theme>(defaultTheme)

  useEffect(() => {
    const loadedTheme = loadTheme()
    setTheme(loadedTheme)
    applyTheme(loadedTheme)
  }, [])

  const handleThemeChange = (updates: Partial<Theme>) => {
    const newTheme = { ...theme, ...updates }
    setTheme(newTheme)
    saveTheme(newTheme)
    applyTheme(newTheme)
    // Dispatch event so other components can react to theme changes
    window.dispatchEvent(new CustomEvent('themeUpdated'))
  }

  const handleColorChange = (colorKey: keyof Theme['colors'], value: string) => {
    handleThemeChange({
      colors: {
        ...theme.colors,
        [colorKey]: value,
      },
    })
  }

  const handleFontChange = (fontKey: keyof Theme['fonts'], value: string) => {
    handleThemeChange({
      fonts: {
        ...theme.fonts,
        [fontKey]: value,
      },
    })
  }

  const resetTheme = () => {
    handleThemeChange(defaultTheme)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-900">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-xl font-semibold">Settings</h1>
      </div>
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-48 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <nav className="p-2 space-y-1">
            <button
              onClick={() => setActiveSection('lenses')}
              className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                activeSection === 'lenses'
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              Manage Architecture Lenses
            </button>
            <button
              onClick={() => setActiveSection('themes')}
              className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                activeSection === 'themes'
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              Themes
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeSection === 'lenses' && <LensManagerSection />}
          {activeSection === 'themes' && (
            <ThemesSection
              theme={theme}
              onColorChange={handleColorChange}
              onFontChange={handleFontChange}
              onReset={resetTheme}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// Lens Manager Section (extracted from LensManager component)
function LensManagerSection() {
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
    window.dispatchEvent(new CustomEvent('lensesUpdated'))
  }

  async function handleCreateLens() {
    if (!newLensKey.trim() || !newLensLabel.trim()) {
      alert('Both key and label are required')
      return
    }

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
    window.dispatchEvent(new CustomEvent('lensesUpdated'))
  }

  async function handleDeleteLens(lensId: number) {
    if (!confirm('Delete this lens? This will also delete all items in this lens.')) return
    
    const lens = lenses.find(l => l.id === lensId)
    if (!lens) return

    await db.items.where('lens').equals(lens.key).delete()
    await db.relationships.where('fromLens').equals(lens.key).delete()
    await db.relationships.where('toLens').equals(lens.key).delete()
    await db.lenses.delete(lensId)
    
    invalidateLensesCache()
    await loadLenses()
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
  )
}

// Themes Section
interface ThemesSectionProps {
  theme: Theme
  onColorChange: (colorKey: keyof Theme['colors'], value: string) => void
  onFontChange: (fontKey: keyof Theme['fonts'], value: string) => void
  onReset: () => void
}

function ThemesSection({ theme, onColorChange, onFontChange, onReset }: ThemesSectionProps) {
  const colorLabels: Record<keyof Theme['colors'], string> = {
    primary: 'Primary (Default)',
    secondary: 'Secondary',
    accent: 'Accent',
    background: 'Background',
    surface: 'Surface',
    text: 'Text',
    textSecondary: 'Text Secondary',
    border: 'Border',
    success: 'Success (Invest)',
    warning: 'Warning (Emerging)',
    error: 'Error (Divest)',
    info: 'Info (Plan)',
  }

  const fontLabels: Record<keyof Theme['fonts'], string> = {
    heading: 'Heading Font',
    body: 'Body Font',
    mono: 'Monospace Font',
  }

  const commonFonts = [
    'system-ui, -apple-system, sans-serif',
    'Inter, system-ui, sans-serif',
    'Roboto, sans-serif',
    'Open Sans, sans-serif',
    'Lato, sans-serif',
    'Montserrat, sans-serif',
    'Poppins, sans-serif',
    'Arial, sans-serif',
    'Helvetica, sans-serif',
    'Times New Roman, serif',
    'Georgia, serif',
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-lg">Theme Customization</h2>
        <button
          onClick={onReset}
          className="px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Reset to Default
        </button>
      </div>

      {/* Colors Section */}
      <div className="border border-slate-200 dark:border-slate-800 rounded p-4">
        <h3 className="font-medium mb-4">Colors</h3>
        <div className="grid grid-cols-2 gap-4">
          {(Object.keys(theme.colors) as Array<keyof Theme['colors']>).map(colorKey => (
            <div key={colorKey}>
              <label className="block text-sm mb-1">{colorLabels[colorKey]}</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={theme.colors[colorKey]}
                  onChange={e => onColorChange(colorKey, e.target.value)}
                  className="w-12 h-8 rounded border border-slate-300 dark:border-slate-700 cursor-pointer"
                />
                <input
                  type="text"
                  value={theme.colors[colorKey]}
                  onChange={e => onColorChange(colorKey, e.target.value)}
                  className="flex-1 px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700 font-mono"
                  placeholder="#000000"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fonts Section */}
      <div className="border border-slate-200 dark:border-slate-800 rounded p-4">
        <h3 className="font-medium mb-4">Fonts</h3>
        <div className="space-y-4">
          {(Object.keys(theme.fonts) as Array<keyof Theme['fonts']>).map(fontKey => (
            <div key={fontKey}>
              <label className="block text-sm mb-1">{fontLabels[fontKey]}</label>
              <select
                value={theme.fonts[fontKey]}
                onChange={e => onFontChange(fontKey, e.target.value)}
                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700"
              >
                {commonFonts.map(font => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={theme.fonts[fontKey]}
                onChange={e => onFontChange(fontKey, e.target.value)}
                placeholder="Custom font stack"
                className="w-full mt-2 px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700 font-mono"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Preview Section */}
      <div className="border border-slate-200 dark:border-slate-800 rounded p-4">
        <h3 className="font-medium mb-4">Preview</h3>
        <div className="space-y-3">
          <div
            style={{
              backgroundColor: theme.colors.background,
              color: theme.colors.text,
              padding: '16px',
              borderRadius: '8px',
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            <h4 style={{ fontFamily: theme.fonts.heading, color: theme.colors.primary, marginBottom: '8px' }}>
              Sample Heading
            </h4>
            <p style={{ fontFamily: theme.fonts.body, color: theme.colors.text, marginBottom: '8px' }}>
              This is sample body text to preview how your theme will look.
            </p>
            <div className="flex gap-2">
              <span
                style={{
                  backgroundColor: theme.colors.primary,
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                }}
              >
                Primary
              </span>
              <span
                style={{
                  backgroundColor: theme.colors.success,
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                }}
              >
                Success
              </span>
              <span
                style={{
                  backgroundColor: theme.colors.warning,
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                }}
              >
                Warning
              </span>
              <span
                style={{
                  backgroundColor: theme.colors.error,
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                }}
              >
                Error
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

