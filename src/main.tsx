import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Register service worker for PWA (auto-update)
if ('serviceWorker' in navigator) {
  // dynamic import to avoid build issues if plugin not active
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      immediate: true,
      onRegistered(registration) {
        // Check for updates every 5 minutes
        setInterval(() => {
          registration?.update()
        }, 5 * 60 * 1000)
        
        // Also check on page visibility change (when user returns to tab)
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) {
            registration?.update()
          }
        })
      },
      onNeedRefresh() {
        // Force reload when update is available
        if (confirm('A new version is available. Reload now?')) {
          window.location.reload()
        }
      },
      onOfflineReady() {
        console.log('App ready to work offline')
      },
    })
  }).catch(() => {})
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
