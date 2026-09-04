import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Carimbo desta build. Vai para dentro do pacote (via `define`) e também para um
 * `version.json` publicado ao lado dele. Comparar os dois é o que permite descobrir que
 * saiu versão nova SEM depender do service worker — que é justamente o que pode travar.
 */
const VERSAO = new Date().toISOString()

export default defineConfig({
  define: { __VERSAO__: JSON.stringify(VERSAO) },
  plugins: [
    {
      // Arquivo minúsculo, fora do precache (o workbox só guarda js/css/html/svg/png/woff2):
      // ele precisa vir sempre da rede para servir de referência.
      name: 'carimbo-de-versao',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ versao: VERSAO }) })
      },
    },
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
        navigateFallbackDenylist: [/^\/rest/, /^\/auth/, /^\/version\.json$/],
      },
    }),
  ],
  server: { port: 5173 },
})
