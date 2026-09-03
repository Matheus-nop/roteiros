import type { Status, Tipo, Papel } from './types'

// ---------------------------------------------------------------------
// Máquina de estados: o status determina em qual tela a demanda aparece.
// ---------------------------------------------------------------------

export const STATUS_FILA: Status[] = [
  'FILA', 'AGUARDANDO_TRIAGEM', 'EM_ANALISE', 'PRONTO_PARA_PLANEJAR', 'ENCAMINHADO',
]
export const TRIAGEM_ORDEM: Status[] = [
  'FILA', 'AGUARDANDO_TRIAGEM', 'EM_ANALISE', 'PRONTO_PARA_PLANEJAR', 'ENCAMINHADO',
]
export const STATUS_PLANEJAMENTO: Status[] = ['AGUARDANDO_ROTEIRIZACAO', 'PLANEJADO', 'ROTEIRIZADO']
export const STATUS_A_ROTEIRIZAR: Status[] = ['AGUARDANDO_ROTEIRIZACAO', 'PLANEJADO']
export const STATUS_EM_ROTA: Status[] = ['ROTEIRIZADO', 'AGUARDANDO_SAIDA', 'EM_DESLOCAMENTO']
export const STATUS_ARQUIVADOS: Status[] = ['FINALIZADO', 'CANCELADO']
export const STATUS_ATIVOS: Status[] = [
  ...STATUS_FILA, ...STATUS_PLANEJAMENTO, 'AGUARDANDO_SAIDA', 'EM_DESLOCAMENTO', 'PENDENTE', 'REAGENDADO',
]
export const TODOS_STATUS: Status[] = [
  ...STATUS_FILA, ...STATUS_PLANEJAMENTO, 'AGUARDANDO_SAIDA', 'EM_DESLOCAMENTO',
  'FINALIZADO', 'PENDENTE', 'REAGENDADO', 'CANCELADO',
]

export const TIPOS: Tipo[] = [
  'ENTREGA', 'TROCA', 'RETORNO', 'RETORNO AO CLIENTE', 'LOCACAO', 'MANUTENÇÃO', 'RETIRADA', 'DEVOLUÇÃO',
]
/** Tipos que passam pela separação/expedição. LOCACAO é tratada como ENTREGA. */
export const TIPOS_SEPARACAO: Tipo[] = ['ENTREGA', 'TROCA', 'RETORNO', 'RETORNO AO CLIENTE', 'LOCACAO']

export const separaNaExpedicao = (tipo: Tipo) => TIPOS_SEPARACAO.includes(tipo)

export const STATUS_LABEL: Record<Status, string> = {
  FILA: 'Fila',
  AGUARDANDO_TRIAGEM: 'Aguard. triagem',
  EM_ANALISE: 'Em análise',
  PRONTO_PARA_PLANEJAR: 'Pronto p/ planejar',
  ENCAMINHADO: 'Encaminhado',
  AGUARDANDO_ROTEIRIZACAO: 'Aguard. roteirização',
  PLANEJADO: 'Planejado',
  ROTEIRIZADO: 'Roteirizado',
  AGUARDANDO_SAIDA: 'Aguard. saída',
  EM_DESLOCAMENTO: 'Em deslocamento',
  FINALIZADO: 'Finalizado',
  PENDENTE: 'Pendente',
  REAGENDADO: 'Reagendado',
  CANCELADO: 'Cancelado',
}

/** Classe Tailwind da badge por status (tons discretos, corporativos). */
export const STATUS_TONE: Record<Status, string> = {
  FILA: 'bg-slate-100 text-slate-700 ring-slate-200',
  AGUARDANDO_TRIAGEM: 'bg-slate-100 text-slate-700 ring-slate-200',
  EM_ANALISE: 'bg-amber-50 text-amber-800 ring-amber-200',
  PRONTO_PARA_PLANEJAR: 'bg-sky-50 text-sky-800 ring-sky-200',
  ENCAMINHADO: 'bg-sky-50 text-sky-800 ring-sky-200',
  AGUARDANDO_ROTEIRIZACAO: 'bg-violet-50 text-violet-800 ring-violet-200',
  PLANEJADO: 'bg-violet-50 text-violet-800 ring-violet-200',
  ROTEIRIZADO: 'bg-blue-50 text-blue-800 ring-blue-200',
  AGUARDANDO_SAIDA: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
  EM_DESLOCAMENTO: 'bg-cyan-50 text-cyan-800 ring-cyan-200',
  FINALIZADO: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  PENDENTE: 'bg-orange-50 text-orange-800 ring-orange-200',
  REAGENDADO: 'bg-orange-50 text-orange-800 ring-orange-200',
  CANCELADO: 'bg-red-50 text-red-800 ring-red-200',
}

export function proximaTriagem(status: Status): Status | null {
  const i = TRIAGEM_ORDEM.indexOf(status)
  if (i < 0 || i === TRIAGEM_ORDEM.length - 1) return null
  return TRIAGEM_ORDEM[i + 1]
}

// ---------------------------------------------------------------------
// Permissões por papel (o front esconde; a RLS protege de verdade)
// ---------------------------------------------------------------------
export type Acao =
  | 'fila.lancar' | 'fila.triar' | 'fila.enviar_planejamento'
  | 'planejamento.editar' | 'planejamento.gerar_roteiro'
  | 'expedicao.separar' | 'expedicao.fechar'
  | 'roteiro.executar' | 'roteiro.editar'
  | 'pendencias.reagendar'
  | 'cadastros.editar' | 'usuarios.editar'
  | 'historico.restaurar'

const PERMISSOES: Record<Papel, Acao[] | 'todas'> = {
  ADMIN: 'todas',
  PCM: [
    'fila.lancar', 'fila.triar', 'fila.enviar_planejamento',
    'planejamento.editar', 'planejamento.gerar_roteiro',
    'expedicao.separar', 'expedicao.fechar',
    'roteiro.executar', 'roteiro.editar',
    'pendencias.reagendar', 'cadastros.editar', 'historico.restaurar',
  ],
  COMERCIAL: ['fila.lancar', 'fila.triar', 'fila.enviar_planejamento', 'pendencias.reagendar'],
  EXPEDICAO: ['expedicao.separar', 'expedicao.fechar'],
  TECNICO: ['roteiro.executar'],
}

export function pode(papel: Papel | undefined, acao: Acao): boolean {
  if (!papel) return false
  const p = PERMISSOES[papel]
  return p === 'todas' || p.includes(acao)
}

export const PAPEL_LABEL: Record<Papel, string> = {
  ADMIN: 'Administrador', PCM: 'PCM', COMERCIAL: 'Comercial', EXPEDICAO: 'Expedição', TECNICO: 'Técnico',
}
