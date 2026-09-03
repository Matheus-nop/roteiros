import { Search } from 'lucide-react'
import { Input, Select } from './ui'
import { useData } from '../hooks/useData'
import type { ReactNode } from 'react'

export function BarraFiltros({ busca, setBusca, tecnico, setTecnico, children }: {
  busca: string; setBusca(v: string): void
  tecnico?: string; setTecnico?(v: string): void
  children?: ReactNode
}) {
  const { tecnicos } = useData()
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar OM, cliente, local, equipamento…" className="w-72 pl-8" />
      </div>
      {setTecnico && (
        <Select value={tecnico} onChange={e => setTecnico(e.target.value)} className="w-44">
          <option value="">Todos os técnicos</option>
          <option value="__sem">Sem técnico</option>
          {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </Select>
      )}
      {children}
    </div>
  )
}

export function SeletorData({ valor, onChange, className }: { valor: string; onChange(v: string): void; className?: string }) {
  return <Input type="date" value={valor} onChange={e => onChange(e.target.value)} className={className ?? 'w-40'} />
}
