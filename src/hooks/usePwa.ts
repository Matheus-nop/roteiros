// Registro do service worker e estado da instalação.
//
// O registro fica em módulo (roda uma vez), não no hook: se cada componente
// registrasse, um remount pediria um novo SW. O hook só assina o estado.
//
// `registerType` é 'prompt' no vite.config: a versão nova espera o usuário
// clicar. Recarregar sozinho no meio de um roteiro apagaria o que o técnico
// estava marcando.
import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

/** De hora em hora: o navegador só reconsulta o SW quando alguém pede. */
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

const aplicarAtualizacao = registerSW({
  onNeedRefresh: () => emitir({ temAtualizacao: true }),
  onRegisteredSW: (_url, registro) => {
    if (!registro) return
    const checar = () => { registro.update().catch(() => { /* offline: tenta na próxima */ }) }
    setInterval(checar, INTERVALO_CHECAGEM)
    // Quem deixa o app aberto o dia todo só descobriria a versão nova na virada da hora.
    // Voltar para a aba é o momento natural de perguntar ao servidor.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checar() })
  },
})

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault()
    convite = e as Event & { prompt(): Promise<void> }
    emitir({ podeInstalar: true })
  })
  window.addEventListener('appinstalled', () => { convite = null; emitir({ podeInstalar: false }) })
}

export function usePwa() {
  const [e, setE] = useState<Estado>(estado)
  useEffect(() => { ouvintes.add(setE); setE(estado); return () => { ouvintes.delete(setE) } }, [])

  return {
    ...e,
    /** Recarrega já com o service worker novo no comando. */
    atualizar: () => { aplicarAtualizacao(true) },
    instalar: async () => {
      if (!convite) return
      await convite.prompt()
      convite = null
      emitir({ podeInstalar: false })
    },
  }
}
