import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Este proyecto se publica con Firebase Hosting (ya lo activaste), por eso
// base y start_url son la raíz "/". Si en vez de eso usaras GitHub Pages,
// tendrías que cambiar ambos a '/ibime-app/' (el nombre de tu repo).
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon-16.png', 'icons/favicon-32.png'],
      manifest: {
        name: 'IBIME - Sistema Administrativo',
        short_name: 'IBIME',
        description: 'Caja, cafetería y estancia del colegio IBIME',
        theme_color: '#0B3B5C',
        background_color: '#0B3B5C',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
})
