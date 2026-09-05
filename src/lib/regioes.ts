// Macrorregião a partir do texto livre de `local`.
//
// O campo `local` nunca foi um cadastro: é o que o cliente escreveu na OM
// ("NOVA IGUAÇU - CENTRO", "PENHA - ZONA NORTE", "RIO - MADUREIRA"). Para o
// planejamento, porém, a pergunta útil não é o bairro e sim a direção do dia:
// "o que tem na Baixada?", "quanto sobrou na Zona Oeste?". Aqui esse texto é lido
// e devolvido como uma das macrorregiões abaixo — sem alterar nada na demanda.
//
// A leitura é em duas passadas, porque o município manda mais que o bairro:
//   1. município — "DUQUE DE CAXIAS - SANTA CRUZ DA SERRA" é Baixada, não Zona Oeste;
//      "NOVA IGUAÇU - CENTRO" é Baixada, não Centro do Rio.
//   2. bairro — só quando o município é o Rio (ou quando nenhum aparece, que é o caso
//      de quem escreve apenas "MADUREIRA").
//
// O que não for reconhecido cai em OUTRAS e continua visível na tela (o filtro lista
// "Sem região identificada" com a contagem): nada some por não estar nesta lista.
// Bairro novo que aparecer no dia a dia entra aqui, numa linha.
import { normalizar } from './format'

export type Regiao =
  | 'BAIXADA' | 'ZONA_OESTE' | 'ZONA_NORTE' | 'ZONA_SUL' | 'CENTRO' | 'LESTE'
  | 'COSTA_VERDE' | 'SERRANA' | 'LAGOS' | 'SUL_FLUMINENSE' | 'NORTE_FLUMINENSE' | 'OUTRAS'

/** Ordem do filtro: primeiro onde o grupo mais roda, e "sem região" por último. */
export const REGIOES: Regiao[] = [
  'BAIXADA', 'ZONA_OESTE', 'ZONA_NORTE', 'ZONA_SUL', 'CENTRO', 'LESTE',
  'COSTA_VERDE', 'SERRANA', 'LAGOS', 'SUL_FLUMINENSE', 'NORTE_FLUMINENSE', 'OUTRAS',
]

export const REGIAO_LABEL: Record<Regiao, string> = {
  BAIXADA: 'Baixada Fluminense',
  ZONA_OESTE: 'Rio · Zona Oeste',
  ZONA_NORTE: 'Rio · Zona Norte',
  ZONA_SUL: 'Rio · Zona Sul',
  CENTRO: 'Rio · Centro',
  LESTE: 'Niterói, São Gonçalo e Leste',
  COSTA_VERDE: 'Costa Verde',
  SERRANA: 'Região Serrana',
  LAGOS: 'Região dos Lagos',
  SUL_FLUMINENSE: 'Sul Fluminense',
  NORTE_FLUMINENSE: 'Norte e Noroeste',
  OUTRAS: 'Sem região identificada',
}

/** Marca "é o Rio" — não é região: manda a leitura para os bairros. */
const RIO = '__RIO'
type Chave = Regiao | typeof RIO

const MUNICIPIOS: [Chave, string[]][] = [
  [RIO, ['RIO DE JANEIRO', 'RIO', 'RJ', 'CAPITAL']],
  ['BAIXADA', [
    'NOVA IGUACU', 'DUQUE DE CAXIAS', 'CAXIAS', 'BELFORD ROXO', 'SAO JOAO DE MERITI', 'S JOAO DE MERITI',
    'MERITI', 'NILOPOLIS', 'MESQUITA', 'QUEIMADOS', 'JAPERI', 'MAGE', 'GUAPIMIRIM', 'SEROPEDICA',
    'ITAGUAI', 'PARACAMBI',
    // Bairro, não município: entra aqui só para ganhar de "CAMPOS" (Campos dos Goytacazes).
    'CAMPOS ELISEOS',
  ]],
  ['LESTE', [
    'NITEROI', 'SAO GONCALO', 'S GONCALO', 'ITABORAI', 'MARICA', 'TANGUA', 'RIO BONITO',
    'CACHOEIRAS DE MACACU', 'SILVA JARDIM',
  ]],
  ['COSTA_VERDE', ['MANGARATIBA', 'ANGRA DOS REIS', 'ANGRA', 'PARATY']],
  ['SERRANA', [
    'PETROPOLIS', 'TERESOPOLIS', 'NOVA FRIBURGO', 'FRIBURGO', 'TRES RIOS', 'AREAL', 'SAPUCAIA',
    'COMENDADOR LEVY GASPARIAN', 'SAO JOSE DO VALE DO RIO PRETO', 'SUMIDOURO', 'CARMO', 'CORDEIRO',
    'BOM JARDIM', 'CANTAGALO', 'DUAS BARRAS', 'MIGUEL PEREIRA', 'PATY DO ALFERES',
  ]],
  ['LAGOS', [
    'CABO FRIO', 'ARMACAO DOS BUZIOS', 'BUZIOS', 'ARRAIAL DO CABO', 'ARARUAMA', 'SAO PEDRO DA ALDEIA',
    'IGUABA GRANDE', 'IGUABA', 'SAQUAREMA', 'RIO DAS OSTRAS', 'CASIMIRO DE ABREU',
  ]],
  ['SUL_FLUMINENSE', [
    'VOLTA REDONDA', 'BARRA MANSA', 'RESENDE', 'ITATIAIA', 'PORTO REAL', 'QUATIS', 'BARRA DO PIRAI',
    'PIRAI', 'VALENCA', 'VASSOURAS', 'RIO CLARO', 'PINHEIRAL', 'MENDES', 'ENGENHEIRO PAULO DE FRONTIN',
    'RIO DAS FLORES',
  ]],
  ['NORTE_FLUMINENSE', [
    'CAMPOS DOS GOYTACAZES', 'CAMPOS', 'MACAE', 'SAO JOAO DA BARRA', 'QUISSAMA', 'CARAPEBUS',
    'CONCEICAO DE MACABU', 'SAO FIDELIS', 'CAMBUCI', 'ITAPERUNA', 'BOM JESUS DO ITABAPOANA',
    'SANTO ANTONIO DE PADUA', 'MIRACEMA', 'NATIVIDADE', 'PORCIUNCULA', 'VARRE SAI', 'LAJE DO MURIAE',
    'SAO FRANCISCO DE ITABAPOANA', 'SAO JOSE DE UBA', 'ITALVA', 'CARDOSO MOREIRA', 'APERIBE',
  ]],
]

const BAIRROS: [Regiao, string[]][] = [
  // Bairros da Baixada que costumam vir sozinhos, sem o município na frente.
  ['BAIXADA', [
    'BAIXADA', 'AUSTIN', 'COMENDADOR SOARES', 'CABUCU', 'POSSE', 'MIGUEL COUTO', 'VILA DE CAVA',
    'TINGUA', 'ADRIANOPOLIS', 'JARDIM PRIMAVERA', 'IMBARIE', 'CAMPOS ELISEOS', 'SARACURUNA', 'XEREM',
    'PARADA ANGELICA', 'SANTA CRUZ DA SERRA', 'JARDIM GRAMACHO', 'GRAMACHO', 'VILAR DOS TELES',
    'COELHO DA ROCHA', 'LOTE XV', 'HELIOPOLIS', 'CHATUBA', 'EDSON PASSOS', 'OLINDA', 'PIABETA',
    'INHOMIRIM', 'FRAGOSO', 'CENTENARIO', 'PILAR', 'CAMPO ALEGRE', 'ENGENHEIRO PEDREIRA',
  ]],
  ['ZONA_OESTE', [
    'ZONA OESTE', 'CAMPO GRANDE', 'SANTA CRUZ', 'BANGU', 'REALENGO', 'PADRE MIGUEL', 'SENADOR CAMARA',
    'SENADOR VASCONCELOS', 'GUARATIBA', 'PEDRA DE GUARATIBA', 'BARRA DE GUARATIBA', 'SEPETIBA',
    'PACIENCIA', 'COSMOS', 'INHOAIBA', 'SANTISSIMO', 'CAMPO DOS AFONSOS', 'MAGALHAES BASTOS',
    'VILA MILITAR', 'DEODORO', 'SULACAP', 'JACAREPAGUA', 'TAQUARA', 'TANQUE', 'PRACA SECA',
    'FREGUESIA', 'PECHINCHA', 'CURICICA', 'ANIL', 'GARDENIA AZUL', 'CIDADE DE DEUS', 'RIO DAS PEDRAS',
    'BARRA DA TIJUCA', 'RECREIO', 'VARGEM GRANDE', 'VARGEM PEQUENA', 'CAMORIM', 'GRUMARI', 'JOA',
    'ITANHANGA', 'JARDIM SULACAP',
  ]],
  ['ZONA_NORTE', [
    'ZONA NORTE', 'PENHA', 'OLARIA', 'RAMOS', 'BONSUCESSO', 'MANGUINHOS', 'BENFICA', 'HIGIENOPOLIS',
    'DEL CASTILHO', 'MARIA DA GRACA', 'INHAUMA', 'ENGENHO DE DENTRO', 'ENGENHO NOVO', 'MEIER',
    'TODOS OS SANTOS', 'PIEDADE', 'ABOLICAO', 'CACHAMBI', 'LINS', 'JACAREZINHO', 'RIACHUELO',
    'SAO FRANCISCO XAVIER', 'SAMPAIO', 'MADUREIRA', 'CASCADURA', 'BENTO RIBEIRO', 'MARECHAL HERMES',
    'OSWALDO CRUZ', 'VAZ LOBO', 'TURIACU', 'ROCHA MIRANDA', 'HONORIO GURGEL', 'COLEGIO', 'IRAJA',
    'VICENTE DE CARVALHO', 'VISTA ALEGRE', 'VILA KOSMOS', 'BRAZ DE PINA', 'CORDOVIL',
    'PARADA DE LUCAS', 'VIGARIO GERAL', 'PAVUNA', 'ANCHIETA', 'RICARDO DE ALBUQUERQUE', 'GUADALUPE',
    'COSTA BARROS', 'ACARI', 'BARROS FILHO', 'PARQUE COLUMBIA', 'ILHA DO GOVERNADOR', 'GALEAO',
    'JARDIM GUANABARA', 'PORTUGUESA', 'COCOTA', 'BANCARIOS', 'TAUA', 'TIJUCA', 'ALTO DA BOA VISTA',
    'ANDARAI', 'GRAJAU', 'VILA ISABEL', 'MARACANA', 'PRACA DA BANDEIRA', 'ROCHA', 'JACARE',
  ]],
  ['ZONA_SUL', [
    'ZONA SUL', 'COPACABANA', 'LEME', 'IPANEMA', 'LEBLON', 'GAVEA', 'JARDIM BOTANICO', 'LAGOA',
    'HUMAITA', 'BOTAFOGO', 'URCA', 'FLAMENGO', 'LARANJEIRAS', 'CATETE', 'GLORIA', 'COSME VELHO',
    'SAO CONRADO', 'VIDIGAL', 'ROCINHA',
  ]],
  ['CENTRO', [
    'LAPA', 'GAMBOA', 'SAUDE', 'SANTO CRISTO', 'SAO CRISTOVAO', 'CAJU', 'CIDADE NOVA',
    'ESTACIO', 'CATUMBI', 'RIO COMPRIDO', 'SANTA TERESA', 'PRACA MAUA', 'CASTELO', 'CINELANDIA',
  ]],
  // Bairros que identificam o Leste sem precisar do município.
  ['LESTE', ['ICARAI', 'PIRATININGA', 'ITAIPU', 'CHARITAS', 'INGA', 'ALCANTARA', 'NEVES', 'JARDIM CATARINA']],
]

// "CENTRO" sozinho não diz nada: quase toda cidade da Baixada tem o seu, e é assim que a OM
// costuma vir. Só vale como Centro do Rio quando o município está escrito ("RIO - CENTRO").
const BAIRROS_SO_COM_RIO: [Chave, string[]][] = [['CENTRO', ['CENTRO']]]

/** Texto pronto para casar por palavra inteira: sem acento, maiúsculo, pontuação virando espaço. */
function chave(s: string | null | undefined): string {
  return normalizar(s).replace(/[^A-Z0-9]+/g, ' ').trim()
}

/** Do mais longo para o mais curto: "RIO BONITO" ganha de "RIO", "SANTA CRUZ DA SERRA" de "SANTA CRUZ". */
function tabela(pares: [Chave, string[]][]): [string, Chave][] {
  return pares
    .flatMap(([r, nomes]) => nomes.map(n => [chave(n), r] as [string, Chave]))
    .sort((a, b) => b[0].length - a[0].length)
}

const TABELA_MUNICIPIOS = tabela(MUNICIPIOS)
const TABELA_BAIRROS = tabela(BAIRROS as [Chave, string[]][])
const TABELA_BAIRROS_RIO = tabela([...BAIRROS_SO_COM_RIO, ...(BAIRROS as [Chave, string[]][])])

function achar(texto: string, tab: [string, Chave][]): Chave | null {
  for (const [nome, r] of tab) if (texto.includes(` ${nome} `)) return r
  return null
}

// O mesmo local se repete às centenas no planejamento; a leitura de cada texto distinto
// é feita uma vez só.
const cache = new Map<string, Regiao>()

/** A macrorregião de um `local`. Texto vazio ou desconhecido → OUTRAS. */
export function regiaoDe(local: string | null | undefined): Regiao {
  const k = chave(local)
  if (!k) return 'OUTRAS'
  const memo = cache.get(k)
  if (memo) return memo
  const texto = ` ${k} `
  const mun = achar(texto, TABELA_MUNICIPIOS)
  const bairros = mun === RIO ? TABELA_BAIRROS_RIO : TABELA_BAIRROS
  const r = mun && mun !== RIO ? mun : (achar(texto, bairros) as Regiao | null) ?? 'OUTRAS'
  cache.set(k, r)
  return r
}
