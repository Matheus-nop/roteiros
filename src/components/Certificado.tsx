// Certificado de participação — o modelo do Canva como fundo, o app escrevendo
// por cima só o que muda.
//
// POR QUE ASSIM
//
// O certificado já existia, desenhado no Canva, e era preenchido à mão: alguém
// digitava nome, empresa, tema, carga horária e os tópicos, um participante por
// vez, e exportava. O desenho é bom e é o que o cliente já reconhece — o que não
// presta é a digitação.
//
// Então o desenho continua sendo o do Canva (`public/certificado/modelo.png`,
// exportado a 2000×1414, que é A4 paisagem exato) e o app escreve por cima os
// sete campos que variam. Nada é digitado duas vezes, e o papel sai igual.
//
// AS COORDENADAS SÃO MEDIDAS, NÃO CHUTADAS
//
// Cada número de `CAMPOS` saiu de medir os pixels do modelo original antes de
// apagar o texto dele: onde a linha começava, onde terminava, e a altura das
// maiúsculas. Depois a página foi renderizada e comparada com o original pixel a
// pixel, e os números foram corrigidos até o texto do app cair em cima do texto
// que estava lá. Hoje as linhas batem dentro de 1mm.
//
// A fonte é Montserrat, confirmada contra o próprio modelo: a linha fixa
// "CONCLUIU COM APROVEITAMENTO…", que continua sendo parte da imagem, bate com
// Montserrat itálico 600 com 0,3% de diferença de largura. É por isso que o
// texto do app encosta no texto da imagem sem denunciar a emenda.
//
// UMA CORREÇÃO DELIBERADA: no modelo original, o nome e a empresa estavam 22px
// à direita do meio da página, enquanto todo o resto — inclusive a linha fixa
// logo abaixo — está centrado. Era um escorregão do arquivo do Canva. Aqui eles
// vão no meio, junto com o resto.
//
// UMA ASSINATURA SÓ, A DO DIRETOR. A arte trazia duas rubricas digitalizadas,
// e a do lado do técnico era de uma pessoa só — mas o instrutor muda de turma
// para turma, e o papel sairia com a letra de um sobre o nome de outro.
//
// Tirar a rubrica e deixar a régua vazia resolveria isso e criaria outro
// problema: régua em branco é convite para assinar, e aí o certificado só
// poderia ser entregue depois de caçar o técnico para assinar folha por folha —
// numa turma de vinte, vinte vezes. Quem emite é o escritório; quem deu a aula
// está na rua.
//
// Então o lado direito não é assinatura: é crédito. O nome de quem deu a aula e
// a função dele, sem régua. Quem assina o documento é o diretor, à esquerda,
// que é sempre a mesma pessoa e cuja rubrica continua na arte.
//
// TROCAR O MODELO: exporte de novo pelo Canva em PNG na proporção A4 paisagem,
// apague as linhas variáveis e substitua `modelo.png`. Se o desenho mudar de
// lugar, `CAMPOS` é o que se ajusta — e nada mais.
import { useMemo } from 'react'
import type { Participante, Tecnico, Treinamento } from '../lib/types'
import { cargaPorExtenso, dataPorExtenso, fmtCpf } from '../lib/treinamentos'

/** O modelo, em pixels — a régua de todas as contas daqui. */
const MODELO = { largura: 2000, altura: 1414 }
const pctX = (px: number) => `${(px / MODELO.largura) * 100}%`
const pctY = (px: number) => `${(px / MODELO.altura) * 100}%`

const NAVY = '#2e3660'
const CINZA = '#858585'
const QUASE_PRETO = '#12101b'
const FAMILIA = "'Montserrat Certificado', system-ui, sans-serif"

type Campo = {
  /** Topo e base das MAIÚSCULAS, em pixels do modelo. É o que ancora a linha. */
  capTopo: number; capBase: number
  /** x do meio da linha. 1000 é o meio da página; a assinatura da direita tem o dela. */
  centro: number
  /** Até onde a linha pode crescer antes de a fonte ter que diminuir. */
  larguraMax: number
  cor: string; peso: number; italico?: boolean
}

const CAMPOS: Record<string, Campo> = {
  /** Sem CPF, o nome fica exatamente onde estava no modelo do Canva. */
  nome:      { capTopo: 566,   capBase: 618,    centro: 1000, larguraMax: 1240, cor: NAVY,        peso: 700 },
  /**
   * Com CPF, o nome sobe 10px para abrir a terceira linha.
   *
   * O bloco nome + empresa do modelo é apertado: são 50px de branco entre o
   * CNPJ e o nome, e 36px entre a empresa e a frase fixa. Enfiar o CPF sem
   * mexer em nada encosta ele nas duas linhas vizinhas — foi o que aconteceu na
   * primeira tentativa, e o papel fica com cara de remendo. Subir o nome usa o
   * branco que sobra acima dele, que não faz falta a ninguém.
   *
   * Quem não tem CPF cadastrado não paga por isso: cai na linha de cima, e o
   * certificado sai idêntico ao modelo original.
   */
  nomeComCpf: { capTopo: 556,  capBase: 608,    centro: 1000, larguraMax: 1240, cor: NAVY,        peso: 700 },
  cpf:       { capTopo: 624,   capBase: 636.5,  centro: 1000, larguraMax: 1240, cor: CINZA,       peso: 500 },
  empresa:   { capTopo: 651.05, capBase: 668,   centro: 1000, larguraMax: 1240, cor: NAVY,        peso: 700 },
  tema:      { capTopo: 743.87, capBase: 761,   centro: 1000, larguraMax: 1240, cor: QUASE_PRETO, peso: 700, italico: true },
  carga:     { capTopo: 783,   capBase: 800,    centro: 1000, larguraMax: 1240, cor: CINZA,       peso: 600, italico: true },
  instrutor: { capTopo: 1240,  capBase: 1255,   centro: 1276, larguraMax: 440,  cor: NAVY,        peso: 700 },
  data:      { capTopo: 1310,  capBase: 1326,   centro: 1000, larguraMax: 1000, cor: NAVY,        peso: 500 },
}

/** Os tópicos: alinhados à esquerda, com o passo medido entre as linhas do modelo. */
const LISTA = { x: 521, capTopo: 870, passo: 39.75, capAltura: 17.35, larguraMax: 880, base: 1105 }

/** Em Montserrat a maiúscula ocupa 0,7 do corpo da fonte. */
const CORPO = 0.7
/**
 * O modelo do Canva tem as letras 2% mais juntas que o padrão da Montserrat —
 * medido comparando a renderização com a arte original, linha por linha. Sem
 * este aperto o texto do app sai um pouco mais largo que o texto que já está na
 * imagem, e as duas coisas aparecem lado a lado na mesma folha.
 */
const APERTO = -0.02

/**
 * Largura que este texto teria, em pixels do modelo.
 *
 * Existe por um caso que aparece na segunda semana de uso e não na primeira:
 * "MARIA DE FÁTIMA GONÇALVES DE OLIVEIRA SANTOS" no tamanho do nome não cabe na
 * folha — sai cortado nas duas pontas, e ninguém conferiu porque o do Glauco
 * tinha ficado bom. Medir antes é o que permite diminuir a fonte só de quem
 * precisa, em vez de encolher o nome de todo mundo por precaução.
 *
 * Usa o mesmo motor que vai desenhar o texto, então a conta é a de verdade. Se
 * o canvas não estiver disponível, devolve 0 e nada é encolhido — o pior caso
 * volta a ser o de antes, não um pior.
 */
let pincel: CanvasRenderingContext2D | null | undefined
function larguraDoTexto(texto: string, c: Campo, capAltura: number): number {
  if (pincel === undefined) pincel = document.createElement('canvas').getContext('2d')
  if (!pincel) return 0
  const corpo = capAltura / CORPO
  pincel.font = `${c.italico ? 'italic ' : ''}${c.peso} ${corpo}px ${FAMILIA}`
  // O mesmo aperto de -0,02em do CSS: sem isto a conta de "cabe?" seria feita
  // num texto mais largo do que o que vai ser desenhado.
  return pincel.measureText(texto).width - corpo * -APERTO * texto.length
}

/** A altura de maiúscula que faz o texto caber — nunca maior que a do modelo. */
function capQueCabe(texto: string, c: Campo): number {
  const cap = c.capBase - c.capTopo
  const largura = larguraDoTexto(texto, c, cap)
  if (!largura || largura <= c.larguraMax) return cap
  return cap * (c.larguraMax / largura)
}

/**
 * Posiciona a linha pela FAIXA DAS MAIÚSCULAS medida no modelo e centra o texto
 * dentro dela. Assim a base do texto cai onde caía no original sem depender de a
 * fonte ter exatamente a métrica que a gente supôs — e uma linha que precisou
 * encolher continua apoiada na mesma base, em vez de subir.
 */
function estiloDaLinha(c: Campo, texto: string): React.CSSProperties {
  const cap = capQueCabe(texto, c)
  const folga = cap * 0.55
  return {
    position: 'absolute',
    left: pctX(c.centro),
    transform: 'translateX(-50%)',
    top: pctY(c.capBase - cap - folga),
    height: pctY(cap + folga * 2),
    fontSize: `${((cap / CORPO) / MODELO.altura) * 210}mm`,
    fontWeight: c.peso,
    fontStyle: c.italico ? 'italic' : 'normal',
    color: c.cor,
  }
}

const CSS = `
.cert-folha{position:relative;width:297mm;height:210mm;overflow:hidden;
  background:#fff center/100% 100% no-repeat url('/certificado/modelo.png');
  break-after:page;page-break-after:always}
.cert-folha:last-child{break-after:auto;page-break-after:auto}
.cert-txt{display:flex;align-items:center;justify-content:center;line-height:1;white-space:nowrap;
  font-family:${FAMILIA};letter-spacing:${APERTO}em}
@media print{@page{size:A4 landscape;margin:0}
  .cert-folha{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`

export function Certificados({ treinamento, instrutor, participantes }: {
  treinamento: Treinamento
  instrutor: Tecnico | undefined
  participantes: Participante[]
}) {
  const t = treinamento
  const topicos = t.conteudo ?? []

  // Mais tópicos do que a faixa comporta: encolhe o conjunto em vez de cortar a
  // lista. Certificado com o último item faltando é pior que certificado com a
  // letra um pouco menor — e quem confere o papel não sabe que faltou.
  const escalaLista = useMemo(() => {
    if (topicos.length < 2) return 1
    const fim = LISTA.capTopo + (topicos.length - 1) * LISTA.passo + LISTA.capAltura
    return fim > LISTA.base ? (LISTA.base - LISTA.capTopo) / (fim - LISTA.capTopo) : 1
  }, [topicos.length])

  const campoLista: Campo = {
    capTopo: 0, capBase: LISTA.capAltura * escalaLista, centro: 0,
    larguraMax: LISTA.larguraMax, cor: CINZA, peso: 600, italico: true,
  }
  const capLista = Math.min(
    ...topicos.map(x => capQueCabe(`• ${x}`, campoLista)),
    LISTA.capAltura * escalaLista,
  )

  const linha = (chave: keyof typeof CAMPOS, texto: string) => (
    <div className="cert-txt" style={estiloDaLinha(CAMPOS[chave], texto)}>{texto}</div>
  )

  return (
    <div>
      <style>{CSS}</style>
      {participantes.map(p => (
        <section className="cert-folha" key={p.id}>
          {linha(p.documento ? 'nomeComCpf' : 'nome', p.nome)}
          {p.documento && linha('cpf', `CPF ${fmtCpf(p.documento)}`)}
          {linha('empresa', `DA EMPRESA:  ${t.cliente_nome ?? '—'}`)}
          {linha('tema', t.tema)}
          {linha('carga', `COM A CARGA HORÁRIA DE ${cargaPorExtenso(t.carga_horaria)}.`)}

          {topicos.map((topico, i) => (
            <div key={i} className="cert-txt" style={{
              position: 'absolute',
              left: pctX(LISTA.x),
              justifyContent: 'flex-start',
              top: pctY(LISTA.capTopo + i * LISTA.passo * escalaLista - capLista * 0.55),
              height: pctY(capLista * 2.1),
              fontSize: `${((capLista / CORPO) / MODELO.altura) * 210}mm`,
              fontWeight: 600, fontStyle: 'italic', color: CINZA,
            }}>• {topico}</div>
          ))}

          {instrutor && linha('instrutor', instrutor.nome)}
          {linha('data', `RIO DE JANEIRO, ${dataPorExtenso(t.data)}`)}
        </section>
      ))}
    </div>
  )
}
