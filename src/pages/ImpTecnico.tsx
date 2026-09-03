// Imp. técnico: o que o técnico executa. Agrupado por parada; marca FINALIZADO / PENDENTE (pede data).
import { Check, Clock, Lock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { ModalPendente } from '../components/ModalPendente'
import { Badge, BadgeStatus, BadgeTipo, Botao, Campo, Input, Modal, Pagina, Select, Vazio, cx } from '../components/ui'
import { STATUS_EM_ROTA } from '../lib/status'
import { agrupar, chaveParada, fmtData, fmtPatrimonio, hojeISO, ordenarParadas, rotuloData, addDias } from '../lib/format'
import type { Demanda } from '../lib/types'

export function ImpTecnico() {
  const { demandas, tecnicos, acoes, tecnicoPorId } = useData()
  const { pode, usuario } = useAuth()
  const { toast, erro } = useToast()
  const meuTec = usuario?.perfil.papel === 'TECNICO' ? usuario.perfil.tecnico_id : null
  const [tecnico, setTecnico] = useState<string>(() => meuTec ?? localStorage.getItem('imp-tecnico') ?? '')
  const [pendente, setPendente] = useState<Demanda[] | null>(null)
  const [fechar, setFechar] = useState<{ data: string; itens: Demanda[] } | null>(null)
  const executar = pode('roteiro.executar')

  const emRota = useMemo(() => demandas.filter(d => STATUS_EM_ROTA.includes(d.status) && d.tecnico_id === tecnico), [demandas, tecnico])
  const porData = useMemo(() => Array.from(agrupar(emRota, d => d.data_planejada ?? '')).sort(([a], [b]) => a.localeCompare(b)), [emRota])
  const hoje = hojeISO()

  const run = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast(msg) } catch (e) { erro(e) } }
  const escolher = (id: string) => { setTecnico(id); localStorage.setItem('imp-tecnico', id) }

  return (
    <Pagina titulo="Imp. técnico" subtitulo="Execução em rota: finalizar ou marcar pendente (com data de reagendamento)" acoes={
      !meuTec && <Select value={tecnico} onChange={e => escolher(e.target.value)} className="w-52"><option value="">Selecione o técnico…</option>{tecnicos.filter(t => t.ativo).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</Select>
    }>
      {!tecnico && <Vazio titulo="Selecione o técnico" texto="O roteiro aparece agrupado por parada, só com as datas ativas." />}
      {tecnico && porData.length === 0 && <Vazio titulo={`${tecnicoPorId(tecnico)?.nome ?? ''} não tem itens em rota`} texto="Quando o PCM gerar o roteiro, os itens aparecem aqui." />}

      <div className="space-y-5">
        {porData.map(([data, itens]) => {
          const ordenados = [...itens].sort(ordenarParadas)
          const paradas = Array.from(agrupar(ordenados, chaveParada).values())
          const veic = itens.find(d => d.veiculo)?.veiculo
          return (
            <section key={data} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className={cx('flex flex-wrap items-center justify-between gap-2 px-4 py-3', data < hoje ? 'bg-red-50' : 'bg-slate-50')}>
                <div className="text-[15px] font-bold text-slate-900">📅 {rotuloData(data || null)} <span className="ml-2 text-[12px] font-normal text-slate-500">🚗 {veic ?? 'sem veículo'} · {paradas.length} parada(s) · {itens.length} item(ns)</span></div>
                {executar && <Botao tamanho="sm" onClick={() => setFechar({ data, itens })}><Lock size={13} />Fechar roteiro do dia</Botao>}
              </div>
              <ol className="divide-y divide-slate-100">
                {paradas.map((its, i) => (
                  <li key={i} className="px-4 py-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1a56db] text-xs font-bold text-white">{its[0].ordem_parada ? its[0].ordem_parada / 10 : i + 1}</span>
                        <div>
                          <div className="text-sm font-semibold text-slate-800">{its[0].cliente_nome ?? '—'}</div>
                          <div className="text-xs text-slate-500">📍 {its[0].local ?? '—'}</div>
                        </div>
                      </div>
                      {executar && its.length > 1 && <Botao tamanho="sm" variante="sucesso" onClick={() => run(() => acoes.finalizar(its.map(d => d.id)), `Parada finalizada (${its.length} itens).`)}><Check size={13} />Finalizar parada</Botao>}
                    </div>
                    <ul className="space-y-1.5 pl-9">
                      {its.map(d => (
                        <li key={d.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-100">
                          <BadgeTipo tipo={d.tipo} />
                          <span className="font-medium text-slate-800">{d.equipamento_nome}</span>
                          <span className={cx('text-xs', d.patrimonio ? 'font-mono font-semibold' : 'text-slate-600')}>{fmtPatrimonio(d)}</span>
                          <span className="om text-xs text-slate-500">OM {d.om ?? '—'}</span>
                          <BadgeStatus status={d.status} />
                          {d.observacao && <span className="text-xs text-slate-500">· {d.observacao}</span>}
                          {executar && <div className="ml-auto flex gap-1">
                            <Botao tamanho="sm" variante="sucesso" onClick={() => run(() => acoes.finalizar([d.id]), 'Finalizado.')}><Check size={13} />Finalizar</Botao>
                            <Botao tamanho="sm" onClick={() => setPendente([d])}><Clock size={13} />Pendente</Botao>
                          </div>}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </section>
          )
        })}
      </div>

      {pendente && <ModalPendente itens={pendente} onFechar={() => setPendente(null)} />}
      {fechar && <ModalFecharRoteiro data={fechar.data} itens={fechar.itens} tecnicoId={tecnico} onFechar={() => setFechar(null)} />}
    </Pagina>
  )
}

function ModalFecharRoteiro({ data, itens, tecnicoId, onFechar }: { data: string; itens: Demanda[]; tecnicoId: string; onFechar(): void }) {
  const { acoes } = useData()
  const { usuario } = useAuth()
  const { toast, erro } = useToast()
  const [opcao, setOpcao] = useState<'manter' | 'reagendar'>('reagendar')
  const [nova, setNova] = useState(addDias(hojeISO(), 1))
  const abertos = itens.filter(d => STATUS_EM_ROTA.includes(d.status))
  const salvar = async () => {
    try {
      await acoes.fecharRoteiro(tecnicoId, data, itens, { reagendarPara: opcao === 'reagendar' ? nova : null }, usuario?.id ?? null)
      toast('Roteiro do dia fechado.'); onFechar()
    } catch (e) { erro(e) }
  }
  return (
    <Modal aberto onFechar={onFechar} titulo={`Fechar roteiro · ${fmtData(data)}`} rodape={<><Botao onClick={onFechar}>Cancelar</Botao><Botao variante="primario" onClick={salvar}>Fechar roteiro</Botao></>}>
      <p className="text-sm text-slate-700">Itens finalizados já estão arquivados. Restam <b>{abertos.length}</b> item(ns) não executado(s) neste roteiro.</p>
      {abertos.length > 0 && (
        <div className="mt-3 space-y-2">
          <label className="flex items-start gap-2 text-sm"><input type="radio" checked={opcao === 'reagendar'} onChange={() => setOpcao('reagendar')} className="mt-1" /><span>Reagendar os não executados (voltam ao planejamento como pendência, com a data abaixo)</span></label>
          {opcao === 'reagendar' && <Campo rotulo="Nova data planejada" className="ml-6 w-48"><Input type="date" value={nova} onChange={e => setNova(e.target.value)} /></Campo>}
          <label className="flex items-start gap-2 text-sm"><input type="radio" checked={opcao === 'manter'} onChange={() => setOpcao('manter')} className="mt-1" /><span>Manter em andamento (continuam no roteiro desta data)</span></label>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-1">{abertos.map(d => <Badge key={d.id}>{d.equipamento_nome} · {fmtPatrimonio(d)}</Badge>)}</div>
    </Modal>
  )
}
