// Marcar pendente: pede a data de reagendamento (vira a data planejada).
import { useState } from 'react'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import type { Demanda } from '../lib/types'
import { addDias, hojeISO } from '../lib/format'
import { Botao, Campo, Input, Modal } from './ui'

export function ModalPendente({ itens, onFechar, titulo = 'Marcar pendente' }: { itens: Demanda[]; onFechar(): void; titulo?: string }) {
  const { acoes } = useData()
  const { toast, erro } = useToast()
  const [data, setData] = useState(addDias(hojeISO(), 1))
  const [obs, setObs] = useState('')
  const salvar = async () => {
    try {
      await acoes.marcarPendente(itens.map(i => i.id), data, obs || null)
      toast(`${itens.length} item(ns) reagendado(s) para ${data.split('-').reverse().join('/')}.`)
      onFechar()
    } catch (e) { erro(e) }
  }
  return (
    <Modal aberto onFechar={onFechar} titulo={titulo} rodape={<><Botao onClick={onFechar}>Cancelar</Botao><Botao variante="primario" onClick={salvar} disabled={!data}>Confirmar</Botao></>}>
      <p className="mb-3 text-sm text-slate-600">{itens.length === 1 ? <>Item <b>{itens[0].equipamento_nome}</b> (OM {itens[0].om}) volta ao planejamento na data informada.</> : <>{itens.length} itens voltam ao planejamento na data informada.</>}</p>
      <div className="grid grid-cols-1 gap-3">
        <Campo rotulo="Reagendar para (nova data planejada)"><Input type="date" value={data} min={hojeISO()} onChange={e => setData(e.target.value)} /></Campo>
        <Campo rotulo="Motivo / observação"><Input value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: cliente sem responsável no local" /></Campo>
      </div>
      <p className="mt-3 text-xs text-slate-500">A nova data passa a ser a data planejada do item; ele volta ao planejamento nessa data.</p>
    </Modal>
  )
}
