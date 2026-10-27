import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Sistema Control Pollo',
        short_name: 'Control Pollo',
        theme_color: '#1e293b',
        icons: [
          {
            src: '/logo.png',
            sizes: '192x192',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,jpg,svg}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 // Aumentar a 5MB
      }
    })
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return 'vendor-react';
          }
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('leaflet')) return 'vendor-leaflet';
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (id.includes('xlsx') || id.includes('jspdf') || id.includes('html2canvas')) return 'vendor-export';
          return 'vendor';
        },
      },
    },
  },
})
