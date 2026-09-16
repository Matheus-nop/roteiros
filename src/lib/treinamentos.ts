// Regras do módulo de treinamentos: o aviso da véspera, o CPF e os rótulos.
//
// O que NÃO mora aqui: gravar. Isso é de `lib/actions.ts`, junto com o resto das
// operações de negócio — inclusive a demanda que acompanha cada treinamento.
import type { Presenca, StatusTreinamento, Treinamento } from './types'
import { addDias, hojeISO, normalizar } from './format'

// ---------------------------------------------------------------------
// Rótulos
// ---------------------------------------------------------------------
export const STATUS_TREINAMENTO_LABEL: Record<StatusTreinamento, string> = {
  AGENDADO: 'Agendado',
  REALIZADO: 'Realizado',
  CANCELADO: 'Cancelado',
}

export const STATUS_TREINAMENTO_TONE: Record<StatusTreinamento, string> = {
  AGENDADO: 'bg-violet-50 text-violet-800 ring-violet-200',
  REALIZADO: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  CANCELADO: 'bg-red-50 text-red-800 ring-red-200',
}

/** Código do certificado e da folha de presença: TRN-014. */
export const codigoTreinamento = (numero: number): string => `TRN-${String(numero).padStart(3, '0')}`

// ---------------------------------------------------------------------
// O aviso
// ---------------------------------------------------------------------
/**
 * Quantos dias antes o painel começa a avisar.
 *
 * Três, e não sete: é o tempo de separar material e confirmar com o cliente. Um
 * aviso que fica uma semana na tela vira parte do cenário e para de ser lido —
 * o mesmo motivo pelo qual o painel não lista tudo o que existe.
 */
export const DIAS_DE_AVISO = 3

export type Proximidade = 'hoje' | 'amanha' | 'proximo' | 'atrasado'

/**
 * A que distância está este treinamento. `null` quando ele não merece aviso —
 * longe demais, cancelado, ou já realizado.
 *
 * "Atrasado" é o treinamento cuja data passou e que ninguém fechou. Ele continua
 * aparecendo de propósito: ou aconteceu e falta digitar a lista de presença, ou
 * não aconteceu e o cliente ficou esperando. Os dois casos pedem alguém.
 */
export function proximidade(t: Treinamento, hoje = hojeISO()): Proximidade | null {
  if (t.status !== 'AGENDADO') return null
  if (t.data < hoje) return 'atrasado'
  if (t.data === hoje) return 'hoje'
  if (t.data === addDias(hoje, 1)) return 'amanha'
  if (t.data <= addDias(hoje, DIAS_DE_AVISO)) return 'proximo'
  return null
}

/** Os treinamentos que o painel precisa mostrar, do mais urgente para o menos. */
export function paraAvisar(treinamentos: Treinamento[], hoje = hojeISO()): { t: Treinamento; quando: Proximidade }[] {
  const ordem: Record<Proximidade, number> = { atrasado: 0, hoje: 1, amanha: 2, proximo: 3 }
  return treinamentos
    .map(t => ({ t, quando: proximidade(t, hoje) }))
    .filter((x): x is { t: Treinamento; quando: Proximidade } => x.quando !== null)
    .sort((a, b) => ordem[a.quando] - ordem[b.quando] || a.t.data.localeCompare(b.t.data))
}

export const ROTULO_PROXIMIDADE: Record<Proximidade, string> = {
  atrasado: 'Data já passou',
  hoje: 'Hoje',
  amanha: 'Amanhã',
  proximo: 'Nos próximos dias',
}

export const TOM_PROXIMIDADE: Record<Proximidade, string> = {
  atrasado: 'bg-red-50 text-red-800 ring-red-200',
  hoje: 'bg-amber-50 text-amber-900 ring-amber-200',
  amanha: 'bg-amber-50 text-amber-800 ring-amber-200',
  proximo: 'bg-sky-50 text-sky-800 ring-sky-200',
}

// ---------------------------------------------------------------------
// Hora e carga horária
// ---------------------------------------------------------------------
/** O Postgres devolve `time` como '09:00:00'; o campo do formulário quer '09:00'. */
export const fmtHora = (h: string | null | undefined): string => (h ?? '').slice(0, 5)

/** 2 → "2h"; 2.5 → "2h30"; 1.25 → "1h15". Como se fala, não "2,5 h". */
export function fmtCarga(horas: number | null | undefined): string {
  const v = Number(horas)
  if (!isFinite(v) || v <= 0) return '—'
  const h = Math.floor(v)
  const min = Math.round((v - h) * 60)
  if (!min) return `${h}h`
  return `${h}h${String(min).padStart(2, '0')}`
}

/**
 * A carga horária que o banco vai gravar, calculada aqui só para o formulário
 * mostrar antes de salvar. A verdade continua sendo a coluna gerada da 0016 —
 * esta função não grava nada.
 */
export function cargaPrevista(inicio: string, fim: string): number {
  const min = (h: string) => {
    const [a, b] = h.split(':').map(Number)
    return (a || 0) * 60 + (b || 0)
  }
  return Math.max(0, Math.round(((min(fim) - min(inicio)) / 60) * 100) / 100)
}

/**
 * A carga horária como o certificado escreve: "01 HORA", "02 HORAS E 30
 * MINUTOS". É o texto do modelo antigo, que a equipe digitava à mão.
 *
 * Zero à esquerda de propósito — "01 HORA" é como está no papel que o cliente
 * já recebeu, e trocar para "1 HORA" faria a segunda via parecer outro
 * documento.
 */
export function cargaPorExtenso(horas: number | null | undefined): string {
  const v = Number(horas)
  if (!isFinite(v) || v <= 0) return '—'
  const h = Math.floor(v)
  const min = Math.round((v - h) * 60)
  const partes: string[] = []
  if (h) partes.push(`${String(h).padStart(2, '0')} ${h === 1 ? 'HORA' : 'HORAS'}`)
  if (min) partes.push(`${String(min).padStart(2, '0')} ${min === 1 ? 'MINUTO' : 'MINUTOS'}`)
  return partes.join(' E ')
}

const MESES = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
]

/**
 * '2025-12-16' → '16 DE DEZEMBRO DE 2025'.
 *
 * Feito na mão, e não com `toLocaleDateString`, pela mesma razão que `fmtData`:
 * a data é uma string ISO e passar por `new Date` a reinterpreta no fuso do
 * aparelho — um certificado emitido à noite sairia com a data do dia anterior.
 */
export function dataPorExtenso(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  if (!m) return '—'
  return `${m[3]} DE ${MESES[Number(m[2]) - 1] ?? '—'} DE ${m[1]}`
}

/**
 * O conteúdo programático que este tema já usou da última vez.
 *
 * "OPERAÇÃO SEGURA DE MARTELO ROMPEDOR" é o mesmo curso dado o ano inteiro,
 * com os mesmos cinco tópicos. Quem agenda o décimo não deve redigitar nada —
 * e, se redigitar, é quase certo que sai diferente do certificado anterior.
 * Sugere e deixa corrigir, como o campo Local faz com o endereço.
 */
export function conteudoDoTema(tema: string, treinamentos: Treinamento[]): string[] {
  const alvo = normalizar(tema)
  if (!alvo) return []
  const anterior = treinamentos
    .filter(t => normalizar(t.tema) === alvo && t.conteudo?.length)
    .sort((a, b) => b.data.localeCompare(a.data))[0]
  return anterior?.conteudo ?? []
}

// ---------------------------------------------------------------------
// CPF
// ---------------------------------------------------------------------
export const soDigitos = (v: string | null | undefined): string => (v ?? '').replace(/\D/g, '')

/** 12345678909 → 123.456.789-09. Fora do formato, devolve o que recebeu. */
export function fmtCpf(v: string | null | undefined): string {
  const d = soDigitos(v)
  if (d.length !== 11) return v ?? ''
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

/**
 * Dígito verificador do CPF.
 *
 * Isto existe porque o CPF vai IMPRESSO no certificado, e um dígito trocado só
 * aparece meses depois, quando o cliente pede a segunda via de um papel que não
 * bate com o RH dele. Custa uma conta na hora de digitar e evita reemitir tudo.
 *
 * O campo pode ficar VAZIO — participante sem documento é caso real. O que não
 * pode é ficar errado.
 */
export function cpfValido(v: string | null | undefined): boolean {
  const d = soDigitos(v)
  if (d.length !== 11) return false
  if (/^(\d)\1{10}$/.test(d)) return false          // 111.111.111-11 passa na conta e não existe
  const dv = (ate: number) => {
    let soma = 0
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

// ---------------------------------------------------------------------
// Busca
// ---------------------------------------------------------------------
export function textoBuscaTreinamento(t: Treinamento): string {
  return normalizar([codigoTreinamento(t.numero), t.tema, t.cliente_nome, t.local, t.observacao].join(' '))
}

/** Quantos assistiram de fato — é este número que vale, não o de inscritos. */
export const presentes = (lista: Presenca[]): Presenca[] => lista.filter(p => p.presente)
