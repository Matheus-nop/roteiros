import { Search } from 'lucide-react'
import { Input, Select } from './ui'
import { useData } from '../hooks/useData'
import { agrupar } from '../lib/format'
import type { Demanda } from '../lib/types'
import type { ReactNode } from 'react'

/**
 * Filtro por técnico. Recebendo `itens`, lista só quem tem demanda no recorte atual e mostra
 * a contagem — um seletor com dez nomes, nove deles zerados, faz procurar o que não existe.
 * O técnico escolhido nunca some da lista, mesmo zerado: senão o campo ficaria em branco com
 * o filtro ligado e a tela vazia sem explicação.
 */
export function SeletorTecnico({ valor, onChange, itens, comSemTecnico, className }: {
  valor: string; onChange(v: string): void
  itens?: Demanda[]
  comSemTecnico?: boolean
  className?: string
}) {
  const { tecnicos } = useData()
  const contagem = itens && agrupar(itens.filter(d => d.tecnico_id), d => d.tecnico_id!)
  const lista = tecnicos.filter(t => (contagem ? contagem.has(t.id) : t.ativo) || t.id === valor)
  return (
    <Select value={valor} onChange={e => onChange(e.target.value)} className={className ?? 'w-48'} title="Filtrar por técnico">
      <option value="">Todos os técnicos</option>
      {comSemTecnico && <option value="__sem">Sem técnico</option>}
      {lista.map(t => <option key={t.id} value={t.id}>{t.nome}{contagem ? ` (${contagem.get(t.id)?.length ?? 0})` : ''}</option>)}
    </Select>
  )
}

export function BarraFiltros({ busca, setBusca, tecnico, setTecnico, children }: {
  busca: string; setBusca(v: string): void
  tecnico?: string; setTecnico?(v: string): void
  children?: ReactNode
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar OM, cliente, local, equipamento…" className="w-72 pl-8" />
      </div>
      {setTecnico && <SeletorTecnico valor={tecnico ?? ''} onChange={setTecnico} comSemTecnico className="w-44" />}
      {children}
    </div>
  )
}

export function SeletorData({ valor, onChange, className }: { valor: string; onChange(v: string): void; className?: string }) {
  return <Input type="date" value={valor} onChange={e => onChange(e.target.value)} className={className ?? 'w-40'} />
}
