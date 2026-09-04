/**
 * Leitura de contrato colado do SIXLoke, no formato "blocos de patrimônio".
 *
 * A dinâmica do documento (é o que o sistema antigo já fazia, e o que o comercial
 * conhece): o contrato lista os equipamentos com uma **quantidade** (coluna Remessa)
 * e, mais abaixo, os **patrimônios** aparecem em blocos separados por uma linha
 * "Patrimônio (Nº)" — um bloco por equipamento, na mesma ordem, mas sem dizer a qual
 * equipamento cada bloco pertence.
 *
 * O casamento é pela **quantidade**: um equipamento de 4 unidades pertence ao bloco
 * de 4 patrimônios. Quando dois blocos têm o mesmo tamanho a associação é ambígua e
 * fica para o usuário decidir — nunca se chuta.
 *
 * Cada patrimônio vira **uma demanda**. Acessórios sem patrimônio ficam de fora.
 *
 * Este arquivo é só leitura e casamento: nada de React, nada de banco. É o que
 * permite conferir a regra sem abrir a tela.
 */
import { normalizar } from './format'

const txt = (v: unknown) => String(v ?? '').trim()

/** Um local nunca é uma data. O export do SIXLoke às vezes desloca colunas. */
const pareceData = (v: unknown) => /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(String(v ?? '')) || /\d{1,2}:\d{2}/.test(String(v ?? ''))

export interface CabecalhoContrato {
  ficha: string
  cliente: string
  localObra: string
  endereco: string
  bairro: string
  cidade: string
}

export interface EquipamentoContrato {
  nome: string
  qtd: number
}

const CABECALHO_VAZIO: CabecalhoContrato = { ficha: '', cliente: '', localObra: '', endereco: '', bairro: '', cidade: '' }

/**
 * Lê a linha de dados do contrato. As colunas são localizadas **pelo nome** na linha
 * de títulos (aquela que começa com "ST"), não pela posição: o SIXLoke muda a ordem
 * entre exports. Sem a linha de títulos, cai para as posições históricas.
 */
export function lerCabecalho(texto: string): CabecalhoContrato {
  const linhas = texto.split('\n').map(l => l.replace(/\r$/, '')).filter(l => txt(l) !== '')
  if (!linhas.length) return { ...CABECALHO_VAZIO }

  const linhaTitulos = linhas.find(l => normalizar(l.split('\t')[0]) === 'ST') ?? null
  const linhaDados = linhas.find(l => normalizar(l.split('\t')[0]) !== 'ST') ?? linhas[linhas.length - 1]
  const c = linhaDados.split('\t')

  let iFicha = 1, iCliente = 4, iLocal = 5, iEndereco = 6, iBairro = 8, iCidade = 9
  if (linhaTitulos) {
    const tits = linhaTitulos.split('\t').map(t => normalizar(t))
    const achar = (termos: string[]) => tits.findIndex(t => termos.some(termo => t.includes(termo)))
    // "Cliente" e "Local do cliente" são títulos parecidos: cada um exclui a palavra do outro.
    const iCli = tits.findIndex(t => t.includes('CLIENTE') && !t.includes('LOCAL'))
    const iLoc = tits.findIndex(t => (t.includes('LOCAL') || t.includes('OBRA')) && !t.includes('CLIENTE'))
    const iFic = achar(['FICHA', 'CONTRATO', 'NUMERO'])
    const iEnd = achar(['ENDERECO', 'LOGRADOURO', 'RUA'])
    const iBai = achar(['BAIRRO'])
    const iCid = achar(['CIDADE', 'MUNICIPIO'])
    if (iFic >= 0) iFicha = iFic
    if (iCli >= 0) iCliente = iCli
    if (iLoc >= 0) iLocal = iLoc
    if (iEnd >= 0) iEndereco = iEnd
    if (iBai >= 0) iBairro = iBai
    if (iCid >= 0) iCidade = iCid
  }

  // Se a coluna do local caiu numa data, procura a próxima coluna de texto de verdade.
  if (pareceData(c[iLocal])) {
    for (let i = iCliente + 1; i < c.length; i++) {
      const v = txt(c[i])
      if (v && !pareceData(v) && v.length > 2) { iLocal = i; break }
    }
  }

  const cliente = txt(c[iCliente])
  const localObra = txt(c[iLocal])
  return {
    ficha: txt(c[iFicha]),
    // Cliente vindo como data é sinal de export torto: melhor vazio do que errado.
    cliente: pareceData(cliente) ? '' : cliente,
    localObra: pareceData(localObra) ? '' : localObra,
    endereco: txt(c[iEndereco]),
    bairro: !pareceData(c[iBairro]) ? txt(c[iBairro]) : '',
    cidade: !pareceData(c[iCidade]) ? txt(c[iCidade]) : '',
  }
}

/**
 * Tabela de equipamentos. Interessa o nome (1ª coluna) e a **Remessa** (3ª), que é a
 * quantidade daquele equipamento no contrato. Linhas de título, numeração de item e
 * seções ("Ambiente", "Composição") são ruído do export.
 */
export function lerEquipamentos(texto: string): EquipamentoContrato[] {
  const out: EquipamentoContrato[] = []
  for (const linha of texto.split('\n').map(l => l.replace(/\r/g, ''))) {
    const t = linha.trim()
    if (!t) continue
    if (/^Equipamento\s/i.test(t)) continue
    if (/^\d+\s*-\s/.test(t)) continue
    if (/^Ambiente/i.test(t) || /^Composi/i.test(t)) continue
    const cols = linha.split('\t')
    if (cols.length < 4) continue
    const nome = txt(cols[0])
    const qtd = parseInt(cols[2]) || 0
    if (nome && qtd > 0) out.push({ nome, qtd })
  }
  return out
}

/**
 * Blocos de patrimônio. Cada linha que contém "Patrimônio" fecha o bloco anterior e
 * abre o próximo. Patrimônio é `1234` ou `123-4`.
 */
export function lerBlocos(texto: string): string[][] {
  const blocos: string[][] = []
  let atual: string[] = []
  for (const linha of texto.split('\n')) {
    const l = linha.trim()
    if (/Patrim[oô]nio/i.test(l)) {
      if (atual.length) { blocos.push(atual); atual = [] }
    } else if (/^\d{3,}-\d+$/.test(l) || /^\d{4,}$/.test(l)) {
      atual.push(l)
    }
  }
  if (atual.length) blocos.push(atual)
  return blocos
}

/**
 * Sugere um bloco para cada equipamento pela quantidade. Só sugere quando a resposta é
 * **única**: se dois blocos têm 4 unidades e o equipamento pede 4, qualquer escolha
 * seria chute — devolve `null` e a tela pede a decisão.
 */
export function casarBlocos(equips: EquipamentoContrato[], blocos: string[][]): (number | null)[] {
  const tamanhos = blocos.map(b => b.length)
  return equips.map(eq => {
    const candidatos = tamanhos.map((t, i) => (t === eq.qtd ? i : -1)).filter(i => i >= 0)
    return candidatos.length === 1 ? candidatos[0] : null
  })
}

/**
 * Palavras que valem para comparar nomes de equipamento.
 *
 * Tokens curtos entram quando têm dígito: a bitola é justamente o que distingue
 * `BOMBA SUBMERSA 2"` de `BOMBA SUBMERSA 3"`, e descartá-la (como fazia o sistema
 * antigo) deixava as duas empatadas — a associação saía por ordem de cadastro.
 */
const palavrasDoNome = (nome: string) =>
  normalizar(nome).split(/\s+/).filter(p => p.length > 2 || /\d/.test(p))

/**
 * Associa o nome longo do contrato a um equipamento do cadastro, por palavras em comum.
 * A fração é sobre as palavras do **cadastro**: "BOMBA SUBMERSA 2" casa com
 * "BOMBA SUBMERSA 2 POLEGADAS PARA ESGOTAMENTO" do contrato. Abaixo de metade das
 * palavras não é associação, é coincidência.
 */
export function melhorEquipamento(nomeContrato: string, cadastrados: string[]): string {
  const palavrasContrato = palavrasDoNome(nomeContrato)
  if (!palavrasContrato.length) return ''
  let melhor = '', melhorFracao = 0
  for (const cad of cadastrados) {
    const palavras = palavrasDoNome(cad)
    if (!palavras.length) continue
    const acertos = palavras.filter(p => palavrasContrato.includes(p)).length
    const fracao = acertos / palavras.length
    if (acertos > 0 && fracao > melhorFracao) { melhorFracao = fracao; melhor = cad }
  }
  return melhorFracao >= 0.5 ? melhor : ''
}

/** Conectores e palavras genéricas: casar por elas associaria qualquer coisa. */
const IRRELEVANTES = new Set(['DE', 'DO', 'DA', 'DAS', 'DOS', 'E', '-', 'BASE', 'OBRA', 'SUBS', 'OP'])

/**
 * Associa bairro/cidade a uma localidade que a equipe já usa, para o item cair na
 * mesma coluna do quadro em vez de criar uma localidade quase igual.
 *
 * Exige match forte: ou o nome bate inteiro, ou duas palavras específicas casam.
 * Casar só pela cidade não vale — quase todo contrato é "Rio de Janeiro", e isso
 * associaria a demanda a uma localidade aleatória da capital.
 */
export function melhorLocal(bairro: string, cidade: string, conhecidos: string[]): string {
  if (!conhecidos.length) return ''
  const alvo = normalizar(bairro)
  if (!alvo) return ''   // sem o local de entrega não há como casar com segurança
  const palavras = alvo.split(/[\s\-/]+/).filter(p => p.length > 2 && !IRRELEVANTES.has(p))
  if (!palavras.length) return ''

  let melhor = '', melhorPonto = 0
  for (const loc of conhecidos) {
    const n = normalizar(loc)
    let ponto = 0
    if (alvo.length >= 4 && (n.includes(alvo) || alvo.includes(n))) ponto += 6
    for (const p of palavras) if (n.includes(p)) ponto += 3
    if (ponto > melhorPonto) { melhorPonto = ponto; melhor = loc }
  }
  void cidade   // a cidade entra só como desempate futuro; sozinha ela não associa nada
  return melhorPonto >= 6 ? melhor : ''
}

/** Fallback quando nenhuma localidade conhecida casou. */
export function localTextual(cab: CabecalhoContrato): string {
  if (cab.bairro) return cab.cidade ? `${cab.bairro} - ${cab.cidade}` : cab.bairro
  return cab.cidade || cab.endereco || cab.localObra || ''
}
