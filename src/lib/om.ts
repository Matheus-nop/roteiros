/**
 * Leitura da lista de manutenções colada do Sisloc.
 *
 * A dinâmica é a que o PCM já conhece do sistema antigo: abre a consulta de OMs no
 * Sisloc, seleciona as linhas com serviço concluído na oficina, copia e cola aqui. O
 * texto vem separado por tabulação, com dezenas de colunas — a maioria sem uso.
 *
 * POR QUE PROCURAR O CABEÇALHO EM VEZ DE FIXAR AS COLUNAS
 *
 * O Sisloc muda a ordem das colunas conforme o filtro que o usuário deixou salvo. Ler
 * pela posição funciona até o dia em que alguém arrasta uma coluna, e aí o patrimônio
 * entra no lugar do cliente sem ninguém perceber. Por isso as colunas são achadas pelo
 * NOME, e a posição fixa é só a última tentativa (é o mesmo que o sistema antigo fazia,
 * e os números aqui são os dele).
 *
 * Este arquivo é só leitura: nada de React, nada de banco. É o que permite conferir a
 * regra sem abrir a tela.
 */
import { normalizar } from './format'
import { melhorLocal } from './contrato'

/** Posições usadas quando o texto colado vem sem a linha de títulos. Do sistema antigo. */
const PADRAO = { os: 4, cliente: 5, local: 6, equipamento: 7, patrimonio: 8, marca: 10, cidade: 24 }

/** Menos que isto não é uma linha de OM, é sobra de formatação. */
const MINIMO_COLUNAS = 9

export interface LinhaOM {
  os: string
  cliente: string
  /** Localidade já resolvida: a conhecida que casou, ou o local da própria OM. */
  local: string
  localOriginal: string
  cidade: string
  /** Nome do equipamento sem a marca. */
  equipamento: string
  equipamentoOriginal: string
  marca: string
  patrimonio: string
  /** true quando o local saiu da OM porque nenhuma localidade conhecida casou. */
  localNovo: boolean
}

export interface LeituraOM {
  linhas: LinhaOM[]
  /** Linhas descartadas: curtas demais, ou sem cliente/equipamento. */
  ignoradas: number
  comCabecalho: boolean
}

/**
 * Tira a marca do nome do equipamento.
 *
 * O Sisloc grava "MARTELO ROMPEDOR 30KG BOSCH" com a marca colada no nome, e o cadastro
 * daqui é por modelo, não por marca. Deixar a marca criaria um equipamento novo a cada
 * fabricante do mesmo martelo.
 */
export function removerMarca(equipamento: string, marca: string): string {
  const eq = String(equipamento ?? '').trim()
  const m = String(marca ?? '').trim()
  if (!m) return eq.replace(/\s+/g, ' ').trim()
  const escapada = m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return eq.replace(new RegExp(`\\s*${escapada}\\s*`, 'gi'), ' ').replace(/\s+/g, ' ').trim()
}

/** Acha a linha de títulos e mapeia cada campo pelo nome. Devolve null se não houver. */
function mapearColunas(linhas: string[]): typeof PADRAO | null {
  for (const linha of linhas) {
    const cols = linha.split('\t').map(normalizar)
    if (!cols.includes('NUMERO') || !cols.includes('CLIENTE')) continue
    const achado = { ...PADRAO }
    cols.forEach((nome, i) => {
      if (nome === 'NUMERO') achado.os = i
      else if (nome === 'CLIENTE') achado.cliente = i
      else if (nome.includes('LOCAL DE ENTREGA') || nome.includes('NOME LOCAL')) achado.local = i
      else if (nome === 'EQUIPAMENTO') achado.equipamento = i
      // "Patr./Núm. série" é a única coluna com SÉRIE no nome.
      else if (nome.includes('SERIE')) achado.patrimonio = i
      else if (nome.includes('MARCA')) achado.marca = i
      else if (nome === 'CIDADE') achado.cidade = i
    })
    return achado
  }
  return null
}

/**
 * @param texto            o que foi colado do Sisloc.
 * @param locaisConhecidos localidades que a equipe já usa, para o item cair na mesma
 *                         coluna do quadro em vez de criar uma quase igual.
 */
export function lerOM(texto: string, locaisConhecidos: string[] = []): LeituraOM {
  const linhas = String(texto ?? '').split('\n').filter(l => l.trim() !== '')
  const col = mapearColunas(linhas)
  const idx = col ?? PADRAO
  const saida: LinhaOM[] = []
  let ignoradas = 0

  for (const linha of linhas) {
    const c = linha.split('\t')
    if (c.length < MINIMO_COLUNAS) { ignoradas++; continue }
    const em = (i: number) => (c[i] ?? '').trim()

    const cliente = em(idx.cliente)
    const equipamentoOriginal = em(idx.equipamento)
    // A própria linha de títulos cai aqui: ela também tem tabulação e tamanho.
    if (normalizar(cliente) === 'CLIENTE' || normalizar(equipamentoOriginal) === 'EQUIPAMENTO') continue
    if (!cliente || !equipamentoOriginal) { ignoradas++; continue }

    const marca = em(idx.marca)
    const localOriginal = em(idx.local)
    const cidade = em(idx.cidade)
    const conhecido = melhorLocal(localOriginal, cidade, locaisConhecidos)

    saida.push({
      os: em(idx.os),
      cliente,
      local: conhecido || localOriginal || cidade,
      localOriginal,
      cidade,
      equipamento: removerMarca(equipamentoOriginal, marca),
      equipamentoOriginal,
      marca,
      patrimonio: em(idx.patrimonio),
      localNovo: !conhecido,
    })
  }

  return { linhas: saida, ignoradas, comCabecalho: col !== null }
}
