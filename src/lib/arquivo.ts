/**
 * O retrato de um roteiro fechado — o "arquivo digital".
 *
 * Guarda o roteiro **como foi montado**: as paradas na ordem em que o técnico as
 * percorreria e o desfecho de cada item. É preciso guardar porque o roteiro se desfaz
 * sozinho depois de executado: a demanda reagendada muda de data e sai do dia, a
 * finalizada é arquivada, a cancelada some das telas. Olhar as demandas de hoje não
 * reconstrói o roteiro de terça.
 */
import { agrupar, chaveParada, ordenarParadas } from './format'
import type { Demanda } from './types'

/** Como cada item do roteiro terminou. */
export type Desfecho = 'CONCLUIDO' | 'REAGENDADO' | 'CANCELADO' | 'EM_ABERTO'

export interface ItemArquivado {
  om: string | null
  tipo: string
  equipamento: string | null
  patrimonio: string | null
  quantidade: number
  unidade: string | null
  desfecho: Desfecho
  /** Preenchido quando o item não foi executado e voltou ao planejamento com data nova. */
  reagendado_para?: string | null
  observacao?: string | null
  finalizado_em?: string | null
}

export interface ParadaArquivada {
  ordem: number
  cliente: string | null
  local: string | null
  itens: ItemArquivado[]
}

export interface RoteiroArquivado {
  id: string
  tecnico_id: string | null
  tecnico_nome: string
  data: string
  veiculo: string | null
  arquivado_em: string
  arquivado_por: string | null
  automatico: boolean
  paradas: ParadaArquivada[]
  total: number
  concluidos: number
  reagendados: number
  cancelados: number
}

/**
 * O desfecho é lido do estado final da demanda, não de um campo à parte.
 *
 * `data` é a data do roteiro: uma demanda reagendada continua ativa, mas em **outro**
 * dia — para este roteiro ela é REAGENDADO, não "em aberto".
 */
export function desfechoDe(d: Demanda, data: string): Desfecho {
  if (d.status === 'FINALIZADO') return 'CONCLUIDO'
  if (d.status === 'CANCELADO') return 'CANCELADO'
  if (d.data_planejada && d.data_planejada !== data) return 'REAGENDADO'
  return 'EM_ABERTO'
}

/** Monta as paradas na ordem, agrupando por cliente+local como o roteiro é percorrido. */
export function montarParadas(itens: Demanda[], data: string): ParadaArquivada[] {
  const ordenados = [...itens].sort(ordenarParadas)
  return Array.from(agrupar(ordenados, chaveParada).values()).map((its, i) => ({
    ordem: its[0].ordem_parada ? its[0].ordem_parada / 10 : i + 1,
    cliente: its[0].cliente_nome,
    local: its[0].local,
    itens: its.map(d => ({
      om: d.om,
      tipo: d.tipo,
      equipamento: d.equipamento_nome,
      patrimonio: d.patrimonio,
      quantidade: d.quantidade,
      unidade: d.unidade,
      desfecho: desfechoDe(d, data),
      reagendado_para: d.data_planejada !== data ? d.data_planejada : null,
      observacao: d.observacao,
      finalizado_em: d.finalizado_em,
    })),
  }))
}

export function contarDesfechos(paradas: ParadaArquivada[]) {
  const itens = paradas.flatMap(p => p.itens)
  return {
    total: itens.length,
    concluidos: itens.filter(i => i.desfecho === 'CONCLUIDO').length,
    reagendados: itens.filter(i => i.desfecho === 'REAGENDADO').length,
    cancelados: itens.filter(i => i.desfecho === 'CANCELADO').length,
  }
}

export const DESFECHO_LABEL: Record<Desfecho, string> = {
  CONCLUIDO: 'Concluído',
  REAGENDADO: 'Reagendado',
  CANCELADO: 'Cancelado',
  EM_ABERTO: 'Em aberto',
}

export const DESFECHO_TONE: Record<Desfecho, string> = {
  CONCLUIDO: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  REAGENDADO: 'bg-orange-50 text-orange-800 ring-orange-200',
  CANCELADO: 'bg-red-50 text-red-800 ring-red-200',
  EM_ABERTO: 'bg-slate-100 text-slate-700 ring-slate-200',
}
