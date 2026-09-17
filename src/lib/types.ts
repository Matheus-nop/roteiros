export type Status =
  | 'FILA' | 'AGUARDANDO_TRIAGEM' | 'EM_ANALISE' | 'PRONTO_PARA_PLANEJAR' | 'ENCAMINHADO'
  | 'AGUARDANDO_ROTEIRIZACAO' | 'PLANEJADO' | 'ROTEIRIZADO'
  | 'AGUARDANDO_SAIDA' | 'EM_DESLOCAMENTO'
  | 'FINALIZADO' | 'PENDENTE' | 'REAGENDADO' | 'CANCELADO'

export type Tipo =
  | 'ENTREGA' | 'TROCA' | 'RETORNO' | 'RETORNO AO CLIENTE' | 'LOCACAO'
  | 'MANUTENÇÃO' | 'RETIRADA' | 'DEVOLUÇÃO'
  | 'RETIRADA PARA ORÇAMENTO' | 'TREINAMENTO' | 'ASSINATURA' | 'SOMENTE ASSINATURA' | 'IDENTIFICAÇÃO'

export type StatusSeparacao = 'NAO_SEPARADO' | 'EM_SEPARACAO' | 'SEPARADO'

export type Conferencia = 'NAO_CONFERIDO' | 'OK' | 'DIVERGENTE'
export type StatusTreinamento = 'AGENDADO' | 'REALIZADO' | 'CANCELADO'
export type Prioridade = 'NORMAL' | 'ALTA' | 'URGENTE' | 'CRÍTICA'

export type Papel = 'ADMIN' | 'PCM' | 'COMERCIAL' | 'EXPEDICAO' | 'TECNICO'

export interface Tecnico {
  id: string
  nome: string
  veiculo_padrao: string | null
  ativo: boolean
  cor: string | null
  created_at?: string
}

export interface Veiculo {
  id: string
  nome: string
  placa: string | null
  ativo: boolean
}

export interface Cliente {
  id: string
  nome: string
  apelidos: string[]
  /** Nasceu de um nome digitado no lançamento, não de um cadastro feito à mão (0008). */
  criado_automaticamente?: boolean
}

export interface Equipamento {
  id: string
  nome: string
  patrimonio: string | null
  controlado_por_quantidade: boolean
  unidade: string | null
  /** Nasceu de um nome digitado no lançamento, não de um cadastro feito à mão (0008). */
  criado_automaticamente?: boolean
}

export interface Expedidor {
  id: string
  nome: string
  ativo: boolean
}

export interface Demanda {
  id: string
  numero: number
  om: string | null
  cliente_id: string | null
  cliente_nome: string | null
  local: string | null
  tipo: Tipo
  equipamento_id: string | null
  equipamento_nome: string | null
  patrimonio: string | null
  quantidade: number
  unidade: string | null
  tecnico_id: string | null
  veiculo: string | null
  data_abertura: string | null
  data_planejada: string | null
  data_reagendada: string | null
  status: Status
  status_separacao: StatusSeparacao
  separado_por: string | null
  data_separacao: string | null
  /** O que o TÉCNICO viu ao carregar o caminhão (migração 0019). É a segunda
   *  vista sobre a mesma carga: quem separa não confere o próprio trabalho. */
  conferencia: Conferencia
  conferido_por: string | null
  conferido_em: string | null
  /** O que o técnico apontou. Só existe quando conferencia = 'DIVERGENTE' —
   *  o banco recusa divergência sem motivo escrito. */
  divergencia: string | null
  ordem_parada: number | null
  origem: string | null
  prioridade?: Prioridade
  herdado_de_pendencia: boolean
  /** De onde a pendência veio. Preenchido pelo gatilho da 0011, no instante em
   *  que a demanda vira pendência — antes de o PCM reatribuir. Não é o plano
   *  atual: é onde a peça esteve carregada da última vez. */
  reagendado_de_tecnico_id?: string | null
  reagendado_de_veiculo?: string | null
  reagendado_de_data?: string | null
  observacao: string | null
  finalizado_em: string | null
  /** Quando virou pendência pela primeira vez — mede há quanto tempo se arrasta. */
  pendente_desde?: string | null
  /** Quando recebeu data nova pela última vez. */
  reagendado_em?: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface Historico {
  id: string
  demanda_id: string | null
  status_anterior: string | null
  status_novo: string | null
  alterado_por: string | null
  alterado_em: string
  snapshot: Partial<Demanda> | null
  acao: string | null
}

export interface Fechamento {
  id: string
  tipo: 'PRE_CARGA' | 'ROTEIRO'
  tecnico_id: string | null
  data: string
  demanda_ids: string[]
  fechado_por: string | null
  fechado_em: string
  estornado: boolean
}

export interface EtiquetaAvulsa {
  id?: string
  numero?: number
  tecnico: string | null; veiculo: string | null; cliente: string | null; local: string | null; tipo: string | null
  equipamento: string | null; patrimonio: string | null; os: string | null; observacao: string | null
  emitida_por?: string | null; emitida_em?: string
}

/**
 * Um treinamento agendado: a saída do instrutor + a turma que assistiu.
 *
 * É a unidade de trabalho do módulo, do mesmo jeito que a demanda é a da rota.
 * `demanda_id` aponta para a demanda TREINAMENTO que leva o técnico até lá — a
 * agenda é a dona, e o app mantém a demanda em dia (data, técnico, local).
 */
export interface Treinamento {
  id: string
  numero: number
  cliente_id: string | null
  cliente_nome: string | null
  /** A LOCALIDADE, que agrupa o planejamento por região ("MAGÉ - PIABETÁ"). */
  local: string | null
  /** O endereço de chegada: rua, número, portão, referência (0018). */
  endereco: string | null
  /** Quem o técnico procura ao chegar, e o telefone dele (0018). */
  contato_nome: string | null
  contato_telefone: string | null
  tema: string
  data: string
  hora_inicio: string
  hora_fim: string
  /** Coluna GERADA no banco (0016), em horas. Nunca se escreve nela. */
  carga_horaria: number
  /** Tópicos cobertos na aula (0017). Saem em lista no certificado, abaixo do tema. */
  conteudo: string[]
  tecnico_id: string | null
  demanda_id: string | null
  status: StatusTreinamento
  observacao: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

/** A pessoa do cliente que assiste. Cadastro, não texto solto: o mesmo encarregado
 *  volta em três treinamentos e o nome dele tem que sair igual nos três certificados. */
export interface Participante {
  id: string
  nome: string
  /** CPF, só dígitos. */
  documento: string | null
  cliente_id: string | null
  cargo: string | null
  /** Nasceu de um nome digitado na lista de presença, não de um cadastro feito à mão. */
  criado_automaticamente?: boolean
  created_at?: string
}

/** Quem esteve em qual treinamento. É desta linha que sai o certificado. */
export interface Presenca {
  id: string
  treinamento_id: string
  participante_id: string
  presente: boolean
  certificado_em: string | null
  created_at?: string
}

export interface Perfil {
  id: string
  nome: string | null
  email: string | null
  papel: Papel
  tecnico_id: string | null
}

export interface Usuario {
  id: string
  email: string
  perfil: Perfil
  /** true quando não existe linha em `perfis` para este usuário: sem papel, sem permissões. */
  semPerfil?: boolean
}

export type NovaDemanda = Omit<
  Demanda,
  'id' | 'numero' | 'created_at' | 'updated_at' | 'status' | 'status_separacao' | 'herdado_de_pendencia'
    | 'finalizado_em' | 'created_by' | 'separado_por' | 'data_separacao' | 'ordem_parada'
    // Nascem do padrão do banco (0019), como a separação: demanda nova não
    // chega conferida.
    | 'conferencia' | 'conferido_por' | 'conferido_em' | 'divergencia'
> & Partial<Pick<Demanda, 'status' | 'status_separacao' | 'herdado_de_pendencia' | 'origem' | 'ordem_parada'>>

export type NovoTreinamento = Omit<Treinamento, 'id' | 'numero' | 'carga_horaria' | 'created_at' | 'updated_at' | 'created_by' | 'status' | 'demanda_id'>
  & Partial<Pick<Treinamento, 'status' | 'demanda_id'>>

/** O retrato de um roteiro fechado. O formato vive em `lib/arquivo.ts`. */
export type { RoteiroArquivado, ParadaArquivada, ItemArquivado, Desfecho } from './arquivo'
