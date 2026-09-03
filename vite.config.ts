import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
        // Precache оболочки: всё, что собрал Vite.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // Supabase не кэшируем: офлайн держится на IndexedDB, а не на HTTP-кэше.
        navigateFallbackDenylist: [/supabase\.co/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
    }),
  ],
})
