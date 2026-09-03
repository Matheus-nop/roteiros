// Agrupamento técnico → data usado no planejamento, pré-roteiro, pré-carga e roteiro.
import type { Demanda, Tecnico } from '../lib/types'
import { agrupar, ordenarParadas, rotuloData } from '../lib/format'

export type GrupoData = { data: string | null; itens: Demanda[] }
export type GrupoTec = { tecnico: Tecnico | undefined; tecnicoId: string | null; datas: GrupoData[]; total: number }

export function agruparPorTecnicoEData(itens: Demanda[], tecnicos: Tecnico[]): GrupoTec[] {
  const porTec = agrupar(itens, d => d.tecnico_id ?? '__sem')
  const out: GrupoTec[] = []
  const ordemTec = [...tecnicos].sort((a, b) => a.nome.localeCompare(b.nome))
  const chaves = [...ordemTec.map(t => t.id).filter(id => porTec.has(id)), ...(porTec.has('__sem') ? ['__sem'] : [])]
  for (const k of chaves) {
    const lista = porTec.get(k)!
    const porData = agrupar(lista, d => d.data_planejada ?? '')
    const datas = Array.from(porData.entries())
      .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
      .map(([data, its]) => ({ data: data || null, itens: [...its].sort(ordenarParadas) }))
    out.push({ tecnico: k === '__sem' ? undefined : tecnicos.find(t => t.id === k), tecnicoId: k === '__sem' ? null : k, datas, total: lista.length })
  }
  return out
}

export function CabecalhoTecnico({ tecnico, total, veiculos, direita }: { tecnico?: Tecnico; total: number; veiculos?: string[]; direita?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: tecnico?.cor ?? '#94a3b8' }} />
        <span className="text-sm font-semibold text-slate-800">{tecnico?.nome ?? 'Sem técnico'}</span>
        <span className="text-xs text-slate-500">{total} item(ns)</span>
        {veiculos && veiculos.length > 1 && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">{veiculos.length} veículos no mesmo dia</span>}
        {veiculos && veiculos.length === 1 && <span className="text-xs text-slate-500">🚗 {veiculos[0]}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{direita}</div>
    </div>
  )
}

export function CabecalhoData({ data, n, direita }: { data: string | null; n: number; direita?: React.ReactNode }) {
  const atrasada = data && data < new Date().toISOString().slice(0, 10)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-4 py-1.5">
      <div className="flex items-center gap-2 text-xs">
        <span className={'font-semibold ' + (atrasada ? 'text-red-700' : !data ? 'text-slate-400' : 'text-slate-700')}>📅 {rotuloData(data)}</span>
        <span className="text-slate-400">· {n} item(ns)</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">{direita}</div>
    </div>
  )
}

export function veiculosDoGrupo(itens: Demanda[]): string[] {
  return Array.from(new Set(itens.map(d => d.veiculo).filter((v): v is string => !!v)))
}
