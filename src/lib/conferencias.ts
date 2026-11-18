// A conferência da carga, dia a dia e técnico a técnico (0022).
//
// O relatório (0020) soma o período: quem erra mais, e em quê. Aqui a pergunta
// é a do dia — ESTE técnico conferiu a carga DESTE dia? E a que não bateu, qual
// era e quando foi vista? A base é a mesma do relatório (`conferivel`): carga
// que passa pela expedição e que já estava em rota ou terminou. Dois critérios
// para a mesma palavra fariam o número desta tela não bater com o do gestor.
import { conferivel, type LinhaFato } from './relatorios'
import type { Conferencia } from './types'

/** O que aconteceu com a carga de um técnico num dia. */
export type Celula = {
  /** Itens de carga do dia — o denominador. */
  base: number
  ok: number
  divergentes: number
  naoConferidos: number
}

/**
 * A cor da célula, pela pior notícia primeiro: divergência é erro de carga;
 * sem conferência é ninguém olhando (tudo ou parte); o resto é tudo certo.
 */
export type SituacaoDoDia = 'divergencia' | 'nada' | 'parcial' | 'ok'

export function situacaoDoDia(c: Celula): SituacaoDoDia {
  if (c.divergentes > 0) return 'divergencia'
  if (c.naoConferidos === c.base) return 'nada'
  if (c.naoConferidos > 0) return 'parcial'
  return 'ok'
}

/** A carga do período: o que dava para conferir, com a data dentro de [de, ate]. */
export function cargaDoPeriodo(linhas: LinhaFato[], de: string, ate: string): LinhaFato[] {
  return linhas.filter(l => conferivel(l) && !!l.data && l.data >= de && l.data <= ate)
}

export const SEM_TECNICO = 'Sem técnico'

export type Quadro = {
  /** Do mais recente para o mais antigo. */
  dias: string[]
  /** Em ordem alfabética. */
  tecnicos: string[]
  /** `${tecnico}|${dia}` → célula. Ausente = o técnico não teve carga no dia. */
  celulas: Map<string, Celula>
  /** Por técnico, o período inteiro. */
  porTecnico: Map<string, Celula>
}

const vazia = (): Celula => ({ base: 0, ok: 0, divergentes: 0, naoConferidos: 0 })

function somar(c: Celula, conf: Conferencia) {
  c.base++
  if (conf === 'OK') c.ok++
  else if (conf === 'DIVERGENTE') c.divergentes++
  else c.naoConferidos++
}

export function quadroPorTecnicoEDia(carga: LinhaFato[]): Quadro {
  const celulas = new Map<string, Celula>()
  const porTecnico = new Map<string, Celula>()
  const dias = new Set<string>()
  for (const l of carga) {
    if (!l.data) continue
    const t = (l.tecnico ?? '').trim() || SEM_TECNICO
    dias.add(l.data)
    const k = `${t}|${l.data}`
    const c = celulas.get(k) ?? vazia()
    somar(c, l.conferencia)
    celulas.set(k, c)
    const p = porTecnico.get(t) ?? vazia()
    somar(p, l.conferencia)
    porTecnico.set(t, p)
  }
  return {
    dias: [...dias].sort((a, b) => b.localeCompare(a)),
    tecnicos: [...porTecnico.keys()].sort((a, b) =>
      a === SEM_TECNICO ? 1 : b === SEM_TECNICO ? -1 : a.localeCompare(b, 'pt-BR')),
    celulas,
    porTecnico,
  }
}

export type FiltroDaConferencia = 'todas' | 'divergentes' | 'nao_conferidas' | 'ok'

export const ROTULO_FILTRO: Record<FiltroDaConferencia, string> = {
  todas: 'Todas',
  divergentes: 'Com divergência',
  nao_conferidas: 'Sem conferência',
  ok: 'Conferidas OK',
}

/** A lista do detalhe: o recorte de técnico, dia e situação, a divergência primeiro. */
export function listaDaConferencia(
  carga: LinhaFato[],
  f: { tecnico?: string | null; dia?: string | null; filtro: FiltroDaConferencia },
): LinhaFato[] {
  const ordem: Record<Conferencia, number> = { DIVERGENTE: 0, NAO_CONFERIDO: 1, OK: 2 }
  return carga
    .filter(l => !f.tecnico || ((l.tecnico ?? '').trim() || SEM_TECNICO) === f.tecnico)
    .filter(l => !f.dia || l.data === f.dia)
    .filter(l =>
      f.filtro === 'todas' ? true
        : f.filtro === 'divergentes' ? l.conferencia === 'DIVERGENTE'
          : f.filtro === 'nao_conferidas' ? l.conferencia === 'NAO_CONFERIDO'
            : l.conferencia === 'OK')
    .sort((a, b) =>
      (b.data ?? '').localeCompare(a.data ?? '')
      || ordem[a.conferencia] - ordem[b.conferencia]
      || (a.tecnico ?? '').localeCompare(b.tecnico ?? '', 'pt-BR')
      || (a.cliente ?? '').localeCompare(b.cliente ?? '', 'pt-BR'))
}

/** Os meses ('YYYY-MM') que cobrem [de, ate] — é por eles que a view se recorta no servidor. */
export function mesesEntre(de: string, ate: string): string[] {
  const saida: string[] = []
  let [a, m] = de.slice(0, 7).split('-').map(Number)
  const [af, mf] = ate.slice(0, 7).split('-').map(Number)
  while (a < af || (a === af && m <= mf)) {
    saida.push(`${a}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; a++ }
  }
  return saida
}
