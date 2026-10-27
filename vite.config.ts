import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['icon.svg'],
    manifest: {
      name: 'Zürich Tram Atlas', short_name: 'Tram Atlas', lang: 'de-CH',
      description: 'Das Zürcher Tramnetz entdecken und verstehen.', start_url: '/', scope: '/',
      theme_color: '#f6f5f0', background_color: '#f6f5f0', display: 'standalone',
      icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }],
    },
    workbox: {
      clientsClaim: true,
      globPatterns: ['**/*.{js,css,html,svg,png,json,geojson,woff2}'],
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      navigateFallback: '/index.html',
    },
  })],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: '0.0.0.0', port: 5190 },
  preview: { host: '0.0.0.0', port: 5190 },
})
