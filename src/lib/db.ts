// Camada de acesso a dados. Duas implementações:
//  - SupabaseDb: banco real (PostgreSQL + Realtime)
//  - DemoDb:     memória/localStorage, para validar telas sem credenciais
// Todas as operações identificam registros por uuid — nunca por índice de lista.

import type { Usuario, Papel } from './types'

export type Filtro = {
  eq?: Record<string, unknown>
  in?: Record<string, unknown[]>
  notIn?: Record<string, unknown[]>
  order?: { col: string; asc?: boolean }[]
  limit?: number
  /** Pula as N primeiras linhas. Com `limit`, é o que permite paginar. */
  offset?: number
  /** Busca textual (ilike) em qualquer uma das colunas. */
  busca?: { colunas: string[]; termo: string }
}

export type EventoTabela<T = Record<string, unknown>> = {
  tipo: 'INSERT' | 'UPDATE' | 'DELETE'
  novo?: T
  antigo?: Partial<T>
}

export interface Db {
  readonly modo: 'supabase' | 'demo'
  select<T>(tabela: string, filtro?: Filtro): Promise<T[]>
  insert<T>(tabela: string, linhas: Record<string, unknown>[]): Promise<T[]>
  /** Insere ou sobrescreve conforme o índice único de `onConflict` (colunas separadas por vírgula). */
  upsert<T>(tabela: string, linhas: Record<string, unknown>[], onConflict: string): Promise<T[]>
  update<T>(tabela: string, id: string, patch: Record<string, unknown>): Promise<T>
  updateMany<T>(tabela: string, ids: string[], patch: Record<string, unknown>): Promise<T[]>
  remove(tabela: string, id: string): Promise<void>
  /** Eventos da tabela (realtime + escritas locais). onStatus informa se o canal realtime está ativo. */
  subscribe<T>(tabela: string, cb: (e: EventoTabela<T>) => void, onStatus?: (ok: boolean) => void): () => void
  auth: {
    usuarioAtual(): Promise<Usuario | null>
    entrar(email: string, senha: string): Promise<Usuario>
    entrarDemo?(papel: Papel): Promise<Usuario>
    sair(): Promise<void>
    onChange(cb: (u: Usuario | null) => void): () => void
  }
}

export class DbError extends Error {}
