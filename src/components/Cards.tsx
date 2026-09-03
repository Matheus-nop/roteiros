// Sistema de cards (modo kanban): cartão de demanda, grupo recolhível e quadro de colunas com arrastar-e-soltar.
import { DndContext, DragOverlay, PointerSensor, closestCorners, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, Package, MapPin, CalendarDays, GripVertical } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { Demanda } from '../lib/types'
import { fmtData, fmtPatrimonio } from '../lib/format'
import { PRIORIDADE_TONE, SEPARACAO_LABEL, SEPARACAO_TONE, STATUS_LABEL, STATUS_TONE } from '../lib/status'
import { Badge, BadgeTipo, Checkbox, cx } from './ui'

// ---------------------------------------------------------------- cartão de item
export function CardDemanda({ d, selecionado, onSelecionar, acoes, extra, mostrarStatus = true, mostrarSeparacao = false, mostrarCliente = false, arrastavel = false, onClick, compacto, vertical }: {
  d: Demanda; selecionado?: boolean; onSelecionar?(v: boolean): void; acoes?: ReactNode; extra?: ReactNode
  mostrarStatus?: boolean; mostrarSeparacao?: boolean; mostrarCliente?: boolean; arrastavel?: boolean; onClick?(): void; compacto?: boolean
  /** Layout em bloco para colunas estreitas (kanban). */
  vertical?: boolean
}) {
  const badges = <>
    {d.prioridade && d.prioridade !== 'NORMAL' && <Badge tone={PRIORIDADE_TONE[d.prioridade]}>{d.prioridade}</Badge>}
    <BadgeTipo tipo={d.tipo} />
    {mostrarStatus && <Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Badge>}
    {mostrarSeparacao && <Badge tone={SEPARACAO_TONE[d.status_separacao]}>{SEPARACAO_LABEL[d.status_separacao]}{d.status_separacao === 'SEPARADO' && d.separado_por ? ` · ${d.separado_por}` : ''}</Badge>}
  </>
  const detalhes = (
    <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500">
      <span className={d.patrimonio ? 'font-mono' : ''}>{fmtPatrimonio(d)}</span>
      <span>·</span><span className="om">OS {d.om ?? '—'}</span>
      {d.data_planejada && !vertical && <><span>·</span><span className="inline-flex items-center gap-0.5"><CalendarDays size={10} />{fmtData(d.data_planejada)}</span></>}
      {d.veiculo && !vertical && <><span>·</span><span>🚗 {d.veiculo}</span></>}
      {d.herdado_de_pendencia && <span className="font-medium text-orange-700">↩ reagendada</span>}
      {d.observacao && !vertical && <span className="truncate text-slate-400" title={d.observacao}>· {d.observacao}</span>}
    </div>
  )

  if (vertical) {
    return (
      <div className={cx('group rounded-lg bg-white p-2.5 transition', selecionado && 'bg-blue-50/60', onClick && 'cursor-pointer')} onClick={onClick}>
        <div className="flex items-start gap-2">
          {onSelecionar && <span onClick={e => e.stopPropagation()} className="pt-0.5"><Checkbox checked={!!selecionado} onChange={e => onSelecionar(e.target.checked)} /></span>}
          <div className="min-w-0 flex-1">
            {mostrarCliente && <div className="truncate text-[12px] font-bold text-slate-900" title={d.cliente_nome ?? ''}>{d.cliente_nome ?? '—'}</div>}
            {mostrarCliente && d.local && <div className="truncate text-[11px] text-slate-500"><MapPin size={10} className="mr-0.5 inline text-red-500" />{d.local}</div>}
            <div className="mt-1 flex items-start gap-1.5"><Package size={13} className="mt-0.5 shrink-0 text-amber-600/80" /><span className="text-[12.5px] font-semibold leading-tight text-slate-800">{d.equipamento_nome ?? '—'}</span></div>
            {detalhes}
            {(d.veiculo || d.observacao) && <div className="truncate text-[11px] text-slate-400" title={d.observacao ?? ''}>{d.veiculo ? `🚗 ${d.veiculo}` : ''}{d.veiculo && d.observacao ? ' · ' : ''}{d.observacao ?? ''}</div>}
            {extra}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-1" onClick={e => e.stopPropagation()}>
          <div className="flex flex-wrap items-center gap-1">{badges}</div>
          {acoes && <div className="flex shrink-0 items-center gap-0.5 opacity-70 transition group-hover:opacity-100">{acoes}</div>}
        </div>
      </div>
    )
  }

  return (
    <div className={cx('group flex items-center gap-2.5 bg-white px-3 transition hover:bg-slate-50', compacto ? 'py-1.5' : 'py-2.5', selecionado && 'bg-blue-50/60', onClick && 'cursor-pointer')} onClick={onClick}>
      {onSelecionar && <span onClick={e => e.stopPropagation()}><Checkbox checked={!!selecionado} onChange={e => onSelecionar(e.target.checked)} /></span>}
      {arrastavel && <GripVertical size={14} className="shrink-0 cursor-grab text-slate-300" />}
      <Package size={15} className="shrink-0 text-amber-600/80" />
      <div className="min-w-0 flex-1">
        {mostrarCliente && <div className="truncate text-[12px] font-semibold text-slate-800">{d.cliente_nome ?? '—'} <span className="font-normal text-slate-500">· {d.local ?? '—'}</span></div>}
        <div className="truncate text-[13px] font-semibold text-slate-800">{d.equipamento_nome ?? '—'}</div>
        {detalhes}
        {extra}
      </div>
      <div className="flex shrink-0 items-center gap-1.5" onClick={e => e.stopPropagation()}>
        {badges}
        {acoes && <div className="flex items-center gap-0.5 opacity-60 transition group-hover:opacity-100">{acoes}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- grupo recolhível (parada / técnico / data)
export function GrupoCard({ titulo, subtitulo, chips, contagem, direita, children, aberto = true, cor, selecionado, onSelecionar, className }: {
  titulo: ReactNode; subtitulo?: ReactNode; chips?: ReactNode; contagem?: number; direita?: ReactNode; children: ReactNode
  aberto?: boolean; cor?: string | null; selecionado?: boolean; onSelecionar?(v: boolean): void; className?: string
}) {
  const [open, setOpen] = useState(aberto)
  return (
    <section className={cx('overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm', className)} style={cor ? { borderLeft: `4px solid ${cor}` } : undefined}>
      <header className="flex items-center gap-3 px-4 py-3">
        {onSelecionar && <Checkbox checked={!!selecionado} onChange={e => onSelecionar(e.target.checked)} />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><span className="text-[15px] font-bold text-slate-900">{titulo}</span>{subtitulo && <span className="text-[12px] text-slate-500">{subtitulo}</span>}</div>
          {chips && <div className="mt-1 flex flex-wrap gap-1">{chips}</div>}
        </div>
        <div className="flex items-center gap-2">{direita}
          {contagem !== undefined && <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-[11px] font-bold text-white">{contagem} {contagem === 1 ? 'item' : 'itens'}</span>}
          <button onClick={() => setOpen(o => !o)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><ChevronDown size={16} className={cx('transition', !open && '-rotate-90')} /></button>
        </div>
      </header>
      {open && <div className="divide-y divide-slate-100 border-t border-slate-100">{children}</div>}
    </section>
  )
}

export function Chip({ children, tone = 'bg-violet-50 text-violet-800' }: { children: ReactNode; tone?: string }) {
  return <span className={cx('rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', tone)}>{children}</span>
}

export function LocalData({ local, data }: { local: string | null; data?: string | null }) {
  return <span className="inline-flex flex-wrap items-center gap-x-2 text-[12px] text-slate-500">
    <span className="inline-flex items-center gap-1"><MapPin size={12} className="text-red-500" />{local ?? '—'}</span>
    {data && <span className="inline-flex items-center gap-1 font-semibold text-slate-700"><CalendarDays size={12} className="text-blue-600" />{fmtData(data)}</span>}
  </span>
}

// ---------------------------------------------------------------- quadro kanban (colunas + arrastar entre colunas)
export type Coluna<T> = { id: string; titulo: ReactNode; cor?: string; itens: T[]; rodape?: ReactNode; cabecalhoExtra?: ReactNode }

export function Quadro<T extends { id: string }>({ colunas, renderItem, onMover, larguraColuna = 300, podeArrastar = true, renderGrupo }: {
  colunas: Coluna<T>[]
  renderItem(item: T, arrastando: boolean): ReactNode
  /** Chamado ao soltar: item, coluna de origem, coluna de destino, índice de destino. */
  onMover(item: T, de: string, para: string, indice: number): void | Promise<void>
  larguraColuna?: number
  podeArrastar?: boolean
  /** Opcional: agrupa itens da coluna em blocos (ex.: por data) — devolve [chave, rótulo] por item. */
  renderGrupo?(chave: string, itens: T[], colunaId: string): ReactNode
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [ativo, setAtivo] = useState<T | null>(null)
  const colunaDe = (id: string) => colunas.find(c => c.itens.some(i => i.id === id))?.id ?? colunas.find(c => c.id === id)?.id
  const onDragStart = (e: DragStartEvent) => { const c = colunas.find(c => c.itens.some(i => i.id === e.active.id)); setAtivo(c?.itens.find(i => i.id === e.active.id) ?? null) }
  const onDragEnd = async (e: DragEndEvent) => {
    setAtivo(null)
    const { active, over } = e
    if (!over) return
    const de = colunaDe(String(active.id)); const para = colunaDe(String(over.id))
    if (!de || !para) return
    const item = colunas.find(c => c.id === de)!.itens.find(i => i.id === active.id)!
    const alvo = colunas.find(c => c.id === para)!
    const idx = alvo.itens.findIndex(i => i.id === over.id)
    if (de === para && (idx < 0 || active.id === over.id)) return
    await onMover(item, de, para, idx < 0 ? alvo.itens.length : idx)
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-3 [scrollbar-width:thin]">
        {colunas.map(c => <ColunaQuadro key={c.id} coluna={c} largura={larguraColuna} renderItem={renderItem} podeArrastar={podeArrastar} renderGrupo={renderGrupo} />)}
      </div>
      <DragOverlay>{ativo ? <div className="w-[300px] rounded-lg bg-white shadow-2xl ring-2 ring-[#1a56db]">{renderItem(ativo, true)}</div> : null}</DragOverlay>
    </DndContext>
  )
}

function ColunaQuadro<T extends { id: string }>({ coluna, largura, renderItem, podeArrastar, renderGrupo }: { coluna: Coluna<T>; largura: number; renderItem(i: T, a: boolean): ReactNode; podeArrastar: boolean; renderGrupo?(chave: string, itens: T[], colunaId: string): ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: coluna.id })
  return (
    <div ref={setNodeRef} className={cx('flex max-h-[calc(100vh-230px)] shrink-0 flex-col rounded-xl border bg-slate-100/70 transition', isOver ? 'border-[#1a56db] bg-blue-50/60' : 'border-slate-200')} style={{ width: largura }}>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-slate-600">{coluna.cor && <span className="h-2.5 w-2.5 rounded-full" style={{ background: coluna.cor }} />}{coluna.titulo}</div>
        <div className="flex items-center gap-1">{coluna.cabecalhoExtra}<span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">{coluna.itens.length}</span></div>
      </div>
      <SortableContext items={coluna.itens.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2 [scrollbar-width:thin]">
          {coluna.itens.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-[11px] text-slate-400">Solte aqui</div>}
          {renderGrupo ? renderGrupo('', coluna.itens, coluna.id) : coluna.itens.map(i => <ItemArrastavel key={i.id} id={i.id} desabilitado={!podeArrastar}>{renderItem(i, false)}</ItemArrastavel>)}
        </div>
      </SortableContext>
      {coluna.rodape && <div className="border-t border-slate-200 px-2 py-2">{coluna.rodape}</div>}
    </div>
  )
}

export function ItemArrastavel({ id, children, desabilitado }: { id: string; children: ReactNode; desabilitado?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: desabilitado })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners}
      className={cx('rounded-lg bg-white shadow-sm ring-1 ring-slate-200', !desabilitado && 'cursor-grab active:cursor-grabbing', isDragging && 'opacity-40')}>
      {children}
    </div>
  )
}
