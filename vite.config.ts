import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt': quem decide a hora de recarregar é o usuário (ver src/hooks/usePwa.ts).
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'logo.png', 'logo-branca.png'],
      manifest: {
        id: '/',
        name: 'Roteiros — Grupo Nova Opção',
        short_name: 'Roteiros',
        description: 'Gestão de roteiros, expedição e execução técnica',
        theme_color: '#12365a',
        background_color: '#f5f6f8',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        lang: 'pt-BR',
        dir: 'ltr',
        categories: ['business', 'productivity'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Atalhos do ícone (segurar o app na tela inicial): cada papel entra direto no que usa.
        shortcuts: [
          { name: 'Meu roteiro', short_name: 'Meu roteiro', description: 'O roteiro do dia do técnico', url: '/meu-roteiro' },
          { name: 'Planejamento', short_name: 'Planejar', description: 'Quadro do PCM', url: '/planejamento' },
          { name: 'Expedição', short_name: 'Expedição', description: 'Separação do material', url: '/expedicao' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Sem isso o cache da versão anterior fica no disco do usuário para sempre.
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/rest/, /^\/auth/],
      },
    }),
  ],
  server: { port: 5173 },
})
