// Somas dos relatórios.
//
// A tela não soma nada por conta própria: tudo que ela desenha sai daqui. O motivo é
// que existe MAIS DE UMA FONTE para a mesma pergunta — a view `v_rel_demandas` quando a
// migração 0008 rodou, e as demandas em memória quando não rodou (ou no modo
// demonstração). As duas viram `LinhaFato`, e daí para frente o caminho é um só. Duas
// contagens paralelas divergiriam no primeiro ajuste.
import type { Demanda, Status, Tipo } from './types'
import { STATUS_ARQUIVADOS } from './status'

/** Uma demanda, com as dimensões do relatório já resolvidas. Espelha `v_rel_demandas`. */
export type LinhaFato = {
  id: string
  data: string | null
  /** 'YYYY-MM'. É por ela que o app recorta o período sem baixar o resto. */
  mes: string
  cliente: string | null
  equipamento: string | null
  localidade: string | null
  tipo: Tipo
  status: Status
  tecnico_id: string | null
  tecnico: string | null
  quantidade: number
  reagendamentos: number
  pendente_desde: string | null
  finalizado_em: string | null
}

/** Tipos que significam "esse equipamento deu problema", e não "esse equipamento foi entregue". */
export const TIPOS_MANUTENCAO: Tipo[] = ['MANUTENÇÃO', 'RETORNO', 'RETORNO AO CLIENTE', 'RETIRADA PARA ORÇAMENTO']

export const mesDe = (iso: string | null | undefined) => (iso ?? '').slice(0, 7)

/** Os últimos N meses, do mais antigo para o mais novo, incluindo o corrente. */
export function ultimosMeses(n: number, hoje = new Date()): string[] {
  const saida: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    saida.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return saida
}

/** Converte uma demanda em memória para o mesmo formato da view (reserva/demonstração). */
export function daDemanda(d: Demanda, nomeTecnico: (id: string | null) => string | null): LinhaFato {
  const data = d.data_planejada ?? d.data_abertura ?? null
  return {
    id: d.id,
    data,
    mes: mesDe(data),
    cliente: d.cliente_nome,
    equipamento: d.equipamento_nome,
    localidade: d.local,
    tipo: d.tipo,
    status: d.status,
    tecnico_id: d.tecnico_id,
    tecnico: nomeTecnico(d.tecnico_id),
    quantidade: d.quantidade,
    // Sem a view não há como contar reagendamento nenhum: o número de vezes está no
    // histórico, não na demanda. Uma que hoje está reagendada conta como uma — é o
    // mínimo verdadeiro, e melhor do que fingir zero.
    reagendamentos: d.status === 'REAGENDADO' || d.herdado_de_pendencia ? 1 : 0,
    pendente_desde: d.pendente_desde ?? null,
    finalizado_em: d.finalizado_em ?? null,
  }
}

export type Ranking = {
  rotulo: string
  total: number
  concluidas: number
  canceladas: number
  pendentes: number
  reagendamentos: number
  manutencoes: number
  /** Percentual de conclusão sobre o que já teve desfecho (concluída ou cancelada). */
  taxa: number | null
}

const vazio = (rotulo: string): Ranking =>
  ({ rotulo, total: 0, concluidas: 0, canceladas: 0, pendentes: 0, reagendamentos: 0, manutencoes: 0, taxa: null })

/**
 * Agrupa por uma dimensão qualquer (cliente, equipamento, técnico, localidade).
 * Linhas sem valor na dimensão ficam de fora — "(sem cliente)" no topo de um ranking
 * não é informação, é ruído.
 */
export function agrupar(linhas: LinhaFato[], chave: (l: LinhaFato) => string | null): Ranking[] {
  const mapa = new Map<string, Ranking>()
  for (const l of linhas) {
    const k = (chave(l) ?? '').trim()
    if (!k) continue
    const r = mapa.get(k) ?? vazio(k)
    r.total++
    if (l.status === 'FINALIZADO') r.concluidas++
    if (l.status === 'CANCELADO') r.canceladas++
    if (l.status === 'PENDENTE' || l.status === 'REAGENDADO') r.pendentes++
    r.reagendamentos += l.reagendamentos
    if (TIPOS_MANUTENCAO.includes(l.tipo)) r.manutencoes++
    mapa.set(k, r)
  }
  for (const r of mapa.values()) {
    const comDesfecho = r.concluidas + r.canceladas
    r.taxa = comDesfecho ? r.concluidas / comDesfecho : null
  }
  return Array.from(mapa.values())
}

/** Ordena por um campo e corta no topo. `Infinity` traz tudo. */
export function topo(rs: Ranking[], por: keyof Ranking, quantos = 10): Ranking[] {
  return [...rs]
    .filter(r => Number(r[por] ?? 0) > 0)
    .sort((a, b) => Number(b[por] ?? 0) - Number(a[por] ?? 0) || b.total - a.total || a.rotulo.localeCompare(b.rotulo))
    .slice(0, quantos)
}

export type Resumo = {
  total: number
  concluidas: number
  canceladas: number
  emAberto: number
  reagendamentos: number
  taxa: number | null
}

export function resumir(linhas: LinhaFato[]): Resumo {
  const concluidas = linhas.filter(l => l.status === 'FINALIZADO').length
  const canceladas = linhas.filter(l => l.status === 'CANCELADO').length
  return {
    total: linhas.length,
    concluidas,
    canceladas,
    emAberto: linhas.filter(l => !STATUS_ARQUIVADOS.includes(l.status)).length,
    reagendamentos: linhas.reduce((s, l) => s + l.reagendamentos, 0),
    taxa: concluidas + canceladas ? concluidas / (concluidas + canceladas) : null,
  }
}

/** Série mensal para o gráfico: o que entrou e o que foi concluído em cada mês. */
export function porMes(linhas: LinhaFato[], meses: string[]) {
  return meses.map(mes => {
    const doMes = linhas.filter(l => l.mes === mes)
    return {
      mes,
      total: doMes.length,
      concluidas: doMes.filter(l => l.status === 'FINALIZADO').length,
    }
  })
}
