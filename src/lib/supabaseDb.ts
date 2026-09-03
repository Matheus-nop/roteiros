import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Db, EventoTabela, Filtro } from './db'
import { DbError } from './db'
import type { Perfil, Usuario } from './types'

function aplicarFiltro(q: any, f?: Filtro) {
  if (!f) return q
  if (f.eq) for (const [k, v] of Object.entries(f.eq)) q = v === null ? q.is(k, null) : q.eq(k, v)
  if (f.in) for (const [k, v] of Object.entries(f.in)) q = q.in(k, v)
  if (f.notIn) for (const [k, v] of Object.entries(f.notIn)) q = q.not(k, 'in', `(${v.map(x => `"${x}"`).join(',')})`)
  if (f.busca && f.busca.termo.trim()) {
    const t = f.busca.termo.trim().replace(/[%,()]/g, ' ')
    q = q.or(f.busca.colunas.map(c => `${c}.ilike.%${t}%`).join(','))
  }
  if (f.order) for (const o of f.order) q = q.order(o.col, { ascending: o.asc ?? true })
  if (f.limit) q = q.limit(f.limit)
  return q
}

function erro(e: { message: string; details?: string; hint?: string } | null): never {
  const msg = e?.message ?? 'Erro desconhecido'
  throw new DbError(e?.details ? `${msg} (${e.details})` : msg)
}

export class SupabaseDb implements Db {
  readonly modo = 'supabase' as const
  readonly client: SupabaseClient
  // Ouvintes locais: toda escrita feita por este cliente é refletida na hora,
  // mesmo que o canal realtime esteja fora. O evento do realtime chega depois e é idempotente.
  private locais = new Map<string, Set<(e: EventoTabela<any>) => void>>()

  private emitirLocal(tabela: string, e: EventoTabela<any>) {
    this.locais.get(tabela)?.forEach(cb => cb(e))
  }

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey, { realtime: { params: { eventsPerSecond: 20 } } })
  }

  async select<T>(tabela: string, filtro?: Filtro): Promise<T[]> {
    const { data, error } = await aplicarFiltro(this.client.from(tabela).select('*'), filtro)
    if (error) erro(error)
    return (data ?? []) as T[]
  }

  async insert<T>(tabela: string, linhas: Record<string, unknown>[]): Promise<T[]> {
    const { data, error } = await this.client.from(tabela).insert(linhas).select('*')
    if (error) erro(error)
    for (const r of data ?? []) this.emitirLocal(tabela, { tipo: 'INSERT', novo: r })
    return (data ?? []) as T[]
  }

  async update<T>(tabela: string, id: string, patch: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.from(tabela).update(patch).eq('id', id).select('*').single()
    if (error) erro(error)
    this.emitirLocal(tabela, { tipo: 'UPDATE', novo: data })
    return data as T
  }

  async updateMany<T>(tabela: string, ids: string[], patch: Record<string, unknown>): Promise<T[]> {
    if (ids.length === 0) return []
    const { data, error } = await this.client.from(tabela).update(patch).in('id', ids).select('*')
    if (error) erro(error)
    for (const r of data ?? []) this.emitirLocal(tabela, { tipo: 'UPDATE', novo: r })
    return (data ?? []) as T[]
  }

  async remove(tabela: string, id: string): Promise<void> {
    const { error } = await this.client.from(tabela).delete().eq('id', id)
    if (error) erro(error)
    this.emitirLocal(tabela, { tipo: 'DELETE', antigo: { id } })
  }

  subscribe<T>(tabela: string, cb: (e: EventoTabela<T>) => void, onStatus?: (ok: boolean) => void): () => void {
    if (!this.locais.has(tabela)) this.locais.set(tabela, new Set())
    this.locais.get(tabela)!.add(cb)
    const canal = this.client
      .channel(`rt:${tabela}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: tabela }, (payload: any) => {
        cb({ tipo: payload.eventType, novo: payload.new as T, antigo: payload.old as Partial<T> })
      })
      .subscribe((status) => { onStatus?.(status === 'SUBSCRIBED') })
    return () => { this.locais.get(tabela)?.delete(cb); this.client.removeChannel(canal) }
  }

  private async montarUsuario(id: string, email: string): Promise<Usuario> {
    const { data } = await this.client.from('perfis').select('*').eq('id', id).maybeSingle()
    if (data) return { id, email, perfil: data as Perfil }
    // Sem perfil: não assume papel nenhum (a RLS bloquearia de qualquer forma). O Layout avisa.
    const perfil: Perfil = { id, nome: email.split('@')[0], email, papel: 'PCM', tecnico_id: null }
    return { id, email, perfil, semPerfil: true }
  }

  auth = {
    usuarioAtual: async (): Promise<Usuario | null> => {
      const { data } = await this.client.auth.getSession()
      const u = data.session?.user
      if (!u) return null
      return this.montarUsuario(u.id, u.email ?? '')
    },
    entrar: async (email: string, senha: string): Promise<Usuario> => {
      const { data, error } = await this.client.auth.signInWithPassword({ email, password: senha })
      if (error || !data.user) throw new DbError(error?.message ?? 'Falha no login')
      return this.montarUsuario(data.user.id, data.user.email ?? email)
    },
    sair: async () => { await this.client.auth.signOut() },
    onChange: (cb: (u: Usuario | null) => void) => {
      const { data } = this.client.auth.onAuthStateChange((_evt, session) => {
        const u = session?.user
        if (!u) { cb(null); return }
        // Não usar await dentro do callback do supabase (deadlock documentado): agenda.
        setTimeout(() => { this.montarUsuario(u.id, u.email ?? '').then(cb) }, 0)
      })
      return () => data.subscription.unsubscribe()
    },
  }
}
