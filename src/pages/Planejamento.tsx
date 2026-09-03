import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil, Undo2, UserCog, Route, XCircle, Printer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { BarraFiltros } from '../components/Filtros'
import { ModalAtribuir } from '../components/ModalAtribuir'
import { ModalEditarDemanda } from '../components/FormDemanda'
import { BarraSelecao } from '../components/TabelaDemandas'
import { agruparPorTecnicoEData, CabecalhoData, CabecalhoTecnico, veiculosDoGrupo } from '../components/GrupoTecnico'
import { Badge, BadgeStatus, BadgeTipo, Botao, Checkbox, Confirmar, Pagina, Select, Vazio, cx } from '../components/ui'
import { STATUS_PLANEJAMENTO, STATUS_LABEL, STATUS_A_ROTEIRIZAR } from '../lib/status'
import { fmtPatrimonio, normalizar, textoBusca } from '../lib/format'
import type { Demanda, Status } from '../lib/types'
import { usePrint } from '../components/Print'
import { FolhaRoteiro } from '../components/Etiqueta'

export function Planejamento() {
  const { demandas, tecnicos, acoes } = useData()
  const { pode } = useAuth()
  const { toast, erro } = useToast()
  const { imprimir } = usePrint()
  const [busca, setBusca] = useState('')
  const [tecnico, setTecnico] = useState('')
  const [status, setStatus] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [atribuir, setAtribuir] = useState<Demanda[] | null>(null)
  const [editando, setEditando] = useState<Demanda | null>(null)
  const [confirmar, setConfirmar] = useState<{ titulo: string; texto: string; fn(): Promise<unknown>; msg: string; perigo?: boolean } | null>(null)
  const editar = pode('planejamento.editar')

  const itens = useMemo(() => {
    const b = normalizar(busca)
    return demandas
      .filter(d => STATUS_PLANEJAMENTO.includes(d.status))
      .filter(d => !tecnico || (tecnico === '__sem' ? !d.tecnico_id : d.tecnico_id === tecnico))
      .filter(d => !status || d.status === status)
      .filter(d => !b || textoBusca(d).includes(b))
  }, [demandas, busca, tecnico, status])

  const grupos = useMemo(() => agruparPorTecnicoEData(itens, tecnicos), [itens, tecnicos])
  const ids = Array.from(sel)
  const limpar = () => setSel(new Set())
  const run = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast(msg); limpar() } catch (e) { erro(e) } }
  const selecionadas = demandas.filter(d => sel.has(d.id))

  const gerar = (its: Demanda[], rotulo: string) => {
    const aptos = its.filter(d => STATUS_A_ROTEIRIZAR.includes(d.status))
    if (!aptos.length) { toast('Nada a roteirizar neste grupo.', 'info'); return }
    setConfirmar({ titulo: 'Gerar roteiro', texto: `Roteirizar ${aptos.length} item(ns) de ${rotulo}? A ordem manual das paradas é mantida.`, fn: () => acoes.gerarRoteiro(its), msg: 'Roteiro gerado.' })
  }
  const gerarTodos = () => {
    const aptos = itens.filter(d => STATUS_A_ROTEIRIZAR.includes(d.status) && d.tecnico_id && d.data_planejada)
    if (!aptos.length) { toast('Nenhum item com técnico e data para roteirizar.', 'info'); return }
    setConfirmar({
      titulo: 'Gerar todos os roteiros', texto: `Roteirizar ${aptos.length} item(ns) com técnico e data definidos (itens sem técnico/data ficam no planejamento)?`,
      fn: async () => { for (const g of grupos) for (const gd of g.datas) { if (g.tecnicoId && gd.data) { const its = gd.itens.filter(d => aptos.includes(d)); if (its.length) await acoes.gerarRoteiro([...gd.itens.filter(d => d.status === 'ROTEIRIZADO'), ...its]) } } },
      msg: 'Roteiros gerados.',
    })
  }

  return (
    <Pagina titulo="Planejamento (PCM)" subtitulo={`${itens.length} demanda(s) · agrupadas por técnico e data · espelho fiel do roteiro`} acoes={<>
      {editar && <Botao variante="primario" onClick={gerarTodos}><Route size={14} />Gerar todos os roteiros</Botao>}
    </>}>
      <BarraFiltros busca={busca} setBusca={setBusca} tecnico={tecnico} setTecnico={setTecnico}>
        <Select value={status} onChange={e => setStatus(e.target.value)} className="w-48"><option value="">Todos os status</option>{STATUS_PLANEJAMENTO.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select>
      </BarraFiltros>

      {grupos.length === 0 && <Vazio titulo="Nada no planejamento" texto="Envie demandas da fila para o planejamento, ou ajuste os filtros." />}

      <div className="space-y-4">
        {grupos.map(g => (
          <section key={g.tecnicoId ?? '__sem'} className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
            <CabecalhoTecnico tecnico={g.tecnico} total={g.total} />
            {g.datas.map(gd => {
              const chave = `${g.tecnicoId}|${gd.data}`
              const aRoteirizar = gd.itens.filter(d => STATUS_A_ROTEIRIZAR.includes(d.status)).length
              return (
                <div key={chave} className="border-t border-slate-100">
                  <CabecalhoData data={gd.data} n={gd.itens.length} direita={<>
                    {veiculosDoGrupo(gd.itens).length > 1 && <Badge tone="bg-amber-50 text-amber-800 ring-amber-200">{veiculosDoGrupo(gd.itens).length} veículos</Badge>}
                    <Botao tamanho="sm" variante="fantasma" onClick={() => imprimir(<FolhaRoteiro tecnico={g.tecnico} data={gd.data ?? ''} itens={gd.itens} />)} title="Imprimir lista"><Printer size={13} /></Botao>
                    {editar && g.tecnicoId && gd.data && aRoteirizar > 0 && <Botao tamanho="sm" variante="primario" onClick={() => gerar(gd.itens, `${g.tecnico?.nome} em ${gd.data}`)}><Route size={13} />Gerar roteiro ({aRoteirizar})</Botao>}
                  </>} />
                  <ListaOrdenavel itens={gd.itens} podeOrdenar={editar && !!g.tecnicoId && !!gd.data} sel={sel} setSel={setSel}
                    onReordenar={async (novaOrdem) => { try { await acoes.reordenar(novaOrdem.map(d => d.id)) } catch (e) { erro(e) } }}
                    acoes={d => <>
                      {editar && <Botao tamanho="sm" variante="fantasma" title="Técnico / veículo / data" onClick={() => setAtribuir([d])}><UserCog size={14} /></Botao>}
                      {editar && <Botao tamanho="sm" variante="fantasma" title="Editar dados" onClick={() => setEditando(d)}><Pencil size={14} /></Botao>}
                      {editar && <Botao tamanho="sm" variante="fantasma" title="Devolver à fila" onClick={() => setConfirmar({ titulo: 'Devolver à fila', texto: 'Devolver esta demanda à fila? Técnico, veículo e data serão limpos.', fn: () => acoes.devolverParaFila([d.id]), msg: 'Devolvida à fila.' })}><Undo2 size={14} /></Botao>}
                      {editar && <Botao tamanho="sm" variante="fantasma" title="Cancelar demanda" onClick={() => setConfirmar({ titulo: 'Cancelar demanda', texto: 'Cancelar esta demanda? Ela sai das telas ativas e fica no histórico (restaurável).', fn: () => acoes.cancelar([d.id], null), msg: 'Cancelada.', perigo: true })}><XCircle size={14} className="text-red-600" /></Botao>}
                    </>} />
                </div>
              )
            })}
          </section>
        ))}
      </div>

      <BarraSelecao n={ids.length} onLimpar={limpar}>
        {editar && <Botao tamanho="sm" variante="primario" onClick={() => setAtribuir(selecionadas)}><UserCog size={13} />Técnico / veículo / data</Botao>}
        {editar && <Select className="!w-44 !py-1 !text-xs" value="" onChange={e => { if (e.target.value) run(() => acoes.definirStatus(ids, e.target.value as Status), 'Status aplicado.') }}>
          <option value="">Mudar status…</option>{STATUS_A_ROTEIRIZAR.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>}
        {editar && <Botao tamanho="sm" onClick={() => setConfirmar({ titulo: 'Devolver à fila', texto: `Devolver ${ids.length} demanda(s) à fila?`, fn: () => acoes.devolverParaFila(ids), msg: 'Devolvidas à fila.' })}><Undo2 size={13} />Devolver à fila</Botao>}
        {editar && <Botao tamanho="sm" variante="perigo" onClick={() => setConfirmar({ titulo: 'Cancelar demandas', texto: `Cancelar ${ids.length} demanda(s)?`, fn: () => acoes.cancelar(ids, null), msg: 'Canceladas.', perigo: true })}>Cancelar</Botao>}
      </BarraSelecao>

      {atribuir && <ModalAtribuir itens={atribuir} onFechar={() => { setAtribuir(null); limpar() }} />}
      <ModalEditarDemanda d={editando} onFechar={() => setEditando(null)} />
      <Confirmar aberto={!!confirmar} titulo={confirmar?.titulo ?? ''} texto={confirmar?.texto} perigo={confirmar?.perigo} onFechar={() => setConfirmar(null)}
        onConfirmar={() => { const c = confirmar!; setConfirmar(null); run(c.fn, c.msg) }} />
    </Pagina>
  )
}

function ListaOrdenavel({ itens, podeOrdenar, sel, setSel, onReordenar, acoes }: {
  itens: Demanda[]; podeOrdenar: boolean; sel: Set<string>; setSel(s: Set<string>): void
  onReordenar(nova: Demanda[]): Promise<void>; acoes(d: Demanda): React.ReactNode
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const [local, setLocal] = useState<Demanda[] | null>(null)
  const lista = local ?? itens
  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const de = lista.findIndex(d => d.id === active.id)
    const para = lista.findIndex(d => d.id === over.id)
    const nova = arrayMove(lista, de, para)
    setLocal(nova)
    await onReordenar(nova)
    setLocal(null)
  }
  const toggle = (id: string) => { const s = new Set(sel); if (s.has(id)) s.delete(id); else s.add(id); setSel(s) }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={lista.map(d => d.id)} strategy={verticalListSortingStrategy}>
        <div className="overflow-x-auto">
          <table className="tabela w-full min-w-[980px]">
            <thead><tr><th className="w-8" /><th className="w-8" /><th>#</th><th>OM / OS</th><th>Cliente · Local</th><th>Tipo</th><th>Equipamento</th><th>Pat. / Qtd</th><th>Veículo</th><th>Status</th><th>Sep.</th><th /></tr></thead>
            <tbody>
              {lista.map(d => <Linha key={d.id} d={d} podeOrdenar={podeOrdenar} selecionada={sel.has(d.id)} onToggle={() => toggle(d.id)} acoes={acoes(d)} />)}
            </tbody>
          </table>
        </div>
      </SortableContext>
    </DndContext>
  )
}

function Linha({ d, podeOrdenar, selecionada, onToggle, acoes }: { d: Demanda; podeOrdenar: boolean; selecionada: boolean; onToggle(): void; acoes: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: d.id, disabled: !podeOrdenar })
  return (
    <tr ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx(selecionada && 'selecionada', isDragging && 'bg-brand-50 shadow-md relative z-10')}>
      <td><Checkbox checked={selecionada} onChange={onToggle} /></td>
      <td className="text-slate-400">{podeOrdenar && <button {...attributes} {...listeners} className="cursor-grab touch-none rounded p-0.5 hover:bg-slate-200 active:cursor-grabbing" title="Arrastar para ordenar"><GripVertical size={14} /></button>}</td>
      <td className="font-semibold tabular-nums text-slate-700">{d.ordem_parada ? d.ordem_parada / 10 : '—'}</td>
      <td><span className="om font-medium">{d.om ?? '—'}</span></td>
      <td><div className="font-medium text-slate-800">{d.cliente_nome ?? '—'}</div><div className="text-xs text-slate-500">{d.local ?? '—'}</div></td>
      <td><BadgeTipo tipo={d.tipo} /></td>
      <td className="max-w-[240px]"><div className="truncate" title={d.equipamento_nome ?? ''}>{d.equipamento_nome}</div>{d.herdado_de_pendencia && <span className="text-[10px] font-medium text-orange-700">↩ reagendada{d.observacao ? ` · ${d.observacao}` : ''}</span>}</td>
      <td className={cx('whitespace-nowrap', d.patrimonio ? 'font-mono font-medium' : 'text-slate-600')}>{fmtPatrimonio(d)}</td>
      <td className="text-xs">{d.veiculo ?? <span className="text-amber-700">sem veículo</span>}</td>
      <td><BadgeStatus status={d.status} /></td>
      <td className="text-xs">{d.status_separacao === 'SEPARADO' ? <span className="text-emerald-700">✓ {d.separado_por}</span> : <span className="text-slate-400">—</span>}</td>
      <td className="w-px whitespace-nowrap text-right"><div className="flex justify-end gap-0.5">{acoes}</div></td>
    </tr>
  )
}
