import type { Demanda } from './types'

/** Data de hoje em ISO (yyyy-mm-dd), no fuso local. */
export function hojeISO(): string {
  const d = new Date()
  return toISO(d)
}

export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDias(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return toISO(dt)
}

/** yyyy-mm-dd → dd/mm/yyyy. Nunca reinterpreta OM como data: só aceita ISO. */
export function fmtData(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${m[3]}/${m[2]}/${m[1]}`
}

export function fmtDataCurta(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${m[3]}/${m[2]}`
}

export function fmtDataHora(ts: string | null | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function diaSemana(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
}

/** Rótulo de data com contexto ("Hoje", "Amanhã", "Atrasada"). */
export function rotuloData(iso: string | null): string {
  if (!iso) return 'Sem data'
  const hoje = hojeISO()
  if (iso === hoje) return `Hoje · ${fmtData(iso)}`
  if (iso === addDias(hoje, 1)) return `Amanhã · ${fmtData(iso)}`
  if (iso < hoje) return `Atrasada · ${fmtData(iso)}`
  return `${diaSemana(iso)} · ${fmtData(iso)}`
}

/** Patrimônio ou "Qtd: X" para itens controlados por quantidade. */
export function fmtPatrimonio(d: Pick<Demanda, 'patrimonio' | 'quantidade' | 'unidade'>): string {
  if (d.patrimonio && d.patrimonio.trim()) return d.patrimonio
  const un = d.unidade ? ` ${d.unidade.toLowerCase()}` : ''
  return `Qtd: ${fmtNum(d.quantidade)}${un}`
}

export function fmtNum(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '—'
  const v = typeof n === 'string' ? Number(n) : n
  if (isNaN(v)) return String(n)
  return Number.isInteger(v) ? String(v) : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

export function codigo(prefixo: 'EXP' | 'ROT', numero: number): string {
  return `${prefixo}-${String(numero).padStart(3, '0')}`
}

export function normalizar(s: string | null | undefined): string {
  return (s ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
}

/** Texto único da demanda para busca livre. */
export function textoBusca(d: Demanda): string {
  return normalizar([d.om, d.cliente_nome, d.local, d.tipo, d.equipamento_nome, d.patrimonio, d.veiculo, d.observacao].join(' '))
}

/** Chave da parada (agrupa itens do mesmo local/cliente). */
export function chaveParada(d: Demanda): string {
  return `${normalizar(d.cliente_nome)}|${normalizar(d.local)}`
}

export function agrupar<T, K extends string>(itens: T[], chave: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>()
  for (const it of itens) {
    const k = chave(it)
    const arr = m.get(k)
    if (arr) arr.push(it)
    else m.set(k, [it])
  }
  return m
}

export function ordenarParadas(a: Demanda, b: Demanda): number {
  const oa = a.ordem_parada ?? Number.MAX_SAFE_INTEGER
  const ob = b.ordem_parada ?? Number.MAX_SAFE_INTEGER
  if (oa !== ob) return oa - ob
  return a.numero - b.numero
}

export function plural(n: number, s: string, p: string): string {
  return `${n} ${n === 1 ? s : p}`
}
