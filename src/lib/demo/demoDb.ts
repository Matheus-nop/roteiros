// Implementação em memória do Db (modo demonstração).
// Simula: trigger de histórico, updated_at, numeração e realtime (inclusive entre abas do navegador).
import type { Db, EventoTabela, Filtro } from '../db'
import { DbError } from '../db'
import type { Demanda, Historico, Papel, Usuario } from '../types'
import { clientesSeed, equipamentosSeed, expedidoresSeed, gerarDemandasSeed, tecnicosSeed, veiculosSeed } from './seed'

type Linha = Record<string, any>
type Store = Record<string, Linha[]>

const CHAVE = 'roteiros-demo-v1'
const CHAVE_USER = 'roteiros-demo-user'

function uuid() {
  const h = (n: number) => Math.floor(Math.random() * 16 ** n).toString(16).padStart(n, '0')
  return `${h(8)}-${h(4)}-4${h(3)}-a${h(3)}-${h(12)}`
}

function seedInicial(): Store {
  return {
    tecnicos: tecnicosSeed,
    veiculos: veiculosSeed,
    clientes: clientesSeed,
    equipamentos: equipamentosSeed,
    expedidores: expedidoresSeed,
    demandas: gerarDemandasSeed(),
    historico: [],
    fechamentos: [],
    perfis: [],
  }
}

const cmp = (a: any, b: any) => {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  return a < b ? -1 : 1
}

export class DemoDb implements Db {
  readonly modo = 'demo' as const
  private store: Store
  private ouvintes = new Map<string, Set<(e: EventoTabela<any>) => void>>()
  private authOuvintes = new Set<(u: Usuario | null) => void>()
  private usuario: Usuario | null = null
  private canal: BroadcastChannel | null = null

  constructor() {
    let s: Store | null = null
    try { const raw = localStorage.getItem(CHAVE); if (raw) s = JSON.parse(raw) } catch { /* ignore */ }
    this.store = s ?? seedInicial()
    if (!s) this.persistir()
    try { const u = localStorage.getItem(CHAVE_USER); if (u) this.usuario = JSON.parse(u) } catch { /* ignore */ }
    if (typeof BroadcastChannel !== 'undefined') {
      this.canal = new BroadcastChannel(CHAVE)
      this.canal.onmessage = (m) => {
        const { tabela, evento } = m.data as { tabela: string; evento: EventoTabela }
        this.recarregar()
        this.emitirLocal(tabela, evento)
      }
    }
  }

  static limpar() { localStorage.removeItem(CHAVE) }

  private recarregar() {
    try { const raw = localStorage.getItem(CHAVE); if (raw) this.store = JSON.parse(raw) } catch { /* ignore */ }
  }
  private persistir() {
    try { localStorage.setItem(CHAVE, JSON.stringify(this.store)) } catch { /* ignore */ }
  }
  private emitirLocal(tabela: string, e: EventoTabela) {
    this.ouvintes.get(tabela)?.forEach(cb => cb(e))
  }
  private emitir(tabela: string, e: EventoTabela) {
    this.persistir()
    this.emitirLocal(tabela, e)
    this.canal?.postMessage({ tabela, evento: e })
  }
  private tabela(nome: string): Linha[] {
    if (!this.store[nome]) this.store[nome] = []
    return this.store[nome]
  }

  private registrarHistorico(antigo: Linha | null, novo: Linha | null) {
    const acao: string[] = []
    if (!antigo && novo) acao.push('criada')
    else if (antigo && !novo) acao.push('excluída')
    else if (antigo && novo) {
      if (antigo.status !== novo.status) acao.push(`status ${antigo.status} → ${novo.status}`)
      if (antigo.status_separacao !== novo.status_separacao) acao.push(`separação ${novo.status_separacao}${novo.separado_por ? ' por ' + novo.separado_por : ''}`)
      if (antigo.tecnico_id !== novo.tecnico_id) acao.push('técnico alterado')
      if (antigo.data_planejada !== novo.data_planejada) acao.push(`data planejada ${antigo.data_planejada ?? '—'} → ${novo.data_planejada ?? '—'}`)
      if (antigo.veiculo !== novo.veiculo) acao.push(`veículo ${antigo.veiculo ?? '—'} → ${novo.veiculo ?? '—'}`)
      if (acao.length === 0) return
    }
    const h: Historico = {
      id: uuid(),
      demanda_id: (novo ?? antigo)!.id,
      status_anterior: antigo?.status ?? null,
      status_novo: novo?.status ?? null,
      alterado_por: this.usuario?.id ?? null,
      alterado_em: new Date().toISOString(),
      snapshot: (antigo ?? novo) as Partial<Demanda>,
      acao: acao.join('; '),
    }
    this.tabela('historico').unshift(h)
    this.emitirLocal('historico', { tipo: 'INSERT', novo: h as unknown as Record<string, unknown> })
  }

  async select<T>(tabela: string, f?: Filtro): Promise<T[]> {
    let rows = [...this.tabela(tabela)]
    if (f?.eq) for (const [k, v] of Object.entries(f.eq)) rows = rows.filter(r => r[k] === v)
    if (f?.in) for (const [k, v] of Object.entries(f.in)) rows = rows.filter(r => v.includes(r[k]))
    if (f?.notIn) for (const [k, v] of Object.entries(f.notIn)) rows = rows.filter(r => !v.includes(r[k]))
    if (f?.busca && f.busca.termo.trim()) {
      const t = f.busca.termo.trim().toLowerCase()
      rows = rows.filter(r => f.busca!.colunas.some(c => String(r[c] ?? '').toLowerCase().includes(t)))
    }
    if (f?.order) {
      for (const o of [...f.order].reverse()) rows.sort((a, b) => (o.asc ?? true ? 1 : -1) * cmp(a[o.col], b[o.col]))
    }
    if (f?.limit) rows = rows.slice(0, f.limit)
    return structuredClone(rows) as T[]
  }

  async insert<T>(tabela: string, linhas: Record<string, unknown>[]): Promise<T[]> {
    const out: Linha[] = []
    const t = this.tabela(tabela)
    for (const l of linhas) {
      const agora = new Date().toISOString()
      const row: Linha = { ...l, id: (l.id as string) ?? uuid(), created_at: agora }
      if (tabela === 'demandas') {
        const max = t.reduce((m, r) => Math.max(m, r.numero ?? 0), 0)
        row.numero = max + 1
        row.updated_at = agora
        row.status ??= 'FILA'
        row.status_separacao ??= 'NAO_SEPARADO'
        row.quantidade ??= 1
        row.herdado_de_pendencia ??= false
        row.data_abertura ??= agora.slice(0, 10)
        row.created_by = this.usuario?.id ?? null
        for (const k of ['om','cliente_id','cliente_nome','local','equipamento_id','equipamento_nome','patrimonio','unidade','tecnico_id','veiculo','data_planejada','data_reagendada','separado_por','data_separacao','ordem_parada','origem','observacao','finalizado_em'])
          row[k] ??= null
      }
      t.push(row)
      out.push(row)
      if (tabela === 'demandas') this.registrarHistorico(null, row)
      this.emitir(tabela, { tipo: 'INSERT', novo: structuredClone(row) })
    }
    return structuredClone(out) as T[]
  }

  async upsert<T>(tabela: string, linhas: Record<string, unknown>[], onConflict: string): Promise<T[]> {
    const chaves = onConflict.split(',').map(c => c.trim())
    const t = this.tabela(tabela)
    const out: Linha[] = []
    for (const l of linhas) {
      const i = t.findIndex(r => chaves.every(k => r[k] === l[k]))
      if (i >= 0) {
        t[i] = { ...t[i], ...l }
        out.push(t[i])
        this.emitir(tabela, { tipo: 'UPDATE', novo: structuredClone(t[i]) })
      } else {
        const row: Linha = { ...l, id: (l.id as string) ?? uuid(), created_at: new Date().toISOString() }
        t.push(row)
        out.push(row)
        this.emitir(tabela, { tipo: 'INSERT', novo: structuredClone(row) })
      }
    }
    this.persistir()
    return structuredClone(out) as T[]
  }

  async update<T>(tabela: string, id: string, patch: Record<string, unknown>): Promise<T> {
    const t = this.tabela(tabela)
    const i = t.findIndex(r => r.id === id)
    if (i < 0) throw new DbError(`Registro não encontrado em ${tabela}`)
    const antigo = structuredClone(t[i])
    const novo = { ...t[i], ...patch }
    if (tabela === 'demandas') novo.updated_at = new Date().toISOString()
    t[i] = novo
    if (tabela === 'demandas') this.registrarHistorico(antigo, novo)
    this.emitir(tabela, { tipo: 'UPDATE', novo: structuredClone(novo), antigo })
    return structuredClone(novo) as T
  }

  async updateMany<T>(tabela: string, ids: string[], patch: Record<string, unknown>): Promise<T[]> {
    const out: T[] = []
    for (const id of ids) out.push(await this.update<T>(tabela, id, patch))
    return out
  }

  async remove(tabela: string, id: string): Promise<void> {
    const t = this.tabela(tabela)
    const i = t.findIndex(r => r.id === id)
    if (i < 0) return
    const [antigo] = t.splice(i, 1)
    if (tabela === 'demandas') this.registrarHistorico(antigo, null)
    this.emitir(tabela, { tipo: 'DELETE', antigo })
  }

  subscribe<T>(tabela: string, cb: (e: EventoTabela<T>) => void, onStatus?: (ok: boolean) => void): () => void {
    if (!this.ouvintes.has(tabela)) this.ouvintes.set(tabela, new Set())
    this.ouvintes.get(tabela)!.add(cb)
    onStatus?.(true)
    return () => { this.ouvintes.get(tabela)?.delete(cb) }
  }

  auth = {
    usuarioAtual: async () => this.usuario,
    entrar: async (email: string, _senha: string): Promise<Usuario> => {
      const papel: Papel = email.toLowerCase().includes('admin') ? 'ADMIN' : 'PCM'
      return this.auth.entrarDemo(papel, email)
    },
    entrarDemo: async (papel: Papel, email = `${papel.toLowerCase()}@demo.local`): Promise<Usuario> => {
      const u: Usuario = {
        id: `demo-${papel.toLowerCase()}`,
        email,
        perfil: { id: `demo-${papel.toLowerCase()}`, nome: papel === 'TECNICO' ? 'Victor' : `Usuário ${papel}`, email, papel, tecnico_id: papel === 'TECNICO' ? tecnicosSeed[0].id : null },
      }
      this.usuario = u
      // Espelha o perfil na tabela: é dela que as telas tiram o nome de quem lançou
      // ou alterou. No Supabase isso já existe; aqui precisa ser criado à mão.
      const perfis = this.tabela('perfis')
      if (!perfis.some(p => p.id === u.id)) {
        perfis.push({ ...u.perfil })
        this.persistir()
        this.emitir('perfis', { tipo: 'INSERT', novo: { ...u.perfil } })
      }
      localStorage.setItem(CHAVE_USER, JSON.stringify(u))
      this.authOuvintes.forEach(cb => cb(u))
      return u
    },
    sair: async () => {
      this.usuario = null
      localStorage.removeItem(CHAVE_USER)
      this.authOuvintes.forEach(cb => cb(null))
    },
    onChange: (cb: (u: Usuario | null) => void) => {
      this.authOuvintes.add(cb)
      return () => { this.authOuvintes.delete(cb) }
    },
  }
}
