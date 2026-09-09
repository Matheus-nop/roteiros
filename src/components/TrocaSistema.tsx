import { Boxes, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/**
 * Passar de um sistema do grupo para o outro sem procurar o endereço.
 *
 * A mesma caixinha existe nos três apps, com a mesma lista e na mesma ordem —
 * quem alterna o dia inteiro não pode ter que procurar em lugar diferente em
 * cada um.
 *
 * O endereço de cada sistema vem de variável (`VITE_URL_ESTOQUE`,
 * `VITE_URL_FROTA`). Sem a variável o item some, em vez de levar alguém para um
 * endereço que não abre. Sem nenhum destino, a caixinha inteira some.
 *
 * Sobre a sessão, para não prometer o que não existe: o login é o mesmo nos
 * três (o `auth.users` do roteiros e do estoque é um só), mas a sessão não.
 * Este app guarda em localStorage, que é por origem; o estoque guarda em cookie
 * no domínio pai; e a frota mora num projeto Supabase próprio. Hoje se entra
 * uma vez de cada lado. Unificar são dois trabalhos separados — passar este app
 * para cookie e mover a frota para o projeto compartilhado.
 */

const AQUI = 'roteiros'

const SISTEMAS = [
  { id: 'roteiros', nome: 'Roteiros', descricao: 'Planejamento e rota dos técnicos', url: undefined as string | undefined },
  { id: 'estoque', nome: 'Estoque', descricao: 'Equipamentos, expedição e galpões', url: import.meta.env.VITE_URL_ESTOQUE },
  { id: 'frota', nome: 'Frota', descricao: 'Veículos, checklist e manutenção', url: import.meta.env.VITE_URL_FROTA },
]

export function TrocaSistema() {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const sistemas = SISTEMAS.filter(s => s.id === AQUI || s.url)

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    window.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); window.removeEventListener('keydown', esc) }
  }, [aberto])

  // Só o roteiros na lista é uma caixinha que não leva a lugar nenhum.
  if (sistemas.length < 2) return null

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setAberto(v => !v)}
        aria-expanded={aberto}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-white/20"
      >
        <span className="hidden sm:inline">Sistemas</span>
        <Boxes size={15} className="sm:hidden" />
        <ChevronDown size={13} className="opacity-70" />
      </button>

      {aberto && (
        <div role="menu" className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl bg-white text-slate-800 shadow-xl ring-1 ring-slate-200">
          {sistemas.map(s => {
            const aqui = s.id === AQUI
            const conteudo = (
              <>
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {s.nome}
                  {aqui && <span className="text-[10px] font-medium text-slate-400">você está aqui</span>}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">{s.descricao}</span>
              </>
            )
            return aqui ? (
              <div key={s.id} className="border-b border-slate-100 bg-slate-50 px-4 py-3 last:border-b-0">{conteudo}</div>
            ) : (
              <a key={s.id} href={s.url} role="menuitem" className="block border-b border-slate-100 px-4 py-3 transition-colors last:border-b-0 hover:bg-slate-50">
                {conteudo}
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
