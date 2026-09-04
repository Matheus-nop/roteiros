// Sistema de cards (modo kanban): cartão de demanda, grupo recolhível e quadro de colunas com arrastar-e-soltar.
import { DndContext, DragOverlay, PointerSensor, closestCorners, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS as CSSdnd } from '@dnd-kit/utilities'
import { ChevronDown, Package, MapPin, CalendarDays, GripVertical, EyeOff, Eye, RotateCcw } from 'lucide-react'
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Demanda } from '../lib/types'
import { fmtData, fmtPatrimonio, rotuloEspera } from '../lib/format'
import { PRIORIDADE_TONE, SEPARACAO_LABEL, SEPARACAO_TONE, STATUS_LABEL, STATUS_TONE } from '../lib/status'
import { Badge, BadgeTipo, Checkbox, cx } from './ui'

// ---------------------------------------------------------------- cartão de item
export function CardDemanda({ d, selecionado, onSelecionar, acoes, extra, mostrarStatus = true, mostrarSeparacao = false, mostrarCliente = false, cabecalho = 'ambos', arrastavel = false, onClick, compacto, vertical }: {
  d: Demanda; selecionado?: boolean; onSelecionar?(v: boolean): void; acoes?: ReactNode; extra?: ReactNode
  mostrarStatus?: boolean; mostrarSeparacao?: boolean; mostrarCliente?: boolean; arrastavel?: boolean; onClick?(): void; compacto?: boolean
  /**
   * O que o card repete no topo. Quando a coluna do quadro já é o cliente (ou a
   * localidade), repetir o mesmo texto em todo card só ocupa espaço — então
   * mostra-se só o outro campo.
   */
  cabecalho?: 'ambos' | 'cliente' | 'local'
  /** Layout em bloco para colunas estreitas (kanban). */
  vertical?: boolean
}) {
  const badges = <>
    {d.herdado_de_pendencia && <BadgeReagendada d={d} />}
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
      {d.observacao && !vertical && <span className="truncate text-slate-400" title={d.observacao}>· {d.observacao}</span>}
    </div>
  )

  if (vertical) {
    return (
      <div className={cx('group rounded-lg bg-white p-2.5 transition', selecionado && 'bg-blue-50/60', onClick && 'cursor-pointer')} onClick={onClick}>
        <div className="flex items-start gap-2">
          {onSelecionar && <span onClick={e => e.stopPropagation()} className="pt-0.5"><Checkbox checked={!!selecionado} onChange={e => onSelecionar(e.target.checked)} /></span>}
          <div className="min-w-0 flex-1">
            {mostrarCliente && cabecalho !== 'local' && <div className="truncate text-[12px] font-bold text-slate-900" title={d.cliente_nome ?? ''}>{d.cliente_nome ?? '—'}</div>}
            {mostrarCliente && cabecalho !== 'cliente' && d.local && <div className={cx('truncate', cabecalho === 'local' ? 'text-[12px] font-bold text-slate-900' : 'text-[11px] text-slate-500')} title={d.local}><MapPin size={10} className="mr-0.5 inline text-red-500" />{d.local}</div>}
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

  // No celular vira duas linhas: texto em cima, etiquetas e ações embaixo. Numa linha só,
  // as etiquetas (que não encolhem) espremiam o nome do equipamento a ~45px e ele quebrava
  // letra por letra — foi o que apareceu no Roteiro, na Expedição e no Pré-roteiro.
  return (
    <div className={cx('group flex flex-col gap-1.5 bg-white px-3 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-2.5',
      compacto ? 'py-2 sm:py-1.5' : 'py-2.5', selecionado && 'bg-blue-50/60', onClick && 'cursor-pointer')} onClick={onClick}>
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {onSelecionar && <span onClick={e => e.stopPropagation()}><Checkbox checked={!!selecionado} onChange={e => onSelecionar(e.target.checked)} /></span>}
        {arrastavel && <GripVertical size={14} className="shrink-0 cursor-grab text-slate-300" />}
        <Package size={15} className="shrink-0 text-amber-600/80" />
        <div className="min-w-0 flex-1">
          {mostrarCliente && <div className="truncate text-[12px] font-semibold text-slate-800">{d.cliente_nome ?? '—'} <span className="font-normal text-slate-500">· {d.local ?? '—'}</span></div>}
          <div className="truncate text-[13px] font-semibold text-slate-800">{d.equipamento_nome ?? '—'}</div>
          {detalhes}
          {extra}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pl-[26px] sm:shrink-0 sm:pl-0" onClick={e => e.stopPropagation()}>
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
      {/* `flex-wrap` + `basis-full`: no celular os botões caem para a linha de baixo. Numa
          linha só eles passavam por cima do subtítulo e o último saía da tela. */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        {onSelecionar && <Checkbox checked={!!selecionado} onChange={e => onSelecionar(e.target.checked)} />}
        <div className="min-w-0 flex-1 basis-full sm:basis-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><span className="text-[15px] font-bold text-slate-900">{titulo}</span>{subtitulo && <span className="text-[12px] text-slate-500">{subtitulo}</span>}</div>
          {chips && <div className="mt-1 flex flex-wrap gap-1">{chips}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">{direita}
          {contagem !== undefined && <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-[11px] font-bold text-white">{contagem} {contagem === 1 ? 'item' : 'itens'}</span>}
          <button onClick={() => setOpen(o => !o)} className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100"><ChevronDown size={16} className={cx('transition', !open && '-rotate-90')} /></button>
        </div>
      </header>
      {open && <div className="divide-y divide-slate-100 border-t border-slate-100">{children}</div>}
    </section>
  )
}

/**
 * Marca de demanda reagendada. É badge, e não uma nota discreta no rodapé do card:
 * "não deu para fazer e voltou" é a informação que muda a decisão do PCM ao montar o
 * próximo roteiro, e antes ela se perdia no meio dos detalhes.
 */
export function BadgeReagendada({ d, completo }: { d: Pick<Demanda, 'data_reagendada' | 'data_planejada' | 'pendente_desde'>; completo?: boolean }) {
  // A espera é a informação que decide prioridade: "reagendada" sozinho não distingue
  // a que falhou ontem da que está sendo empurrada há duas semanas.
  const espera = rotuloEspera(d.pendente_desde)
  const data = d.data_reagendada ?? d.data_planejada
  return (
    <Badge tone="bg-orange-100 text-orange-800 ring-orange-300">
      <RotateCcw size={10} className="mr-0.5 inline" />REAGENDADA
      {espera && espera !== 'hoje' ? ` · ${espera}` : ''}
      {completo && data ? ` · para ${fmtData(data)}` : ''}
    </Badge>
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

/** Largura mínima em que uma coluna ainda é legível. Abaixo disso o card quebra feio. */
const COLUNA_MIN = 258

/**
 * Altura útil do quadro no desktop: da borda de cima do quadro até o fim da janela.
 * Medida, não chutada — o cabeçalho da página cresce quando os filtros quebram linha,
 * e um número fixo deixaria a última coluna cortada ou sobrando.
 *
 * `100dvh` (e não `100vh`) porque no celular a barra do navegador entra e sai da tela.
 * No celular a altura não é travada: a coluna cresce e quem rola é a página.
 */
function useAlturaQuadro(ref: React.RefObject<HTMLDivElement | null>) {
  const [altura, setAltura] = useState<string | undefined>(undefined)

  const medir = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (!window.matchMedia('(min-width: 768px)').matches) { setAltura(a => (a === undefined ? a : undefined)); return }
    const topo = Math.round(el.getBoundingClientRect().top + window.scrollY)
    const nova = `max(320px, calc(100dvh - ${topo + 16}px))`
    setAltura(a => (a === nova ? a : nova))
  }, [ref])

  useLayoutEffect(() => {
    medir()
    window.addEventListener('resize', medir)
    // O cabeçalho da página muda de altura quando os filtros quebram linha.
    const anterior = ref.current?.previousElementSibling
    const ro = anterior ? new ResizeObserver(medir) : null
    if (anterior && ro) ro.observe(anterior)
    return () => { window.removeEventListener('resize', medir); ro?.disconnect() }
  }, [medir, ref])

  return altura
}

export function Quadro<T extends { id: string }>({ colunas, renderItem, onMover, larguraColuna = 300, podeArrastar = true, renderGrupo, vazio }: {
  colunas: Coluna<T>[]
  renderItem(item: T, arrastando: boolean): ReactNode
  /** Chamado ao soltar: item, coluna de origem, coluna de destino, índice de destino. */
  onMover(item: T, de: string, para: string, indice: number): void | Promise<void>
  /** Largura máxima da coluna. Em tela estreita ela encolhe até `COLUNA_MIN`. */
  larguraColuna?: number
  podeArrastar?: boolean
  /** Opcional: agrupa itens da coluna em blocos (ex.: por data) — devolve [chave, rótulo] por item. */
  renderGrupo?(chave: string, itens: T[], colunaId: string): ReactNode
  /** Texto do balão de "solte aqui" quando a coluna está vazia. */
  vazio?: string
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [ativo, setAtivo] = useState<T | null>(null)
  const [ocultarVazias, setOcultarVazias] = useState(false)
  const refRolagem = useRef<HTMLDivElement>(null)
  const altura = useAlturaQuadro(refRolagem)

  const vazias = colunas.filter(c => c.itens.length === 0).length
  // Uma coluna vazia continua visível enquanto se arrasta: é destino legítimo.
  const visiveis = ocultarVazias && !ativo ? colunas.filter(c => c.itens.length > 0) : colunas

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

  const irPara = (id: string) => {
    refRolagem.current?.querySelector(`[data-coluna="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      {/* Atalhos das colunas: no celular só cabe uma por vez, então a lista serve de índice. */}
      <div className="mb-2 flex items-center gap-2 print:hidden">
        <div className="rolagem-fina -mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1 pb-1 md:hidden">
          {visiveis.map(c => (
            <button key={c.id} onClick={() => irPara(c.id)}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
              {c.cor && <span className="h-2 w-2 rounded-full" style={{ background: c.cor }} />}
              {c.titulo}
              <span className="rounded-full bg-slate-100 px-1.5 tabular-nums">{c.itens.length}</span>
            </button>
          ))}
        </div>
        <div className="hidden flex-1 md:block" />
        {vazias > 0 && (
          <button onClick={() => setOcultarVazias(v => !v)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[11.5px] font-medium text-slate-600 ring-1 ring-slate-200 transition hover:text-slate-900">
            {ocultarVazias ? <><Eye size={13} />Mostrar {vazias} vazia(s)</> : <><EyeOff size={13} />Ocultar {vazias} vazia(s)</>}
          </button>
        )}
      </div>

      <div ref={refRolagem} style={altura ? { height: altura } : undefined}
        className="rolagem-fina flex gap-3 overflow-x-auto pb-3 max-md:snap-x max-md:snap-mandatory">
        {visiveis.map(c => <ColunaQuadro key={c.id} coluna={c} largura={larguraColuna} renderItem={renderItem} podeArrastar={podeArrastar} renderGrupo={renderGrupo} vazio={vazio} />)}
      </div>

      <DragOverlay>{ativo ? <div className="w-[280px] rounded-lg bg-white shadow-2xl ring-2 ring-acao-500">{renderItem(ativo, true)}</div> : null}</DragOverlay>
    </DndContext>
  )
}

function ColunaQuadro<T extends { id: string }>({ coluna, largura, renderItem, podeArrastar, renderGrupo, vazio }: { coluna: Coluna<T>; largura: number; renderItem(i: T, a: boolean): ReactNode; podeArrastar: boolean; renderGrupo?(chave: string, itens: T[], colunaId: string): ReactNode; vazio?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: coluna.id })
  return (
    <div ref={setNodeRef} data-coluna={coluna.id}
      className={cx('flex h-full shrink-0 snap-start flex-col rounded-xl border bg-slate-100/70 transition max-md:max-h-[70dvh]', isOver ? 'border-acao-500 bg-blue-50/60' : 'border-slate-200')}
      // Encolhe junto com a tela em vez de forçar rolagem horizontal do quadro inteiro.
      style={{ width: `clamp(${COLUNA_MIN}px, 84vw, ${largura}px)` }}>
      <div className="flex items-center justify-between gap-2 rounded-t-xl border-b border-slate-200/70 bg-slate-100/70 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-slate-600">
          {coluna.cor && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: coluna.cor }} />}
          <span className="truncate">{coluna.titulo}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">{coluna.cabecalhoExtra}<span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-600 ring-1 ring-slate-200">{coluna.itens.length}</span></div>
      </div>
      <SortableContext items={coluna.itens.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <div className="rolagem-fina flex-1 space-y-2 overflow-y-auto px-2 py-2">
          {coluna.itens.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-[11px] text-slate-400">{vazio ?? 'Solte aqui'}</div>}
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
    <div ref={setNodeRef} style={{ transform: CSSdnd.Transform.toString(transform), transition }} {...attributes} {...listeners}
      className={cx('touch-manipulation rounded-lg bg-white shadow-sm ring-1 ring-slate-200', !desabilitado && 'cursor-grab active:cursor-grabbing', isDragging && 'opacity-40')}>
      {children}
    </div>
  )
}
