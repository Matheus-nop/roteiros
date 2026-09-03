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
}

export interface Equipamento {
  id: string
  nome: string
  patrimonio: string | null
  controlado_por_quantidade: boolean
  unidade: string | null
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
  ordem_parada: number | null
  origem: string | null
  prioridade?: Prioridade
  herdado_de_pendencia: boolean
  observacao: string | null
  finalizado_em: string | null
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
> & Partial<Pick<Demanda, 'status' | 'status_separacao' | 'herdado_de_pendencia' | 'origem'>>
