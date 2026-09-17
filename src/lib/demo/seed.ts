// Dados fictícios para o modo demonstração (sem Supabase).
import type { Cliente, Demanda, Equipamento, Expedidor, Participante, Presenca, Tecnico, Treinamento, Veiculo, Tipo, Status } from '../types'
import { addDias, hojeISO } from '../format'

let seq = 1
const uuid = () => {
  // uuid v4 determinístico o bastante para demo
  const h = (n: number) => Math.floor(Math.random() * 16 ** n).toString(16).padStart(n, '0')
  return `${h(8)}-${h(4)}-4${h(3)}-a${h(3)}-${h(12)}`
}

export const veiculosSeed: Veiculo[] = [
  ['FIORINO - SRT9D86', 'SRT9D86'], ['KIA - TTB0J08', 'TTB0J08'], ['SAVEIRO - TZG3B34', 'TZG3B34'],
  ['KIA - TTZ7I26', 'TTZ7I26'], ['FIORINO - SRT9D65', 'SRT9D65'], ['SCUDO - TTP8H79', 'TTP8H79'],
  ['STRADA - SRT9D55', 'SRT9D55'], ['KIA - TTX1H09', 'TTX1H09'],
].map(([nome, placa]) => ({ id: uuid(), nome, placa, ativo: true }))

export const tecnicosSeed: Tecnico[] = [
  ['Victor', 'FIORINO - SRT9D86', '#2563eb'], ['Igor', 'KIA - TTB0J08', '#0d9488'],
  ['Alexandre', 'SAVEIRO - TZG3B34', '#7c3aed'], ['Rafael', 'KIA - TTZ7I26', '#dc2626'],
  ['Leonardo Alves', 'FIORINO - SRT9D65', '#d97706'], ['Luiz Henrique', 'SCUDO - TTP8H79', '#059669'],
  ['Leonardo Oliveira', 'STRADA - SRT9D55', '#db2777'], ['Douglas', 'KIA - TTX1H09', '#4b5563'],
].map(([nome, v, cor]) => ({ id: uuid(), nome, veiculo_padrao: v, ativo: true, cor }))

export const expedidoresSeed: Expedidor[] = ['Silvio', 'Adonai', 'Hugo', 'Arthur', 'Outros']
  .map(nome => ({ id: uuid(), nome, ativo: true }))

export const clientesSeed: Cliente[] = [
  // Apelido é variação de escrita do MESMO cliente. ÁGUAS DO RIO e AEGEA são clientes
  // diferentes, ainda que do mesmo grupo.
  ['ÁGUAS DO RIO', ['AGUAS DO RIO']],
  ['AEGEA SANEAMENTO', ['AEGEA']],
  ['CONSTRUTORA AFFONSECA', ['AFFONSECA', 'LYTORÂNEA']],
  ['R2X', ['R2X ENGENHARIA']],
  ['JC MORAES', []],
  ['CONSÓRCIO SANEAMENTO MINEIRO', ['CSM']],
  ['CONSTRUTORA RJL2', ['RJL2']],
].map(([nome, apelidos]) => ({ id: uuid(), nome: nome as string, apelidos: apelidos as string[] }))

const equipBase: [string, boolean, string | null][] = [
  ['GERADOR DE ENERGIA 3,5KVA', false, null], ['GERADOR DE ENERGIA 7,5KVA', false, null],
  ['COMPACTADOR DE SOLO', false, null], ['BOMBA SUBMERSA 2"', false, null], ['BOMBA SUBMERSA 3"', false, null],
  ['MARTELETE ROMPEDOR 30KG', false, null], ['PLACA VIBRATÓRIA', false, null], ['CORTADORA DE PISO', false, null],
  ['BETONEIRA 400L', false, null], ['ANDAIME TUBULAR', true, 'METRO'], ['ESCORA METÁLICA', true, 'UNIDADE'],
  ['MANGOTE 3"', true, 'METRO'], ['TAPUME METÁLICO', true, 'UNIDADE'], ['ROMPEDOR PNEUMÁTICO', false, null],
  ['COMPRESSOR DE AR 175PCM', false, null],
]
export const equipamentosSeed: Equipamento[] = []
for (const [nome, qtd, un] of equipBase) {
  if (qtd) {
    equipamentosSeed.push({ id: uuid(), nome, patrimonio: null, controlado_por_quantidade: true, unidade: un })
  } else {
    for (let i = 0; i < 3; i++) {
      equipamentosSeed.push({ id: uuid(), nome, patrimonio: String(1000 + Math.floor(Math.random() * 8999)), controlado_por_quantidade: false, unidade: 'UNIDADE' })
    }
  }
}

const locais = [
  'PENHA - ZONA NORTE', 'NOVA IGUAÇU - CENTRO', 'DUQUE DE CAXIAS - JD. PRIMAVERA', 'BELFORD ROXO - LOTE XV',
  'SÃO JOÃO DE MERITI - VILAR DOS TELES', 'MESQUITA - CHATUBA', 'QUEIMADOS - CENTRO', 'CAMPO GRANDE - ZONA OESTE',
  'BANGU - ZONA OESTE', 'NILÓPOLIS - CENTRO', 'MAGÉ - PIABETÁ', 'RIO - MADUREIRA',
]
const oms = ['1268-03/26', '001380-01/26', '35521', '2206/25', '1290-03/26', '35540', '0451-02/26', '35577', '1301-03/26', '0987/26', '2218/25', '35590']

function pick<T>(arr: T[], i: number): T { return arr[i % arr.length] }

export function gerarDemandasSeed(): Demanda[] {
  const hoje = hojeISO()
  const amanha = addDias(hoje, 1)
  const ontem = addDias(hoje, -1)
  const agora = new Date().toISOString()
  const out: Demanda[] = []

  const tiposSep: Tipo[] = ['ENTREGA', 'TROCA', 'RETORNO', 'LOCACAO', 'ENTREGA', 'ENTREGA', 'RETORNO AO CLIENTE']
  const tiposOutros: Tipo[] = ['MANUTENÇÃO', 'RETIRADA', 'DEVOLUÇÃO']

  const nova = (i: number, p: Partial<Demanda>): Demanda => {
    const eq = pick(equipamentosSeed, i * 7 + 3)
    const cli = pick(clientesSeed, i)
    const tipo = p.tipo ?? (i % 5 === 4 ? pick(tiposOutros, i) : pick(tiposSep, i))
    return {
      id: uuid(),
      numero: seq++,
      om: pick(oms, i * 3 + 1),
      cliente_id: cli.id,
      cliente_nome: cli.nome,
      local: pick(locais, i * 5 + 2),
      tipo,
      equipamento_id: eq.id,
      equipamento_nome: eq.nome,
      patrimonio: eq.patrimonio,
      conferencia: 'NAO_CONFERIDO',
      conferido_por: null,
      conferido_em: null,
      divergencia: null,
      quantidade: eq.controlado_por_quantidade ? 10 + (i % 6) * 5 : 1,
      unidade: eq.unidade,
      tecnico_id: null,
      veiculo: null,
      data_abertura: addDias(hoje, -(i % 9)),
      data_planejada: null,
      data_reagendada: null,
      status: 'FILA',
      status_separacao: 'NAO_SEPARADO',
      separado_por: null,
      data_separacao: null,
      ordem_parada: null,
      origem: 'COMERCIAL',
      herdado_de_pendencia: false,
      observacao: null,
      finalizado_em: null,
      created_at: agora,
      updated_at: agora,
      created_by: null,
      ...p,
    }
  }

  // Fila (várias etapas de triagem)
  const triagem: Status[] = ['FILA', 'FILA', 'AGUARDANDO_TRIAGEM', 'EM_ANALISE', 'PRONTO_PARA_PLANEJAR', 'ENCAMINHADO']
  for (let i = 0; i < 14; i++) out.push(nova(i, { status: pick(triagem, i) }))

  // Planejamento: alguns com técnico/data, alguns sem
  for (let i = 14; i < 26; i++) {
    const t = i % 3 === 0 ? null : pick(tecnicosSeed, i)
    out.push(nova(i, {
      status: i % 4 === 1 ? 'PLANEJADO' : 'AGUARDANDO_ROTEIRIZACAO',
      tecnico_id: t?.id ?? null,
      veiculo: t && i % 2 === 0 ? t.veiculo_padrao : null,
      data_planejada: t ? (i % 2 === 0 ? amanha : hoje) : null,
    }))
  }

  // Roteirizado hoje (separação parcial), por técnico, com ordem de parada
  const tecsHoje = [tecnicosSeed[0], tecnicosSeed[1], tecnicosSeed[5]]
  let n = 26
  for (const t of tecsHoje) {
    for (let k = 0; k < 5; k++, n++) {
      out.push(nova(n, {
        status: t === tecnicosSeed[5] ? 'EM_DESLOCAMENTO' : 'ROTEIRIZADO',
        tecnico_id: t.id,
        veiculo: t.veiculo_padrao,
        data_planejada: hoje,
        ordem_parada: (k + 1) * 10,
        status_separacao: k < 3 ? 'SEPARADO' : 'NAO_SEPARADO',
        separado_por: k < 3 ? pick(expedidoresSeed, k).nome : null,
        data_separacao: k < 3 ? hoje : null,
        tipo: pick(tiposSep, n),
      }))
    }
  }
  // Roteirizado amanhã (Alexandre)
  for (let k = 0; k < 4; k++, n++) {
    const t = tecnicosSeed[2]
    out.push(nova(n, { status: 'ROTEIRIZADO', tecnico_id: t.id, veiculo: t.veiculo_padrao, data_planejada: amanha, ordem_parada: (k + 1) * 10, tipo: pick(tiposSep, n) }))
  }
  // Pendências reagendadas (voltaram ao planejamento com data nova)
  for (let k = 0; k < 3; k++, n++) {
    const t = pick(tecnicosSeed, k + 3)
    out.push(nova(n, {
      status: 'AGUARDANDO_ROTEIRIZACAO', tecnico_id: t.id, data_planejada: addDias(hoje, 2 + k), data_reagendada: addDias(hoje, 2 + k),
      herdado_de_pendencia: true, observacao: 'Cliente sem responsável no local', tipo: pick(tiposSep, n),
    }))
  }
  // Finalizados (histórico)
  for (let k = 0; k < 8; k++, n++) {
    const t = pick(tecnicosSeed, k)
    out.push(nova(n, { status: 'FINALIZADO', tecnico_id: t.id, veiculo: t.veiculo_padrao, data_planejada: ontem, finalizado_em: new Date(Date.now() - 86400000).toISOString(), status_separacao: 'SEPARADO', separado_por: 'Silvio', tipo: pick(tiposSep, n) }))
  }
  out.push(nova(n++, { status: 'CANCELADO', observacao: 'Cancelado pelo cliente' }))
  return out
}

// ---------------------------------------------------------------------
// Treinamentos (0016)
// ---------------------------------------------------------------------
// Tema e o conteúdo programático que sai em lista no certificado (0017).
const temasSeed: [string, string[]][] = [
  ['OPERAÇÃO SEGURA DE MARTELO ROMPEDOR', [
    'INSTRUÇÃO DE OPERAÇÃO ANTES/DURANTE E APÓS O USO;',
    'MEDIDAS PREVENTIVAS;',
    "MEDIDAS DE SEGURANÇA E EPI'S;",
    'ARMAZENAGEM CORRETA;',
    'TRANSPORTE ADEQUADO.',
  ]],
  ['OPERAÇÃO E MANUTENÇÃO DE GERADOR DE ENERGIA', [
    'PARTIDA E PARADA SEGURA DO EQUIPAMENTO;',
    'ABASTECIMENTO E NÍVEL DE ÓLEO;',
    'ATERRAMENTO E LIGAÇÃO DE CARGAS;',
    "MEDIDAS DE SEGURANÇA E EPI'S;",
    'ARMAZENAGEM E TRANSPORTE.',
  ]],
  ['USO DE COMPACTADOR DE SOLO E PLACA VIBRATÓRIA', [
    'INSPEÇÃO ANTES DO USO;',
    'OPERAÇÃO EM TERRENO IRREGULAR;',
    'RISCOS DE VIBRAÇÃO E RUÍDO;',
    "MEDIDAS DE SEGURANÇA E EPI'S;",
    'ARMAZENAGEM CORRETA.',
  ]],
  ['MONTAGEM SEGURA DE ANDAIME TUBULAR', [
    'CONFERÊNCIA DAS PEÇAS E DO PISO;',
    'SEQUÊNCIA DE MONTAGEM E TRAVAMENTO;',
    'GUARDA-CORPO E RODAPÉ;',
    'TRABALHO EM ALTURA E CINTO DE SEGURANÇA;',
    'DESMONTAGEM E ARMAZENAGEM.',
  ]],
]

// Endereço de chegada e contato — o que a capa do técnico imprime (0018).
const contatosSeed: [string, string, string][] = [
  ['RUA JOSÉ DE ALVARENGA, 340 — entrar pelo portão 2, ao lado do almoxarifado', 'ENCARREGADO MARCOS', '(21) 98812-4470'],
  ['ESTRADA DO CANAL, KM 4 — canteiro da obra, procurar no contêiner azul', 'TÉCNICA DE SEGURANÇA PRISCILA', '(21) 99604-1128'],
  ['AV. GOVERNADOR ROBERTO SILVEIRA, 1200 — sala 3, 2º andar', 'MESTRE DE OBRAS JOÃO BATISTA', '(21) 3771-0042 / ramal 18'],
  ['RUA DAS PALMEIRAS, 77 — galpão dos fundos', 'ENCARREGADO SÉRGIO', '(21) 98140-2255'],
  ['ROD. WASHINGTON LUÍS, KM 12 — pátio de máquinas, falar na guarita antes', 'SUPERVISOR ANDRÉ', '(21) 99321-7788'],
]

const pessoasSeed = [
  ['ANDERSON LIMA DA SILVA', 'ENCARREGADO'], ['CARLOS EDUARDO MOTA', 'OPERADOR'],
  ['DENILSON ROCHA', 'PEDREIRO'], ['ELIANE FERREIRA COSTA', 'TÉCNICA DE SEGURANÇA'],
  ['FÁBIO NASCIMENTO', 'OPERADOR'], ['GILSON ALVES PEREIRA', 'MESTRE DE OBRAS'],
  ['HELENA MARTINS', 'ENGENHEIRA'], ['IVAN BATISTA SOUZA', 'AJUDANTE'],
]

/**
 * Turma fictícia para o modo demonstração.
 *
 * Os CPFs ficam VAZIOS de propósito: um CPF que passa no dígito verificador é o
 * CPF de alguém de verdade, e não se inventa documento de gente que existe nem
 * para demonstração. A tela funciona sem ele — o certificado sai sem o campo.
 */
export function gerarTreinamentosSeed(): { treinamentos: Treinamento[]; participantes: Participante[]; presencas: Presenca[] } {
  const hoje = hojeISO()
  const agora = new Date().toISOString()

  const participantes: Participante[] = pessoasSeed.map(([nome, cargo]) => ({
    id: uuid(), nome, documento: null, cliente_id: null, cargo, criado_automaticamente: true, created_at: agora,
  }))

  const plano: { dias: number; status: Treinamento['status']; turma: number }[] = [
    { dias: -21, status: 'REALIZADO', turma: 5 },
    { dias: -7, status: 'REALIZADO', turma: 3 },
    { dias: 0, status: 'AGENDADO', turma: 4 },
    { dias: 2, status: 'AGENDADO', turma: 2 },
    { dias: 11, status: 'AGENDADO', turma: 0 },
  ]

  const treinamentos: Treinamento[] = []
  const presencas: Presenca[] = []

  plano.forEach((x, i) => {
    const cli = pick(clientesSeed, i + 2)
    const t: Treinamento = {
      id: uuid(),
      numero: i + 1,
      cliente_id: cli.id,
      cliente_nome: cli.nome,
      local: pick(locais, i * 3 + 1),
      endereco: contatosSeed[i % contatosSeed.length][0],
      contato_nome: contatosSeed[i % contatosSeed.length][1],
      contato_telefone: contatosSeed[i % contatosSeed.length][2],
      tema: pick(temasSeed, i)[0],
      conteudo: pick(temasSeed, i)[1],
      data: addDias(hoje, x.dias),
      hora_inicio: i % 2 === 0 ? '09:00' : '14:00',
      hora_fim: i % 2 === 0 ? '11:00' : '16:30',
      carga_horaria: i % 2 === 0 ? 2 : 2.5,
      tecnico_id: pick(tecnicosSeed, i).id,
      demanda_id: null,
      status: x.status,
      observacao: null,
      created_at: agora,
      updated_at: agora,
      created_by: null,
    }
    treinamentos.push(t)
    for (let k = 0; k < x.turma; k++) {
      presencas.push({
        id: uuid(),
        treinamento_id: t.id,
        participante_id: pick(participantes, i * 3 + k).id,
        presente: true,
        certificado_em: x.status === 'REALIZADO' ? agora : null,
        created_at: new Date(Date.now() + k).toISOString(),
      })
    }
  })

  return { treinamentos, participantes, presencas }
}
