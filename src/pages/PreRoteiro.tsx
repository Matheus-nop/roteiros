// Pré-roteiro: previsão por técnico. O roteiro nasce parada por parada — cada parada pode ser
// liberada individualmente (vira ROTEIRIZADO e entra na expedição), ou tudo de uma vez.
import { Route, Printer, AlertTriangle, CheckCircle2, Search, GripVertical } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { SeletorData } from '../components/Filtros'
import { usePrint } from '../components/Print'
import { FolhaRoteiro } from '../components/Etiqueta'
import { CardDemanda, Chip, GrupoCard, LocalData } from '../components/Cards'
import { Badge, Botao, Confirmar, Input, Pagina, Vazio, cx } from '../components/ui'
import { STATUS_PLANEJAMENTO, STATUS_A_ROTEIRIZAR } from '../lib/status'
import { hojeISO, ordenarParadas, fmtData, agrupar, chaveParada, normalizar, textoBusca } from '../lib/format'
import { veiculosDoGrupo } from '../components/GrupoTecnico'
import type { Demanda } from '../lib/types'

export function PreRoteiro() {
  const { demandas, tecnicos, acoes } = useData()
  const { pode } = useAuth()
  const { toast, erro } = useToast()
  const { imprimir } = usePrint()
  const [data, setData] = useState(hojeISO())
  const [todas, setTodas] = useState(false)
  const [busca, setBusca] = useState('')
  const [confirmar, setConfirmar] = useState<{ titulo: string; texto: React.ReactNode; fn(): Promise<unknown>; msg: string } | null>(null)
  const liberar = pode('planejamento.gerar_roteiro')

  const base = useMemo(() => {
    const b = normalizar(busca)
    return demandas.filter(d => STATUS_PLANEJAMENTO.includes(d.status) && d.tecnico_id && (todas || d.data_planejada === data) && (!b || textoBusca(d).includes(b)))
  }, [demandas, data, todas, busca])
  const semData = useMemo(() => demandas.filter(d => STATUS_A_ROTEIRIZAR.includes(d.status) && d.tecnico_id && !d.data_planejada).length, [demandas])

  const cards = useMemo(() => {
    const out: { tec: typeof tecnicos[number]; data: string; itens: Demanda[] }[] = []
    for (const [k, its] of agrupar(base, d => `${d.tecnico_id}|${d.data_planejada ?? ''}`)) {
      const [tid, dt] = k.split('|'); const tec = tecnicos.find(t => t.id === tid)
      if (tec) out.push({ tec, data: dt, itens: [...its].sort(ordenarParadas) })
    }
    return out.sort((a, b) => a.data.localeCompare(b.data) || a.tec.nome.localeCompare(b.tec.nome))
  }, [base, tecnicos])

  const run = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast(msg) } catch (e) { erro(e) } }
  const totalPrev = base.filter(d => STATUS_A_ROTEIRIZAR.includes(d.status)).length

  return (
    <Pagina titulo="Pré-roteiro" subtitulo="Previsão por técnico · arraste as paradas para definir a sequência e libere uma a uma ou todas de uma vez; o que é liberado entra na expedição" acoes={<>
      <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={todas} onChange={e => setTodas(e.target.checked)} />Todas as datas</label>
      <SeletorData valor={data} onChange={setData} />
    </>}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar técnico, cliente, local, equipamento…" className="pl-8" /></div>
        <Badge>{totalPrev} itens a liberar</Badge>
        {semData > 0 && <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 ring-1 ring-amber-200"><AlertTriangle size={12} />{semData} com técnico mas sem data (defina no Planejamento)</span>}
      </div>
      {cards.length === 0 && <Vazio titulo={`Nenhuma previsão para ${todas ? 'as datas ativas' : fmtData(data)}`} texto="Atribua técnico e data no Planejamento." />}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {cards.map(({ tec, data: dt, itens }) => {
          const paradas = Array.from(agrupar(itens, chaveParada).values())
          const liberados = itens.filter(d => d.status === 'ROTEIRIZADO')
          const pendentes = itens.filter(d => STATUS_A_ROTEIRIZAR.includes(d.status))
          const veics = veiculosDoGrupo(itens)
          return (
            <GrupoCard key={`${tec.id}|${dt}`} cor={tec.cor} titulo={<span className="inline-flex items-center gap-2">👷 {tec.nome}</span>}
              subtitulo={<span className="inline-flex items-center gap-2">🚗 {veics.length ? veics.join(' / ') : <span className="text-amber-700">sem veículo</span>} · 📅 {fmtData(dt)}</span>}
              chips={<><Chip tone="bg-slate-100 text-slate-700">{paradas.length} paradas</Chip><Chip tone="bg-emerald-50 text-emerald-800">{liberados.length} liberados</Chip><Chip tone="bg-violet-50 text-violet-800">{pendentes.length} a liberar</Chip></>}
              direita={<>
                <Botao tamanho="sm" variante="fantasma" title="Imprimir previsão" onClick={() => imprimir(<FolhaRoteiro tecnico={tec} data={dt} itens={itens} />)}><Printer size={13} /></Botao>
                {liberar && pendentes.length > 0 && <Botao tamanho="sm" variante="primario" onClick={() => setConfirmar({ titulo: 'Liberar roteiro inteiro', texto: <>Liberar as {pendentes.length} demanda(s) de <b>{tec.nome}</b> em {fmtData(dt)}? Elas passam a ROTEIRIZADO e entram na expedição.</>, fn: () => acoes.gerarRoteiro(itens), msg: 'Roteiro liberado.' })}><Route size={13} />Liberar tudo ({pendentes.length})</Botao>}
              </>}>
              <ParadasOrdenaveis paradas={paradas} podeOrdenar={liberar} onReordenar={(nova) => run(() => acoes.reordenar(nova.flat().map(d => d.id)), 'Ordem das paradas atualizada.')}
                render={(its, i, handle) => {
                  const p0 = its[0]; const todosLib = its.every(d => d.status === 'ROTEIRIZADO'); const aLib = its.filter(d => STATUS_A_ROTEIRIZAR.includes(d.status))
                  return (
                    <div className={cx(todosLib && 'bg-emerald-50/40')}>
                      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
                        {handle}
                        <span className={cx('flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white', todosLib ? 'bg-emerald-500' : 'bg-[#1a56db]')}>{i + 1}</span>
                        <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-bold text-slate-800">{p0.cliente_nome ?? '—'}</div><LocalData local={p0.local} /></div>
                        {todosLib ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 size={14} />Liberada</span>
                          : liberar && <Botao tamanho="sm" variante="sucesso" onClick={() => run(() => acoes.liberarParada(aLib, demandas.filter(d => d.tecnico_id === tec.id && d.data_planejada === dt && d.status === 'ROTEIRIZADO')), `Parada liberada (${aLib.length} item).`)}><Route size={12} />Liberar parada</Botao>}
                      </div>
                      <div className="pb-1 pl-8">{its.map(d => <CardDemanda key={d.id} d={d} compacto />)}</div>
                    </div>
                  )
                }} />
            </GrupoCard>
          )
        })}
      </div>
      <Confirmar aberto={!!confirmar} titulo={confirmar?.titulo ?? ''} texto={confirmar?.texto} onFechar={() => setConfirmar(null)}
        onConfirmar={() => { const c = confirmar!; setConfirmar(null); run(c.fn, c.msg) }} />
    </Pagina>
  )
}

// Lista de paradas com arrastar-e-soltar. Ao soltar, a nova ordem é gravada (10, 20, 30…) em todos os itens.
function ParadasOrdenaveis({ paradas, podeOrdenar, onReordenar, render }: {
  paradas: Demanda[][]; podeOrdenar: boolean; onReordenar(nova: Demanda[][]): void
  render(its: Demanda[], i: number, handle: React.ReactNode): React.ReactNode
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const [local, setLocal] = useState<Demanda[][] | null>(null)
  const lista = local ?? paradas
  const ids = lista.map(p => p[0].id)
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const nova = arrayMove(lista, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
    setLocal(nova); onReordenar(nova); setTimeout(() => setLocal(null), 800)
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {lista.map((its, i) => <ParadaArrastavel key={its[0].id} id={its[0].id} desabilitado={!podeOrdenar} render={h => render(its, i, h)} />)}
      </SortableContext>
    </DndContext>
  )
}

function ParadaArrastavel({ id, desabilitado, render }: { id: string; desabilitado: boolean; render(handle: React.ReactNode): React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: desabilitado })
  const handle = desabilitado ? null : <button {...attributes} {...listeners} className="cursor-grab touch-none rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing" title="Arrastar para reordenar"><GripVertical size={14} /></button>
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx('border-t border-slate-100 first:border-t-0', isDragging && 'relative z-10 bg-white shadow-lg')}>{render(handle)}</div>
}
