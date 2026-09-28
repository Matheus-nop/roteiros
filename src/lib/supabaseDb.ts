import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Db, EventoTabela, Filtro } from './db'
import { DbError } from './db'
import type { MotivoSemPerfil, Perfil, Usuario } from './types'

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
  // `range` em vez de `limit` quando há offset: é o único jeito de paginar no PostgREST.
  if (f.offset) q = q.range(f.offset, f.offset + (f.limit ?? 1000) - 1)
  else if (f.limit) q = q.limit(f.limit)
  return q
}

/**
 * O 401 do PostgREST, em todas as roupas que ele usa.
 *
 * `PGRST301` é o código do token recusado; a mensagem vem como "JWT expired",
 * "invalid JWT" ou parecida, dependendo da versão. Qualquer uma delas quer
 * dizer a mesma coisa para quem está na frente da tela: entre de novo.
 */
function sessaoVencida(e: { code?: string; message?: string } | null): boolean {
  if (!e) return false
  if (e.code === 'PGRST301' || e.code === '401') return true
  return /\bjwt\b|token|not authenticated|unauthorized/i.test(e.message ?? '')
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

  async upsert<T>(tabela: string, linhas: Record<string, unknown>[], onConflict: string): Promise<T[]> {
    const { data, error } = await this.client.from(tabela).upsert(linhas, { onConflict }).select('*')
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
    const { data, error } = await this.client.from('perfis').select('*').eq('id', id).maybeSingle()
    if (data) return { id, email, perfil: data as Perfil }

    // Daqui para baixo é o caminho do "não veio perfil" — e ele tem TRÊS
    // causas com três consertos diferentes (0021):
    //
    //   · não existe linha em `perfis`;
    //   · existe e o papel é SEM_ACESSO — e aí a RLS esconde a própria linha
    //     da pessoa, então esta consulta volta vazia mesmo com o perfil lá;
    //   · a sessão expirou, ou o banco respondeu com erro.
    //
    // Antes as três viravam a mesma frase na tela. `meu_estado()` é
    // `security definer` e sabe dizer qual é.
    const perfil: Perfil = { id, nome: email.split('@')[0], email, papel: 'PCM', tecnico_id: null }
    const semPerfil = { id, email, perfil, semPerfil: true } as const

    // Token vencido é o caso 3, e é o mais comum de todos: a janela ficou
    // aberta a noite inteira, o refresh falhou, e o PostgREST recusa com 401.
    // A pessoa não perdeu nada — perdeu o login. Sem isto, o aviso era o
    // genérico "não tem perfil", que manda procurar um administrador para
    // resolver o que se resolve saindo e entrando.
    if (error) {
      return sessaoVencida(error)
        ? { ...semPerfil, motivo: 'sem_login' }
        : { ...semPerfil, motivo: 'erro', detalhe: error.message }
    }

    const { data: estado, error: erroEstado } = await this.client.rpc('meu_estado')
    if (erroEstado && sessaoVencida(erroEstado)) return { ...semPerfil, motivo: 'sem_login' }
    // A função pode não existir ainda (0021 não rodada). Nesse caso o aviso
    // volta a ser o genérico de antes, que é o que já havia.
    if (erroEstado || !estado) return { ...semPerfil, motivo: 'sem_perfil' }

    const e = estado as { situacao?: MotivoSemPerfil | 'ok'; nome?: string | null; email?: string | null }
    if (e.situacao === 'ok') return { ...semPerfil, motivo: 'erro', detalhe: 'o banco diz que há perfil, mas a leitura veio vazia' }
    return {
      ...semPerfil,
      perfil: { ...perfil, nome: e.nome ?? perfil.nome, email: e.email ?? perfil.email },
      motivo: e.situacao ?? 'sem_perfil',
    }
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
