import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg', 'pwa/icon.svg'],
      manifest: {
        name: 'WaveMap AI',
        short_name: 'WaveMap',
        description: 'Crypto trading support app with live market charts and Elliott-wave-informed AI analysis.',
        theme_color: '#07101f',
        background_color: '#07101f',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/pwa/icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.binance\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'binance-api-cache',
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 5,
              },
            },
          },
          {
            urlPattern: /\/\.netlify\/functions\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'functions-cache',
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 2,
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
})
