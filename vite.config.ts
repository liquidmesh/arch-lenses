import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
// For GitHub Pages: Set GITHUB_PAGES=true and REPO_NAME=your-repo-name
// The base path should match your GitHub repository name
const repoName = process.env.REPO_NAME || 'arch-lenses'
const basePath = process.env.GITHUB_PAGES ? `/${repoName}/` : '/'

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'Arch Lenses',
        short_name: 'Lenses',
        description: 'Professional architecture lenses with local-first storage',
        theme_color: '#3c76b5',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: basePath,
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Force update check on every navigation
        navigationPreload: false,
        runtimeCaching: [
          {
            // HTML files should always be fetched fresh
            urlPattern: /index\.html$/,
            handler: 'NetworkOnly',
          },
          {
            // Service worker and manifest should always be fresh
            urlPattern: /\.(?:sw\.js|webmanifest)$/,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\.(?:js|css)$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'static-resources',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
            },
          },
        ],
      },
    }),
  ],
})
