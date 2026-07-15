import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      strategies: 'generateSW',
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Bianco',
        short_name: 'Bianco',
        description: 'Clear receipts, even offline.',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: '#173f37',
        background_color: '#173f37',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/auth\//],
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) =>
              request.destination === 'image' && !url.pathname.startsWith('/api/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'bianco-public-images',
              expiration: { maxEntries: 20, maxAgeSeconds: 2592000 }
            }
          }
        ]
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://api:8000',
        changeOrigin: true,
        headers: {
          Authorization: `Bearer ${process.env.BIANCO_SYNC_TOKEN || 'development-token'}`
        }
      }
    }
  },
  test: {
    include: ['tests/**/*.test.js'],
    coverage: { reporter: ['text', 'html'] }
  }
})
