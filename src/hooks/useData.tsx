// Fonte única de dados do app: carrega as tabelas e mantém em memória via Realtime.
// Todas as telas leem daqui — mudou o status, some de uma tela e aparece em outra.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { db } from '../lib'
import { criarAcoes, type Acoes } from '../lib/actions'
import type { Cliente, Demanda, Equipamento, Expedidor, Fechamento, Participante, Perfil, Presenca, Tecnico, Treinamento, Veiculo } from '../lib/types'
import type { EventoTabela } from '../lib/db'
import { STATUS_ARQUIVADOS } from '../lib/status'

interface DataCtx {
  demandas: Demanda[]          // ativas (não arquivadas)
  tecnicos: Tecnico[]
  veiculos: Veiculo[]
  clientes: Cliente[]
  equipamentos: Equipamento[]
  expedidores: Expedidor[]
  fechamentos: Fechamento[]
  treinamentos: Treinamento[]
  participantes: Participante[]
  presencas: Presenca[]
  carregando: boolean
  erro: string | null
  /** Erro só da agenda de treinamentos — normalmente "relation does not exist",
   *  quando a migração 0016 ainda não foi aplicada. A tela de Treinamentos explica
   *  o que fazer; o resto do app não pode cair por causa disso. */
  erroTreinamentos: string | null
  conectado: boolean
  ultimaAtualizacao: Date | null
  recarregar(): Promise<void>
  acoes: Acoes
  tecnicoPorId(id: string | null | undefined): Tecnico | undefined
  /** Nome de quem operou (lançou, alterou). Cai no e-mail e, em último caso, em '—'. */
  nomeDoUsuario(id: string | null | undefined): string
}

const Ctx = createContext<DataCtx | null>(null)

/**
 * A RECARGA É PISO, NÃO PLANO B.
 *
 * Antes, a recarga periódica só ligava quando o app tinha CERTEZA de que o
 * realtime havia caído (`if (realtime !== false) return`). E é justamente a
 * queda silenciosa que não avisa: o computador hiberna, o wi-fi oscila, o proxy
 * da empresa mata uma conexão parada. O canal continua dizendo "assinado",
 * evento nenhum chega, e aquela aba fica na foto de ontem por tempo
 * indeterminado — foi o que aconteceu com a demanda cancelada que seguia
 * aparecendo no computador do PCM.
 *
 * Agora o realtime é o caminho RÁPIDO e a batida é permanente, por baixo.
 */
const BATIDA_NORMAL = 90_000
/** Realtime declaradamente fora: bate mais rápido, que é o que já se fazia. */
const BATIDA_SEM_REALTIME = 30_000
/** Piso entre duas idas da MESMA tabela ao banco. Destravar a tela dispara
 *  `visibilitychange`, `focus` e às vezes `online` em sequência — sem piso,
 *  seriam três consultas por tabela de uma vez. */
const PISO_ENTRE_IDAS = 10_000
/** Depois disto sem dado novo nenhum, o indicador para de dizer que está bem. */
const FRESCOR = BATIDA_NORMAL * 3

/**
 * @param vigiada  tabela que muda o dia inteiro e por isso ganha a batida
 *   periódica. Cadastro (técnicos, clientes, equipamentos) fica de fora: ele
 *   quase não muda, e onze tabelas batendo juntas seria consulta à toa.
 *   Todas, vigiadas ou não, recarregam quando a aba volta ao foco.
 */
function useTabelaRealtime<T extends { id: string }>(tabela: string, filtro?: Parameters<typeof db.select>[1], aceitar?: (t: T) => boolean, vigiada = false) {
  const [linhas, setLinhas] = useState<T[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [realtime, setRealtime] = useState<boolean | null>(null)   // null = ainda conectando
  const aceitarRef = useRef(aceitar)
  aceitarRef.current = aceitar
  const ultimaIda = useRef(0)

  /** @param forcar `false` respeita o piso — é o que os despertadores usam. */
  const recarregar = useCallback(async (forcar = true) => {
    if (!forcar && Date.now() - ultimaIda.current < PISO_ENTRE_IDAS) return
    // Marcado ANTES da consulta: dois despertadores no mesmo segundo não viram
    // duas idas ao banco.
    ultimaIda.current = Date.now()
    try {
      const rows = await db.select<T>(tabela, filtro)
      setLinhas(rows)
      setErro(null)
      setTick(t => t + 1)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabela])

  useEffect(() => {
    recarregar()
    const off = db.subscribe<T>(tabela, (e: EventoTabela<T>) => {
      setLinhas(prev => {
        if (e.tipo === 'DELETE') return prev.filter(r => r.id !== e.antigo?.id)
        const novo = e.novo
        if (!novo) return prev
        const ok = aceitarRef.current ? aceitarRef.current(novo) : true
        const i = prev.findIndex(r => r.id === novo.id)
        if (!ok) return i >= 0 ? prev.filter(r => r.id !== novo.id) : prev
        if (i >= 0) { const cp = [...prev]; cp[i] = novo; return cp }
        return [...prev, novo]
      })
      setTick(t => t + 1)
    }, ok => setRealtime(ok))
    return off
  }, [tabela, recarregar])

  // A batida. Ela não espera mais o app perceber que caiu — ver o comentário
  // de BATIDA_NORMAL. Quando o realtime está declaradamente fora, bate rápido.
  useEffect(() => {
    if (!vigiada) return
    const ms = realtime === false ? BATIDA_SEM_REALTIME : BATIDA_NORMAL
    const id = setInterval(() => { recarregar() }, ms)
    return () => clearInterval(id)
  }, [vigiada, realtime, recarregar])

  // Os despertadores. Destravar o computador de manhã tem que trazer o dia de
  // hoje — o app já ouvia `visibilitychange`, mas só para checar se havia saído
  // versão nova dele mesmo, nunca para buscar dado.
  useEffect(() => {
    const acordar = () => { if (!document.hidden) void recarregar(false) }
    document.addEventListener('visibilitychange', acordar)
    window.addEventListener('focus', acordar)
    window.addEventListener('online', acordar)
    return () => {
      document.removeEventListener('visibilitychange', acordar)
      window.removeEventListener('focus', acordar)
      window.removeEventListener('online', acordar)
    }
  }, [recarregar])

  return { linhas, carregando, erro, recarregar, tick, realtime }
}

export function DataProvider({ children }: { children: ReactNode }) {
  // As duas que mudam o dia inteiro, e cuja defasagem manda gente para a rua:
  // a demanda cancelada que continua no roteiro, o fechamento que já saiu.
  const demandas = useTabelaRealtime<Demanda>('demandas', { notIn: { status: STATUS_ARQUIVADOS }, order: [{ col: 'created_at' }] }, d => !STATUS_ARQUIVADOS.includes(d.status), true)
  const tecnicos = useTabelaRealtime<Tecnico>('tecnicos', { order: [{ col: 'nome' }] })
  const veiculos = useTabelaRealtime<Veiculo>('veiculos', { order: [{ col: 'nome' }] })
  const clientes = useTabelaRealtime<Cliente>('clientes', { order: [{ col: 'nome' }] })
  const equipamentos = useTabelaRealtime<Equipamento>('equipamentos', { order: [{ col: 'nome' }] })
  const expedidores = useTabelaRealtime<Expedidor>('expedidores', { order: [{ col: 'nome' }] })
  const fechamentos = useTabelaRealtime<Fechamento>('fechamentos', { order: [{ col: 'fechado_em', asc: false }], limit: 200 }, undefined, true)
  // Tabela de dez linhas: carregar inteira sai mais barato que consultar por autor.
  const perfis = useTabelaRealtime<Perfil>('perfis', { order: [{ col: 'nome' }] })

  // Treinamentos: seis por mês, não seis por dia. Carregar tudo custa menos que
  // recortar por data — e é o que faz o calendário andar de mês sem ir ao banco.
  const treinamentos = useTabelaRealtime<Treinamento>('treinamentos', { order: [{ col: 'data' }, { col: 'hora_inicio' }] })
  const participantes = useTabelaRealtime<Participante>('participantes', { order: [{ col: 'nome' }] })
  const presencas = useTabelaRealtime<Presenca>('presencas', { order: [{ col: 'created_at' }] })

  const [ultima, setUltima] = useState<Date | null>(null)
  const tickTotal = demandas.tick + tecnicos.tick + fechamentos.tick
  useEffect(() => { if (tickTotal > 0) setUltima(new Date()) }, [tickTotal])

  // Um relógio só para o indicador. Sem ele, "isto aqui está velho" só
  // apareceria quando alguma outra coisa fizesse a tela redesenhar — e é
  // exatamente quando nada acontece que a pessoa precisa ser avisada.
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const acoes = useMemo(() => criarAcoes(db), [])
  const tecMap = useMemo(() => new Map(tecnicos.linhas.map(t => [t.id, t])), [tecnicos.linhas])
  const perfilMap = useMemo(() => new Map(perfis.linhas.map(p => [p.id, p])), [perfis.linhas])

  const value: DataCtx = {
    demandas: demandas.linhas,
    tecnicos: [...tecnicos.linhas].sort((a, b) => a.nome.localeCompare(b.nome)),
    veiculos: [...veiculos.linhas].sort((a, b) => a.nome.localeCompare(b.nome)),
    clientes: [...clientes.linhas].sort((a, b) => a.nome.localeCompare(b.nome)),
    equipamentos: [...equipamentos.linhas].sort((a, b) => a.nome.localeCompare(b.nome) || (a.patrimonio ?? '').localeCompare(b.patrimonio ?? '')),
    expedidores: expedidores.linhas,
    fechamentos: fechamentos.linhas,
    treinamentos: treinamentos.linhas,
    participantes: participantes.linhas,
    presencas: presencas.linhas,
    carregando: demandas.carregando || tecnicos.carregando,
    erro: demandas.erro ?? tecnicos.erro ?? null,
    erroTreinamentos: treinamentos.erro,
    // Conectado passou a significar "estou vendo dado de agora", e não "o canal
    // disse que assinou". Websocket morto continua dizendo que assinou: era esse
    // indicador verde mentindo enquanto a tela mostrava a véspera.
    conectado: !demandas.erro && ultima !== null && agora - ultima.getTime() < FRESCOR,
    ultimaAtualizacao: ultima,
    recarregar: async () => {
      await Promise.all([demandas.recarregar(), tecnicos.recarregar(), veiculos.recarregar(), clientes.recarregar(), equipamentos.recarregar(), expedidores.recarregar(), fechamentos.recarregar(), treinamentos.recarregar(), participantes.recarregar(), presencas.recarregar()])
    },
    acoes,
    tecnicoPorId: (id) => (id ? tecMap.get(id) : undefined),
    nomeDoUsuario: (id) => {
      if (!id) return '—'
      const p = perfilMap.get(id)
      return p?.nome || p?.email?.split('@')[0] || '—'
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useData(): DataCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useData fora do DataProvider')
  return c
}
