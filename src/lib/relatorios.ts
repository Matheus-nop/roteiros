// Somas dos relatórios.
//
// A tela não soma nada por conta própria: tudo que ela desenha sai daqui. O motivo é
// que existe MAIS DE UMA FONTE para a mesma pergunta — a view `v_rel_demandas` quando a
// migração 0008 rodou, e as demandas em memória quando não rodou (ou no modo
// demonstração). As duas viram `LinhaFato`, e daí para frente o caminho é um só. Duas
// contagens paralelas divergiriam no primeiro ajuste.
import type { Conferencia, Demanda, Status, Tipo } from './types'
import { STATUS_ARQUIVADOS, STATUS_EM_ROTA, separaNaExpedicao } from './status'

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
  /** A segunda vista sobre a carga (0019/0020). */
  conferencia: Conferencia
  conferido_por: string | null
  /** Quem SEPAROU. É por ele que a divergência é ranqueada — não por quem conferiu. */
  separado_por: string | null
  divergencia: string | null
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
    conferencia: d.conferencia,
    conferido_por: d.conferido_por,
    separado_por: d.separado_por,
    divergencia: d.divergencia,
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


// ─────────────────────────────────────────────────────────────────────
// Conferência da carga (0019/0020)
// ─────────────────────────────────────────────────────────────────────
//
// DUAS ARMADILHAS, E COMO ESTE CÓDIGO DESVIA DELAS
//
// 1. Divergência zero não quer dizer carga certa — quer dizer que ninguém
//    conferiu. Por isso a ADESÃO vem antes de qualquer ranking, e o
//    denominador dela é o que dava para conferir, não o que foi conferido.
//
// 2. Contagem crua pune quem separa mais. Quem separou duzentos itens e errou
//    quatro está melhor que quem separou vinte e errou três. Por isso cada
//    linha do ranking carrega o próprio denominador e a taxa.

/**
 * Onde a conferência já era possível.
 *
 * A lista tem que ser a MESMA que a tela de conferência usa (`STATUS_EM_ROTA`,
 * mais os desfechos), senão o item conferido de verdade não apareceria no
 * relatório — e ninguém consegue explicar por que o número da tela não bate
 * com o número do gestor. Foi assim na primeira versão disto: a tela contava a
 * partir de ROTEIRIZADO e o relatório a partir de AGUARDANDO_SAIDA.
 *
 * O preço é o item roteirizado de hoje, que ainda não saiu e entra no
 * denominador como "sem conferência". Num recorte de meses isso é ruído; a
 * alternativa — dois critérios diferentes para a mesma palavra — não é.
 */
const JA_DAVA_PARA_CONFERIR: Status[] = [
  ...STATUS_EM_ROTA,
  'FINALIZADO', 'PENDENTE', 'REAGENDADO',
]

export const conferivel = (l: LinhaFato) =>
  separaNaExpedicao(l.tipo) && JA_DAVA_PARA_CONFERIR.includes(l.status)

export type LinhaConferencia = {
  rotulo: string
  /** Itens dele que dava para conferir — o denominador. */
  base: number
  divergencias: number
  /** divergencias / base. Null quando não há base: 0 de 0 não é 0%, é nada. */
  taxa: number | null
}

export type ResumoConferencia = {
  /** Itens que passaram pelo caminhão no período. */
  base: number
  conferidos: number
  divergentes: number
  /** conferidos / base. É o número que diz se o resto do relatório vale algo. */
  adesao: number | null
  /** Por quem SEPAROU: onde o erro nasceu. */
  porExpedidor: LinhaConferencia[]
  /** Por quem CARREGOU: quem está conferindo de fato, e quem não está. Forma
   *  própria de propósito — aqui a fração é ADESÃO, não taxa de erro, e um
   *  campo `taxa` servindo às duas coisas acabaria com o rótulo trocado. */
  porTecnico: { rotulo: string; base: number; conferidos: number; adesao: number | null }[]
  /** O que mais acontece. */
  porMotivo: { rotulo: string; total: number }[]
}

function ranquear(
  linhas: LinhaFato[],
  chave: (l: LinhaFato) => string | null,
): LinhaConferencia[] {
  const mapa = new Map<string, LinhaConferencia>()
  for (const l of linhas) {
    const k = (chave(l) ?? '').trim()
    // Linha sem nome não vira "(sem expedidor)" no topo do ranking: isso não é
    // informação, é ruído — a mesma regra do `agrupar`.
    if (!k) continue
    const r = mapa.get(k) ?? { rotulo: k, base: 0, divergencias: 0, taxa: null }
    r.base++
    if (l.conferencia === 'DIVERGENTE') r.divergencias++
    mapa.set(k, r)
  }
  for (const r of mapa.values()) r.taxa = r.base ? r.divergencias / r.base : null
  return Array.from(mapa.values())
}

export function conferenciaDaCarga(linhas: LinhaFato[]): ResumoConferencia {
  const base = linhas.filter(conferivel)
  const conferidos = base.filter(l => l.conferencia !== 'NAO_CONFERIDO')
  const divergentes = base.filter(l => l.conferencia === 'DIVERGENTE')

  const motivos = new Map<string, number>()
  for (const l of divergentes) {
    const m = (l.divergencia ?? '').trim()
    if (m) motivos.set(m, (motivos.get(m) ?? 0) + 1)
  }

  return {
    base: base.length,
    conferidos: conferidos.length,
    divergentes: divergentes.length,
    adesao: base.length ? conferidos.length / base.length : null,
    // Ordenados pela TAXA, não pela contagem — ver a armadilha 2 acima. O
    // desempate é pela base, para que quem separa mais suba antes num empate.
    porExpedidor: ranquear(base, l => l.separado_por)
      .filter(r => r.divergencias > 0)
      .sort((a, b) => (b.taxa ?? 0) - (a.taxa ?? 0) || b.base - a.base)
      .slice(0, 10),
    // Aqui a ordem é a INVERSA da de cima: o topo é quem MENOS confere, porque
    // é quem precisa de conversa. Técnico que não confere transforma a carga
    // dele num ponto cego — e o relatório inteiro num otimismo.
    porTecnico: ranquear(base, l => l.tecnico).map(r => {
      const conferidos = base.filter(
        l => (l.tecnico ?? '').trim() === r.rotulo && l.conferencia !== 'NAO_CONFERIDO').length
      return { rotulo: r.rotulo, base: r.base, conferidos, adesao: r.base ? conferidos / r.base : null }
    }).sort((a, b) => (a.adesao ?? 1) - (b.adesao ?? 1) || b.base - a.base),
    porMotivo: Array.from(motivos, ([rotulo, total]) => ({ rotulo, total }))
      .sort((a, b) => b.total - a.total || a.rotulo.localeCompare(b.rotulo)),
  }
}
