// Registro do service worker, aviso de versão nova e saída de emergência.
//
// O registro fica em módulo (roda uma vez), não no hook: se cada componente registrasse,
// um remount pediria um novo SW. O hook só assina o estado.
//
// POR QUE HÁ DOIS CAMINHOS DE DETECÇÃO
//
// O caminho normal é o do próprio service worker (`onNeedRefresh`). Ele funciona — até o
// dia em que não funciona: um SW antigo que não se substitui deixa o navegador servindo a
// versão velha do cache, e recarregar não adianta, porque o F5 pergunta ao cache e não ao
// servidor. Aconteceu em produção.
//
// Por isso existe o segundo caminho: um `version.json` minúsculo, buscado com `no-store`,
// comparado com o carimbo embutido no pacote. É `fetch` puro — não passa por service
// worker nenhum, então não tem como travar junto com ele.
//
// E o botão "Atualizar agora" não recarrega a página: ele **desregistra os service
// workers e apaga os caches** antes de recarregar. Assim a saída é sempre a mesma, esteja
// o SW saudável ou travado, e ninguém precisa abrir o DevTools.
import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

/** De hora em hora: o navegador só reconsulta quando alguém pede. */
const INTERVALO_CHECAGEM = 60 * 60 * 1000

type Estado = { temAtualizacao: boolean; podeInstalar: boolean }

let estado: Estado = { temAtualizacao: false, podeInstalar: false }
const ouvintes = new Set<(e: Estado) => void>()
const emitir = (parcial: Partial<Estado>) => {
  estado = { ...estado, ...parcial }
  for (const f of ouvintes) f(estado)
}

/** Guardado pelo evento `beforeinstallprompt`: só ele pode abrir o diálogo nativo. */
let convite: (Event & { prompt(): Promise<void> }) | null = null

registerSW({
  onNeedRefresh: () => emitir({ temAtualizacao: true }),
  onRegisteredSW: (_url, registro) => {
    if (registro) setInterval(() => { registro.update().catch(() => { /* offline */ }) }, INTERVALO_CHECAGEM)
  },
})

/** Compara o carimbo publicado com o que está rodando. Não passa pelo service worker. */
async function checarVersaoPublicada() {
  if (estado.temAtualizacao) return
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return
    const { versao } = await r.json() as { versao?: string }
    if (versao && versao !== __VERSAO__) emitir({ temAtualizacao: true })
  } catch { /* offline: tenta na próxima */ }
}

/**
 * Saída de emergência: apaga tudo que o navegador guardou deste site e recarrega.
 * É o que o "limpar dados do site" faria na mão, num clique.
 */
export async function forcarAtualizacao() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? []
    await Promise.all(regs.map(r => r.unregister()))
  } catch { /* navegador sem SW: segue */ }
  try {
    const nomes = await caches.keys()
    await Promise.all(nomes.map(n => caches.delete(n)))
  } catch { /* sem Cache API: segue */ }
  // `replace` com um parâmetro novo, em vez de `reload`: recarregar pode ser servido do
  // cache de navegação, e aí todo o trabalho acima teria sido em vão. Os parâmetros que já
  // estavam na URL são preservados — algumas telas os usam (ex.: /fila?auditar=1).
  const url = new URL(window.location.href)
  url.searchParams.set(PARAM_RECARGA, String(Date.now()))
  window.location.replace(url.toString())
}

/** Marca de recarga forçada. Some da barra de endereço assim que a página abre. */
const PARAM_RECARGA = '_v'

if (typeof window !== 'undefined') {
  // Limpa a marca da recarga forçada para ela não ficar presa na barra de endereço
  // (e não ir junto num link copiado).
  const url = new URL(window.location.href)
  if (url.searchParams.has(PARAM_RECARGA)) {
    url.searchParams.delete(PARAM_RECARGA)
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault()
    convite = e as Event & { prompt(): Promise<void> }
    emitir({ podeInstalar: true })
  })
  window.addEventListener('appinstalled', () => { convite = null; emitir({ podeInstalar: false }) })

  // Voltar para a aba é o momento natural de perguntar ao servidor. Quem deixa o app
  // aberto o dia todo só descobriria a versão nova na virada da hora.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checarVersaoPublicada() })
  setInterval(checarVersaoPublicada, INTERVALO_CHECAGEM)
  checarVersaoPublicada()
}

export function usePwa() {
  const [e, setE] = useState<Estado>(estado)
  useEffect(() => { ouvintes.add(setE); setE(estado); return () => { ouvintes.delete(setE) } }, [])

  return {
    ...e,
    versao: __VERSAO__,
    /** Sempre pela saída de emergência: funciona com o SW saudável ou travado. */
    atualizar: forcarAtualizacao,
    instalar: async () => {
      if (!convite) return
      await convite.prompt()
      convite = null
      emitir({ podeInstalar: false })
    },
  }
}
