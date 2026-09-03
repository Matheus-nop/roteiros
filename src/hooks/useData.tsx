// Fonte única de dados do app: carrega as tabelas e mantém em memória via Realtime.
// Todas as telas leem daqui — mudou o status, some de uma tela e aparece em outra.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { db } from '../lib'
import { criarAcoes, type Acoes } from '../lib/actions'
import type { Cliente, Demanda, Equipamento, Expedidor, Fechamento, Tecnico, Veiculo } from '../lib/types'
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
  carregando: boolean
  erro: string | null
  conectado: boolean
  ultimaAtualizacao: Date | null
  recarregar(): Promise<void>
  acoes: Acoes
  tecnicoPorId(id: string | null | undefined): Tecnico | undefined
}

const Ctx = createContext<DataCtx | null>(null)

function useTabelaRealtime<T extends { id: string }>(tabela: string, filtro?: Parameters<typeof db.select>[1], aceitar?: (t: T) => boolean) {
  const [linhas, setLinhas] = useState<T[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [realtime, setRealtime] = useState<boolean | null>(null)   // null = ainda conectando
  const aceitarRef = useRef(aceitar)
  aceitarRef.current = aceitar

  const recarregar = useCallback(async () => {
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

  // Sem realtime, recarrega periodicamente para não ficar com dados velhos.
  useEffect(() => {
    if (realtime !== false) return
    const id = setInterval(recarregar, 30000)
    return () => clearInterval(id)
  }, [realtime, recarregar])

  return { linhas, carregando, erro, recarregar, tick, realtime }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const demandas = useTabelaRealtime<Demanda>('demandas', { notIn: { status: STATUS_ARQUIVADOS }, order: [{ col: 'created_at' }] }, d => !STATUS_ARQUIVADOS.includes(d.status))
  const tecnicos = useTabelaRealtime<Tecnico>('tecnicos', { order: [{ col: 'nome' }] })
  const veiculos = useTabelaRealtime<Veiculo>('veiculos', { order: [{ col: 'nome' }] })
  const clientes = useTabelaRealtime<Cliente>('clientes', { order: [{ col: 'nome' }] })
  const equipamentos = useTabelaRealtime<Equipamento>('equipamentos', { order: [{ col: 'nome' }] })
  const expedidores = useTabelaRealtime<Expedidor>('expedidores', { order: [{ col: 'nome' }] })
  const fechamentos = useTabelaRealtime<Fechamento>('fechamentos', { order: [{ col: 'fechado_em', asc: false }], limit: 200 })

  const [ultima, setUltima] = useState<Date | null>(null)
  const tickTotal = demandas.tick + tecnicos.tick + fechamentos.tick
  useEffect(() => { if (tickTotal > 0) setUltima(new Date()) }, [tickTotal])

  const acoes = useMemo(() => criarAcoes(db), [])
  const tecMap = useMemo(() => new Map(tecnicos.linhas.map(t => [t.id, t])), [tecnicos.linhas])

  const value: DataCtx = {
    demandas: demandas.linhas,
    tecnicos: [...tecnicos.linhas].sort((a, b) => a.nome.localeCompare(b.nome)),
    veiculos: [...veiculos.linhas].sort((a, b) => a.nome.localeCompare(b.nome)),
    clientes: [...clientes.linhas].sort((a, b) => a.nome.localeCompare(b.nome)),
    equipamentos: [...equipamentos.linhas].sort((a, b) => a.nome.localeCompare(b.nome) || (a.patrimonio ?? '').localeCompare(b.patrimonio ?? '')),
    expedidores: expedidores.linhas,
    fechamentos: fechamentos.linhas,
    carregando: demandas.carregando || tecnicos.carregando,
    erro: demandas.erro ?? tecnicos.erro ?? null,
    conectado: !demandas.erro && demandas.realtime !== false,
    ultimaAtualizacao: ultima,
    recarregar: async () => {
      await Promise.all([demandas.recarregar(), tecnicos.recarregar(), veiculos.recarregar(), clientes.recarregar(), equipamentos.recarregar(), expedidores.recarregar(), fechamentos.recarregar()])
    },
    acoes,
    tecnicoPorId: (id) => (id ? tecMap.get(id) : undefined),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useData(): DataCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useData fora do DataProvider')
  return c
}
