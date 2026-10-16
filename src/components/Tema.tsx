import { Monitor, Moon, Sun } from 'lucide-react'
import { useEffect, useSyncExternalStore } from 'react'

/**
 * Modo dia e modo noite — o mesmo botão do Gestão de Estoque e da Frota.
 *
 * Três posições, nesta ordem: **sistema** (segue o aparelho), **escuro** e
 * **claro**. A escolha fica no aparelho (`localStorage.tema`, a mesma chave dos
 * outros apps) e o tema mora no `<html>`, como `data-tema="claro|escuro"`:
 *
 * - o script do `index.html` aplica antes da primeira pintura, para a tela não
 *   piscar branca no escuro;
 * - em "sistema", o `data-tema` é o que o aparelho diz NAQUELA hora, e muda
 *   sozinho quando o aparelho troca (o celular que escurece às 18h);
 * - as cores do escuro estão em `src/tema-escuro.css`, gerado por
 *   `scripts/gerar-tema-escuro.mjs`. Só valem na tela: o papel sai claro.
 */

type Escolha = 'sistema' | 'escuro' | 'claro'
const EVENTO = 'tema:mudou'
const ESCURO_DO_APARELHO = '(prefers-color-scheme: dark)'

function lerEscolha(): Escolha {
  try {
    const t = localStorage.getItem('tema')
    return t === 'claro' || t === 'escuro' ? t : 'sistema'
  } catch {
    return 'sistema'
  }
}

/** Põe no `<html>` o tema que vale agora, resolvendo "sistema" pelo aparelho. */
export function aplicarTema(escolha: Escolha = lerEscolha()) {
  const escuro = escolha === 'escuro' || (escolha === 'sistema' && window.matchMedia(ESCURO_DO_APARELHO).matches)
  document.documentElement.dataset.tema = escuro ? 'escuro' : 'claro'
}

function assinar(aoMudar: () => void) {
  window.addEventListener(EVENTO, aoMudar)
  window.addEventListener('storage', aoMudar)
  return () => {
    window.removeEventListener(EVENTO, aoMudar)
    window.removeEventListener('storage', aoMudar)
  }
}

export function BotaoTema() {
  const escolha = useSyncExternalStore(assinar, lerEscolha, () => 'sistema' as Escolha)

  // Em "sistema", acompanha o aparelho enquanto a tela está aberta. Outra aba
  // que mudou a escolha também chega aqui, pelo evento `storage`.
  useEffect(() => {
    aplicarTema(escolha)
    if (escolha !== 'sistema') return
    const mq = window.matchMedia(ESCURO_DO_APARELHO)
    const seguir = () => aplicarTema('sistema')
    mq.addEventListener('change', seguir)
    return () => mq.removeEventListener('change', seguir)
  }, [escolha])

  function trocar() {
    const proxima: Escolha = escolha === 'sistema' ? 'escuro' : escolha === 'escuro' ? 'claro' : 'sistema'
    try {
      if (proxima === 'sistema') localStorage.removeItem('tema')
      else localStorage.setItem('tema', proxima)
    } catch {
      // Sem poder guardar, o tema ainda vale enquanto a tela estiver aberta.
    }
    aplicarTema(proxima)
    window.dispatchEvent(new Event(EVENTO))
  }

  const rotulo = escolha === 'sistema' ? 'Tema do aparelho' : escolha === 'escuro' ? 'Modo noite' : 'Modo dia'
  const Icone = escolha === 'sistema' ? Monitor : escolha === 'escuro' ? Moon : Sun

  return (
    <button
      type="button"
      onClick={trocar}
      title={`${rotulo} — clique para alternar`}
      aria-label={`${rotulo}. Clique para alternar.`}
      className="flex shrink-0 items-center justify-center rounded-lg bg-white/10 p-2 text-white ring-1 ring-white/15 transition hover:bg-white/20"
    >
      <Icone size={14} />
    </button>
  )
}
