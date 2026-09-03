import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // The registration lives in main.tsx: the script this would inject only
      // registers the worker and never reloads the page, so an open tab — and an
      // installed app on the phone especially — kept running the build it started with.
      injectRegister: null,
      manifest: {
        name: 'Dandori',
        short_name: 'Dandori',
        lang: 'ru',
        description: 'Персональный планировщик: доска по дням, таймлайн, заметки.',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        background_color: '#16181d',
        theme_color: '#16181d',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the shell: everything Vite has built.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // Supabase is not cached: offline rests on IndexedDB, not on the HTTP cache.
        navigateFallbackDenylist: [/supabase\.co/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // A new worker takes over at once instead of waiting for every tab to close.
        skipWaiting: true,
      },
    }),
  ],
})
