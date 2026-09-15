// Agendar e remarcar treinamento.
//
// O formulário é curto de propósito: tema, cliente, local, dia, hora e instrutor.
// Carga horária não é campo — ela sai da hora (coluna gerada na 0016) e aparece
// calculada embaixo, para quem está marcando conferir antes de salvar.
import { useMemo, useState } from 'react'
import { CalendarClock, Info } from 'lucide-react'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { useClientesMaisUsados, useLocalidades, useTemasTreinamento, juntarSemRepetir } from '../hooks/useVocabulario'
import type { NovoTreinamento, Treinamento } from '../lib/types'
import { normalizar, hojeISO } from '../lib/format'
import { cargaPrevista, fmtCarga, fmtHora } from '../lib/treinamentos'
import { Botao, Campo, Input, Modal, Select } from './ui'
import { CampoSugestao } from './CampoSugestao'

type Form = {
  tema: string; cliente: string; local: string
  data: string; hora_inicio: string; hora_fim: string
  tecnico_id: string; observacao: string
}

const doTreinamento = (t: Treinamento | null, dataSugerida?: string): Form => ({
  tema: t?.tema ?? '',
  cliente: t?.cliente_nome ?? '',
  local: t?.local ?? '',
  data: t?.data ?? dataSugerida ?? hojeISO(),
  hora_inicio: fmtHora(t?.hora_inicio) || '09:00',
  hora_fim: fmtHora(t?.hora_fim) || '11:00',
  tecnico_id: t?.tecnico_id ?? '',
  observacao: t?.observacao ?? '',
})

export function ModalTreinamento({ aberto, treinamento, dataSugerida, onFechar }: {
  aberto: boolean
  /** `null` agenda um novo; com treinamento, edita aquele. */
  treinamento: Treinamento | null
  dataSugerida?: string
  onFechar(): void
}) {
  const { acoes, clientes, tecnicos } = useData()
  const { toast, erro } = useToast()
  const localidades = useLocalidades()
  const clientesUsados = useClientesMaisUsados()
  const temas = useTemasTreinamento()
  const [f, setF] = useState<Form>(() => doTreinamento(treinamento, dataSugerida))
  const [salvando, setSalvando] = useState(false)
  // Remonta o formulário quando o modal abre para outro treinamento (ou para um novo).
  const [chave, setChave] = useState(treinamento?.id ?? dataSugerida ?? '')
  const chaveAtual = treinamento?.id ?? dataSugerida ?? ''
  if (aberto && chave !== chaveAtual) { setChave(chaveAtual); setF(doTreinamento(treinamento, dataSugerida)) }

  const set = (k: keyof Form, v: string) => setF(x => ({ ...x, [k]: v }))

  const nomesCliente = useMemo(
    () => juntarSemRepetir(clientesUsados, clientes.map(c => c.nome), clientes.flatMap(c => c.apelidos ?? [])),
    [clientesUsados, clientes])

  const carga = cargaPrevista(f.hora_inicio, f.hora_fim)

  const montar = (): NovoTreinamento => {
    const n = normalizar(f.cliente)
    const cli = clientes.find(c => normalizar(c.nome) === n || (c.apelidos ?? []).some(a => normalizar(a) === n))
    return {
      tema: f.tema.trim().toUpperCase(),
      cliente_id: cli?.id ?? null,
      cliente_nome: cli?.nome ?? (f.cliente.trim().toUpperCase() || null),
      local: f.local.trim().toUpperCase() || null,
      data: f.data,
      hora_inicio: f.hora_inicio,
      hora_fim: f.hora_fim,
      tecnico_id: f.tecnico_id || null,
      observacao: f.observacao.trim() || null,
    }
  }

  const salvar = async () => {
    if (!f.tema.trim()) { toast('Informe o tema do treinamento.', 'erro'); return }
    if (!f.data) { toast('Informe a data.', 'erro'); return }
    if (carga <= 0) { toast('A hora de término precisa ser depois da de início.', 'erro'); return }
    setSalvando(true)
    try {
      if (treinamento) {
        await acoes.editarTreinamento(treinamento, montar())
        toast('Treinamento atualizado. A demanda do roteiro acompanhou a mudança.')
      } else {
        const { demanda } = await acoes.agendarTreinamento(montar())
        toast(demanda
          ? 'Treinamento agendado. Já está no planejamento como demanda de treinamento.'
          : 'Treinamento agendado — mas a demanda do roteiro não foi criada. Lance-a à mão no planejamento.',
          demanda ? 'ok' : 'erro')
      }
      onFechar()
    } catch (e) { erro(e) } finally { setSalvando(false) }
  }

  return (
    <Modal
      aberto={aberto} onFechar={onFechar}
      titulo={treinamento ? `Treinamento #${treinamento.numero}` : 'Agendar treinamento'}
      largura="max-w-3xl"
      rodape={<>
        <Botao onClick={onFechar}>Cancelar</Botao>
        <Botao variante="primario" onClick={salvar} disabled={salvando}>
          <CalendarClock size={14} />{salvando ? 'Salvando…' : treinamento ? 'Salvar' : 'Agendar'}
        </Botao>
      </>}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Campo rotulo="Tema do treinamento" className="col-span-2 md:col-span-4">
          <CampoSugestao valor={f.tema} onChange={v => set('tema', v)} sugestoes={temas}
            placeholder="OPERAÇÃO SEGURA DE MARTELO ROMPEDOR" />
        </Campo>
        <Campo rotulo="Cliente" className="col-span-2">
          <CampoSugestao valor={f.cliente} onChange={v => set('cliente', v)} sugestoes={nomesCliente} />
        </Campo>
        <Campo rotulo="Local" className="col-span-2">
          <CampoSugestao valor={f.local} onChange={v => set('local', v)} sugestoes={localidades} placeholder="comece a digitar: duque…" />
        </Campo>
        <Campo rotulo="Data"><Input type="date" value={f.data} onChange={e => set('data', e.target.value)} /></Campo>
        <Campo rotulo="Início"><Input type="time" value={f.hora_inicio} onChange={e => set('hora_inicio', e.target.value)} /></Campo>
        <Campo rotulo="Término"><Input type="time" value={f.hora_fim} onChange={e => set('hora_fim', e.target.value)} /></Campo>
        <Campo rotulo="Instrutor">
          <Select value={f.tecnico_id} onChange={e => set('tecnico_id', e.target.value)}>
            <option value="">A definir</option>
            {tecnicos.filter(t => t.ativo || t.id === f.tecnico_id).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </Select>
        </Campo>
        <Campo rotulo="Observação" className="col-span-2 md:col-span-4">
          <Input value={f.observacao} onChange={e => set('observacao', e.target.value)} placeholder="material necessário, contato no local…" />
        </Campo>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600 ring-1 ring-slate-200">
        <Info size={14} className="shrink-0 text-slate-400" />
        <span>
          Carga horária: <b className="text-slate-800">{carga > 0 ? fmtCarga(carga) : '—'}</b>
          {' '}(calculada pelo horário — é ela que vai no certificado).
        </span>
        <span className="text-slate-400">·</span>
        <span>
          {treinamento
            ? 'A demanda de treinamento no planejamento é atualizada junto.'
            : 'Agendar também cria a demanda de treinamento, para o dia do instrutor já contar com isso.'}
        </span>
      </div>
    </Modal>
  )
}
