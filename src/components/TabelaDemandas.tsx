// Tabela reutilizável de demandas. Seleção e ações sempre por uuid.
import type { ReactNode } from 'react'
import { useData } from '../hooks/useData'
import type { Demanda } from '../lib/types'
import { codigo, fmtData, fmtPatrimonio } from '../lib/format'
import { BadgeStatus, BadgeTipo, Badge, Checkbox, cx } from './ui'

export type Coluna = 'sel' | 'numero' | 'ordem' | 'om' | 'cliente' | 'tipo' | 'equipamento' | 'patrimonio' | 'tecnico' | 'veiculo' | 'data' | 'abertura' | 'status' | 'separacao' | 'obs' | 'acoes' | 'reagendada'

export function TabelaDemandas({ itens, colunas, selecionados, onSelecionar, acoes, vazio, prefixo = 'EXP', onClickLinha }: {
  itens: Demanda[]
  colunas: Coluna[]
  selecionados?: Set<string>
  onSelecionar?(ids: Set<string>): void
  acoes?(d: Demanda): ReactNode
  vazio?: ReactNode
  prefixo?: 'EXP' | 'ROT'
  onClickLinha?(d: Demanda): void
}) {
  const { tecnicoPorId } = useData()
  const todos = selecionados && itens.length > 0 && itens.every(i => selecionados.has(i.id))
  const toggleTodos = () => {
    if (!onSelecionar || !selecionados) return
    const s = new Set(selecionados)
    if (todos) itens.forEach(i => s.delete(i.id)); else itens.forEach(i => s.add(i.id))
    onSelecionar(s)
  }
  const toggle = (id: string) => {
    if (!onSelecionar || !selecionados) return
    const s = new Set(selecionados)
    if (s.has(id)) s.delete(id); else s.add(id)
    onSelecionar(s)
  }

  const th: Record<Coluna, string> = {
    sel: '', numero: 'Cód.', ordem: '#', om: 'OM / OS', cliente: 'Cliente · Local', tipo: 'Tipo', equipamento: 'Equipamento',
    patrimonio: 'Pat. / Qtd', tecnico: 'Técnico', veiculo: 'Veículo', data: 'Data plan.', abertura: 'Abertura', status: 'Status',
    separacao: 'Separação', obs: 'Obs.', acoes: '', reagendada: 'Reagendada',
  }

  return (
    <div className="overflow-x-auto rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
      <table className="tabela w-full min-w-[900px]">
        <thead>
          <tr>
            {colunas.map(c => (
              <th key={c} className={cx(c === 'sel' && 'w-8', c === 'acoes' && 'text-right')}>
                {c === 'sel' ? <Checkbox checked={!!todos} onChange={toggleTodos} /> : th[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {itens.length === 0 && <tr><td colSpan={colunas.length} className="py-10 text-center text-sm text-slate-500">{vazio ?? 'Nenhuma demanda.'}</td></tr>}
          {itens.map(d => {
            const t = tecnicoPorId(d.tecnico_id)
            return (
              <tr key={d.id} className={cx(selecionados?.has(d.id) && 'selecionada', onClickLinha && 'cursor-pointer')} onClick={onClickLinha ? () => onClickLinha(d) : undefined}>
                {colunas.map(c => {
                  switch (c) {
                    case 'sel': return <td key={c} onClick={e => e.stopPropagation()}><Checkbox checked={!!selecionados?.has(d.id)} onChange={() => toggle(d.id)} /></td>
                    case 'numero': return <td key={c} className="font-mono text-xs text-slate-500">{codigo(prefixo, d.numero)}</td>
                    case 'ordem': return <td key={c} className="font-semibold tabular-nums text-slate-700">{d.ordem_parada ? d.ordem_parada / 10 : '—'}</td>
                    case 'om': return <td key={c}><span className="om font-medium text-slate-900">{d.om ?? '—'}</span></td>
                    case 'cliente': return <td key={c}><div className="font-medium text-slate-800">{d.cliente_nome ?? '—'}</div><div className="text-xs text-slate-500">{d.local ?? '—'}</div></td>
                    case 'tipo': return <td key={c}><BadgeTipo tipo={d.tipo} /></td>
                    case 'equipamento': return <td key={c} className="max-w-[260px]"><div className="truncate" title={d.equipamento_nome ?? ''}>{d.equipamento_nome ?? '—'}</div>{d.herdado_de_pendencia && <span className="text-[10px] font-medium text-orange-700">↩ reagendada</span>}</td>
                    case 'patrimonio': return <td key={c} className={cx('whitespace-nowrap', d.patrimonio ? 'font-mono font-medium' : 'text-slate-600')}>{fmtPatrimonio(d)}</td>
                    case 'tecnico': return <td key={c}>{t ? <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: t.cor ?? '#94a3b8' }} />{t.nome}</span> : <span className="text-slate-400">—</span>}</td>
                    case 'veiculo': return <td key={c} className="text-xs text-slate-600">{d.veiculo ?? <span className="text-slate-400">—</span>}</td>
                    case 'data': return <td key={c} className="whitespace-nowrap tabular-nums">{fmtData(d.data_planejada)}</td>
                    case 'reagendada': return <td key={c} className="whitespace-nowrap tabular-nums">{fmtData(d.data_reagendada)}</td>
                    case 'abertura': return <td key={c} className="whitespace-nowrap tabular-nums text-slate-500">{fmtData(d.data_abertura)}</td>
                    case 'status': return <td key={c}><BadgeStatus status={d.status} /></td>
                    case 'separacao': return <td key={c}>{d.status_separacao === 'SEPARADO' ? <Badge tone="bg-emerald-50 text-emerald-800 ring-emerald-200">✓ {d.separado_por ?? 'Separado'}</Badge> : <Badge>Não separado</Badge>}</td>
                    case 'obs': return <td key={c} className="max-w-[200px] truncate text-xs text-slate-500" title={d.observacao ?? ''}>{d.observacao ?? ''}</td>
                    case 'acoes': return <td key={c} className="w-px whitespace-nowrap text-right" onClick={e => e.stopPropagation()}><div className="flex justify-end gap-1">{acoes?.(d)}</div></td>
                  }
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function BarraSelecao({ n, onLimpar, children }: { n: number; onLimpar(): void; children: ReactNode }) {
  if (!n) return null
  return (
    <div className="sticky bottom-3 z-20 mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">
      <span className="font-medium">{n} selecionada(s)</span>
      <button onClick={onLimpar} className="text-xs text-slate-300 underline">limpar</button>
      <div className="ml-auto flex flex-wrap gap-2">{children}</div>
    </div>
  )
}
