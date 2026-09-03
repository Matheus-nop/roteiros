import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.svg', 'favicon.svg'],
      manifest: {
        name: 'Roteiros — Grupo Nova Opção',
        short_name: 'Roteiros',
        description: 'Gestão de roteiros, expedição e execução técnica',
        theme_color: '#12365a',
        background_color: '#f5f6f8',
        display: 'standalone',
        lang: 'pt-BR',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/rest/, /^\/auth/],
      },
    }),
  ],
  server: { port: 5173 },
})
