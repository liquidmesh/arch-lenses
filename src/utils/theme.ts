export interface ThemeColors {
  primary: string // Used for: Primary, Default (no status)
  secondary: string
  accent: string
  background: string
  surface: string
  text: string
  textSecondary: string
  border: string
  success: string // Used for: Success, Invest
  warning: string // Used for: Warning, Emerging
  error: string // Used for: Error, Divest
  info: string // Used for: Info, Plan
}

export interface ThemeFonts {
  heading: string
  body: string
  mono: string
}

export interface Theme {
  name: string
  colors: ThemeColors
  fonts: ThemeFonts
}

export const defaultTheme: Theme = {
  name: 'Default',
  colors: {
    primary: '#3b82f6', // blue-500
    secondary: '#64748b', // slate-500
    accent: '#8b5cf6', // violet-500
    background: '#f8fafc', // slate-50
    surface: '#ffffff',
    text: '#1e293b', // slate-800
    textSecondary: '#64748b', // slate-500
    border: '#cbd5e1', // slate-300
    success: '#10b981', // emerald-500
    warning: '#f59e0b', // amber-500
    error: '#ef4444', // red-500
    info: '#3b82f6', // blue-500
  },
  fonts: {
    heading: 'system-ui, -apple-system, sans-serif',
    body: 'system-ui, -apple-system, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  },
}

export function loadTheme(): Theme {
  const saved = localStorage.getItem('app-theme')
  if (saved) {
    try {
      return JSON.parse(saved)
    } catch {
      return defaultTheme
    }
  }
  return defaultTheme
}

export function saveTheme(theme: Theme): void {
  localStorage.setItem('app-theme', JSON.stringify(theme))
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  
  // Apply colors as CSS variables
  root.style.setProperty('--theme-primary', theme.colors.primary)
  root.style.setProperty('--theme-secondary', theme.colors.secondary)
  root.style.setProperty('--theme-accent', theme.colors.accent)
  root.style.setProperty('--theme-background', theme.colors.background)
  root.style.setProperty('--theme-surface', theme.colors.surface)
  root.style.setProperty('--theme-text', theme.colors.text)
  root.style.setProperty('--theme-text-secondary', theme.colors.textSecondary)
  root.style.setProperty('--theme-border', theme.colors.border)
  root.style.setProperty('--theme-success', theme.colors.success)
  root.style.setProperty('--theme-warning', theme.colors.warning)
  root.style.setProperty('--theme-error', theme.colors.error)
  root.style.setProperty('--theme-info', theme.colors.info)
  
  // Apply fonts as CSS variables
  root.style.setProperty('--theme-font-heading', theme.fonts.heading)
  root.style.setProperty('--theme-font-body', theme.fonts.body)
  root.style.setProperty('--theme-font-mono', theme.fonts.mono)
}




