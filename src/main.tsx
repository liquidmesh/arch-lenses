import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Register service worker for PWA (auto-update)
if ('serviceWorker' in navigator) {
  // Clear all caches on load to ensure fresh content
  caches.keys().then(cacheNames => {
    cacheNames.forEach(cacheName => {
      // Keep only the latest cache, delete old ones
      if (cacheName.includes('html-cache') || cacheName.includes('static-resources')) {
        caches.delete(cacheName)
      }
    })
  })

  // dynamic import to avoid build issues if plugin not active
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      immediate: true,
      onRegistered(registration) {
        // Immediately check for updates
        registration?.update()
        
        // Check for updates every 1 minute (more frequent)
        setInterval(() => {
          registration?.update()
        }, 60 * 1000)
        
        // Also check on page visibility change (when user returns to tab)
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) {
            registration?.update()
          }
        })
        
        // Check on focus
        window.addEventListener('focus', () => {
          registration?.update()
        })
      },
      onNeedRefresh() {
        // Force reload when update is available - don't ask, just reload
        window.location.reload()
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
