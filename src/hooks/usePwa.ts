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
//
// O AVISO NÃO PODE VIRAR PRAGA
//
// Três regras, aprendidas na marra (o aviso ficava fixo na tela e o botão parecia não
// funcionar, porque um deploy novo chegava logo depois do anterior):
//
// 1. Dá para dizer "depois". A dispensa é gravada **por versão**: aquele carimbo não
//    incomoda mais, mas o próximo deploy avisa de novo.
// 2. A atualização é conferida. Antes de recarregar guardamos o carimbo esperado; quando a
//    página volta, ou ele bate (silêncio) ou não bate — e aí o aviso muda de texto em vez
//    de oferecer o mesmo botão que já não resolveu.
// 3. A checagem tem intervalo mínimo. `visibilitychange` dispara toda vez que se volta
//    para o app; no celular isso é o dia inteiro.
import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

/** De hora em hora: o navegador só reconsulta quando alguém pede. */
const INTERVALO_CHECAGEM = 60 * 60 * 1000
/** Piso entre duas consultas ao servidor, para o `visibilitychange` não virar enxurrada. */
const INTERVALO_MINIMO = 5 * 60 * 1000

/** Carimbo que o usuário mandou esperar. */
const CHAVE_ADIADA = 'roteiros:versao-adiada'
/** Carimbo que a recarga forçada deveria ter trazido. Serve para conferir se veio. */
const CHAVE_TENTATIVA = 'roteiros:versao-tentada'

type Estado = {
  temAtualizacao: boolean
  /** A recarga forçada não trouxe a versão nova: o texto do aviso muda. */
  falhouAtualizar: boolean
  /** Carimbo publicado, quando conhecido. É a chave da dispensa. */
  versaoNova: string | null
  podeInstalar: boolean
}

let estado: Estado = { temAtualizacao: false, falhouAtualizar: false, versaoNova: null, podeInstalar: false }
const ouvintes = new Set<(e: Estado) => void>()
const emitir = (parcial: Partial<Estado>) => {
  estado = { ...estado, ...parcial }
  for (const f of ouvintes) f(estado)
}

/** localStorage falha em aba anônima e com cookies bloqueados; nada aqui é essencial. */
const ler = (chave: string): string | null => { try { return localStorage.getItem(chave) } catch { return null } }
const gravar = (chave: string, valor: string | null) => {
  try { valor === null ? localStorage.removeItem(chave) : localStorage.setItem(chave, valor) } catch { /* sem storage */ }
}

/** Carimbo publicado agora no servidor, ou null se não deu para saber. */
async function versaoPublicada(): Promise<string | null> {
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return null
    const { versao } = await r.json() as { versao?: string }
    return versao ?? null
  } catch { return null /* offline: tenta na próxima */ }
}

/** Anuncia, a não ser que o usuário já tenha dito "depois" para exatamente este carimbo. */
function anunciar(versao: string | null) {
  if (versao && ler(CHAVE_ADIADA) === versao) return
  emitir({ temAtualizacao: true, versaoNova: versao })
}

/** Guardado pelo evento `beforeinstallprompt`: só ele pode abrir o diálogo nativo. */
let convite: (Event & { prompt(): Promise<void> }) | null = null

registerSW({
  onNeedRefresh: () => { void versaoPublicada().then(anunciar) },
  onRegisteredSW: (_url, registro) => {
    if (registro) setInterval(() => { registro.update().catch(() => { /* offline */ }) }, INTERVALO_CHECAGEM)
  },
})

let ultimaChecagem = 0

/** Compara o carimbo publicado com o que está rodando. Não passa pelo service worker. */
async function checarVersaoPublicada() {
  if (estado.temAtualizacao) return
  if (Date.now() - ultimaChecagem < INTERVALO_MINIMO) return
  ultimaChecagem = Date.now()
  const versao = await versaoPublicada()
  if (!versao || versao === __VERSAO__) return
  anunciar(versao)
}

/**
 * Saída de emergência: apaga tudo que o navegador guardou deste site e recarrega.
 * É o que o "limpar dados do site" faria na mão, num clique.
 */
export async function forcarAtualizacao() {
  // Guardado antes de sair: quando a página voltar, é o que confere se a troca aconteceu.
  const alvo = estado.versaoNova ?? await versaoPublicada()
  gravar(CHAVE_TENTATIVA, alvo)
  gravar(CHAVE_ADIADA, null)

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
  const destino = url.toString()
  // Apagar o Cache API não mexe no cache HTTP do navegador, que é onde o `index.html`
  // velho pode estar preso (foi assim no iPhone). `cache: 'reload'` obriga a ida à rede e
  // deixa a resposta nova no lugar da antiga, antes de navegar para ela.
  try { await fetch(destino, { cache: 'reload' }) } catch { /* offline: navega assim mesmo */ }
  window.location.replace(destino)
}

/** "Depois": esconde o aviso e não repete para esta mesma versão. */
export function adiarAtualizacao() {
  if (estado.versaoNova) gravar(CHAVE_ADIADA, estado.versaoNova)
  emitir({ temAtualizacao: false, falhouAtualizar: false })
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

  // Conferência da atualização anterior. Se o carimbo esperado não é o que está rodando, a
  // recarga forçada não resolveu: insistir no mesmo botão só repete o que já falhou.
  const tentada = ler(CHAVE_TENTATIVA)
  if (tentada) {
    gravar(CHAVE_TENTATIVA, null)
    if (tentada !== __VERSAO__) {
      gravar(CHAVE_ADIADA, tentada)
      estado = { ...estado, temAtualizacao: true, falhouAtualizar: true, versaoNova: tentada }
    }
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault()
    convite = e as Event & { prompt(): Promise<void> }
    emitir({ podeInstalar: true })
  })
  window.addEventListener('appinstalled', () => { convite = null; emitir({ podeInstalar: false }) })

  // Voltar para a aba é o momento natural de perguntar ao servidor. Quem deixa o app
  // aberto o dia todo só descobriria a versão nova na virada da hora.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void checarVersaoPublicada() })
  setInterval(() => { void checarVersaoPublicada() }, INTERVALO_CHECAGEM)
  void checarVersaoPublicada()
}

export function usePwa() {
  const [e, setE] = useState<Estado>(estado)
  useEffect(() => { ouvintes.add(setE); setE(estado); return () => { ouvintes.delete(setE) } }, [])

  return {
    ...e,
    versao: __VERSAO__,
    /** Sempre pela saída de emergência: funciona com o SW saudável ou travado. */
    atualizar: forcarAtualizacao,
    adiar: adiarAtualizacao,
    instalar: async () => {
      if (!convite) return
      await convite.prompt()
      convite = null
      emitir({ podeInstalar: false })
    },
  }
}
