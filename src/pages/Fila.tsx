// Fila em modo kanban: colunas por etapa da triagem, arrastar entre colunas muda o status.
import { ArrowRight, Upload, Pencil, Send, Copy, XCircle, Search, LayoutGrid, List, Plus, FileStack } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { ModalEditarDemanda, ModalNovaDemanda } from '../components/FormDemanda'
import { ModalImportar } from '../components/ModalImportar'
import { ModalImportarContrato } from '../components/ModalImportarContrato'
import { BarraSelecao } from '../components/TabelaDemandas'
import { CardDemanda, Chip, GrupoCard, LocalData, Quadro, type Coluna } from '../components/Cards'
import { Botao, Confirmar, Input, Pagina, Select, cx } from '../components/ui'
import { STATUS_FILA, STATUS_LABEL, TIPOS, TRIAGEM_ORDEM, proximaTriagem } from '../lib/status'
import { textoBusca, normalizar, agrupar, chaveParada } from '../lib/format'
import { chaveIdentidade } from '../lib/actions'
import type { Demanda, Status } from '../lib/types'

const COR_COLUNA: Record<string, string> = { FILA: '#94a3b8', AGUARDANDO_TRIAGEM: '#64748b', EM_ANALISE: '#d97706', PRONTO_PARA_PLANEJAR: '#0284c7', ENCAMINHADO: '#0f766e' }

export function Fila() {
  const { demandas, acoes } = useData()
  const { pode } = useAuth()
  const { toast, erro } = useToast()
  const [params, setParams] = useSearchParams()
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('')
  const [visao, setVisao] = useState<'kanban' | 'lista'>(() => (localStorage.getItem('fila-visao') as 'kanban' | 'lista') || 'kanban')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [nova, setNova] = useState(false)
  const [importar, setImportar] = useState(false)
  const [contrato, setContrato] = useState(false)
  const [editando, setEditando] = useState<Demanda | null>(null)
  const [cancelar, setCancelar] = useState<string[] | null>(null)
  const auditar = params.get('auditar') === '1'
  const triar = pode('fila.triar')

  const fila = useMemo(() => demandas.filter(d => STATUS_FILA.includes(d.status)), [demandas])
  const duplicatas = useMemo(() => {
    const m = new Map<string, Demanda[]>()
    for (const d of fila) { const k = chaveIdentidade(d); m.set(k, [...(m.get(k) ?? []), d]) }
    return new Set(Array.from(m.values()).filter(a => a.length > 1).flat().map(d => d.id))
  }, [fila])
  const itens = useMemo(() => {
    const b = normalizar(busca)
    return fila.filter(d => (!tipo || d.tipo === tipo) && (!auditar || duplicatas.has(d.id)) && (!b || textoBusca(d).includes(b)))
      .sort((a, b) => (a.data_abertura ?? '').localeCompare(b.data_abertura ?? '') || a.numero - b.numero)
  }, [fila, tipo, busca, auditar, duplicatas])

  const ids = Array.from(sel)
  const limpar = () => setSel(new Set())
  const run = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast(msg); limpar() } catch (e) { erro(e) } }
  const toggle = (id: string, v: boolean) => setSel(s => { const n = new Set(s); v ? n.add(id) : n.delete(id); return n })
  const mudarVisao = (v: 'kanban' | 'lista') => { setVisao(v); localStorage.setItem('fila-visao', v) }

  const acoesItem = (d: Demanda) => <>
    {duplicatas.has(d.id) && <span title="Possível duplicata" className="text-amber-600"><Copy size={13} /></span>}
    {triar && proximaTriagem(d.status) && <Botao tamanho="sm" variante="fantasma" title={`Avançar para ${STATUS_LABEL[proximaTriagem(d.status)!]}`} onClick={() => run(() => acoes.avancarTriagem(d), `→ ${STATUS_LABEL[proximaTriagem(d.status)!]}`)}><ArrowRight size={13} /></Botao>}
    {pode('fila.enviar_planejamento') && <Botao tamanho="sm" variante="fantasma" title="Enviar ao planejamento" onClick={() => run(() => acoes.enviarParaPlanejamento([d.id]), 'Enviada ao planejamento.')}><Send size={13} /></Botao>}
    {pode('fila.lancar') && <Botao tamanho="sm" variante="fantasma" title="Editar" onClick={() => setEditando(d)}><Pencil size={13} /></Botao>}
    {triar && <Botao tamanho="sm" variante="fantasma" title="Cancelar" onClick={() => setCancelar([d.id])}><XCircle size={13} className="text-red-600" /></Botao>}
  </>

  const colunas: Coluna<Demanda>[] = TRIAGEM_ORDEM.map(s => ({ id: s, titulo: STATUS_LABEL[s], cor: COR_COLUNA[s], itens: itens.filter(d => d.status === s) }))
  const prontos = itens.filter(d => d.status === 'PRONTO_PARA_PLANEJAR' || d.status === 'ENCAMINHADO')

  return (
    <Pagina titulo="Fila operacional" subtitulo={`${fila.length} demandas aguardando triagem ou envio ao planejamento · arraste um card para outra coluna para avançar a etapa`} acoes={<>
      <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-300">
        <button onClick={() => mudarVisao('kanban')} className={cx('flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium', visao === 'kanban' ? 'bg-[#1a56db] text-white' : 'bg-white text-slate-600')}><LayoutGrid size={13} />Kanban</button>
        <button onClick={() => mudarVisao('lista')} className={cx('flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium', visao === 'lista' ? 'bg-[#1a56db] text-white' : 'bg-white text-slate-600')}><List size={13} />Por parada</button>
      </div>
      {pode('fila.lancar') && <Botao onClick={() => setImportar(true)} title="Colar linhas de planilha (uma demanda por linha)"><Upload size={14} />Importar planilha</Botao>}
      {pode('fila.lancar') && <Botao onClick={() => setContrato(true)} title="Contrato com quantidade e blocos de patrimônio"><FileStack size={14} />Importar contrato</Botao>}
      <Botao variante={auditar ? 'primario' : 'secundario'} onClick={() => setParams(auditar ? {} : { auditar: '1' })} title="Mostrar só possíveis duplicatas (mesmo equipamento + patrimônio + OM + cliente)"><Search size={14} />Auditar{duplicatas.size ? ` (${duplicatas.size})` : ''}</Botao>
      {pode('fila.enviar_planejamento') && <Botao variante="sucesso" disabled={!prontos.length} onClick={() => run(() => acoes.enviarParaPlanejamento(prontos.map(d => d.id)), `${prontos.length} enviada(s) ao planejamento.`)} title="Envia ao planejamento todos os itens prontos para planejar e encaminhados"><Send size={14} />Enviar prontos ({prontos.length})</Botao>}
      {pode('fila.lancar') && <Botao variante="primario" onClick={() => setNova(true)}><Plus size={14} />Lançar demanda</Botao>}
    </>}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[260px]"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por cliente, local, equipamento, OS ou patrimônio…" className="pl-8" /></div>
        <Select value={tipo} onChange={e => setTipo(e.target.value)} className="w-52"><option value="">Todos os tipos</option>{TIPOS.map(t => <option key={t}>{t}</option>)}</Select>
      </div>

      {visao === 'kanban' ? (
        <Quadro colunas={colunas} larguraColuna={320} podeArrastar={triar}
          onMover={async (d, _de, para) => { if (para !== d.status) await run(() => acoes.definirStatus([d.id], para as Status), `→ ${STATUS_LABEL[para as Status]}`) }}
          renderItem={(d) => <CardDemanda d={d} vertical mostrarCliente mostrarStatus={false} selecionado={sel.has(d.id)} onSelecionar={v => toggle(d.id, v)} acoes={acoesItem(d)} />}
        />
      ) : (
        <div className="space-y-3">
          {itens.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">{auditar ? 'Nenhuma duplicata na fila.' : 'Fila vazia.'}</div>}
          {Array.from(agrupar(itens, chaveParada).values()).map(grupo => {
            const g0 = grupo[0]
            const porTipo = agrupar(grupo, d => d.tipo); const porStatus = agrupar(grupo, d => d.status)
            const todos = grupo.every(d => sel.has(d.id))
            return (
              <GrupoCard key={chaveParada(g0)} titulo={g0.cliente_nome ?? 'Sem cliente'} subtitulo={<LocalData local={g0.local} data={g0.data_abertura} />} contagem={grupo.length}
                selecionado={todos} onSelecionar={v => setSel(s => { const n = new Set(s); grupo.forEach(d => v ? n.add(d.id) : n.delete(d.id)); return n })}
                chips={<>{Array.from(porTipo).map(([t, l]) => <Chip key={t} tone="bg-violet-50 text-violet-800">{l.length} {t}</Chip>)}{Array.from(porStatus).map(([s, l]) => <Chip key={s} tone="bg-blue-50 text-blue-800">{l.length} {STATUS_LABEL[s]}</Chip>)}</>}>
                {grupo.map(d => <CardDemanda key={d.id} d={d} selecionado={sel.has(d.id)} onSelecionar={v => toggle(d.id, v)} acoes={acoesItem(d)} onClick={pode('fila.lancar') ? () => setEditando(d) : undefined} />)}
              </GrupoCard>
            )
          })}
        </div>
      )}

      <BarraSelecao n={ids.length} onLimpar={limpar}>
        {triar && <Select className="!w-48 !py-1 !text-xs" value="" onChange={e => { if (e.target.value) run(() => acoes.definirStatus(ids, e.target.value as Status), 'Status aplicado.') }}>
          <option value="">Mudar status…</option>{TRIAGEM_ORDEM.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>}
        {pode('fila.enviar_planejamento') && <Botao tamanho="sm" variante="primario" onClick={() => run(() => acoes.enviarParaPlanejamento(ids), `${ids.length} enviada(s) ao planejamento.`)}><Send size={13} />Enviar ao planejamento</Botao>}
        {triar && <Botao tamanho="sm" variante="perigo" onClick={() => setCancelar(ids)}>Cancelar</Botao>}
      </BarraSelecao>

      <ModalNovaDemanda aberto={nova} onFechar={() => setNova(false)} />
      <ModalImportar aberto={importar} onFechar={() => setImportar(false)} />
      <ModalImportarContrato aberto={contrato} onFechar={() => setContrato(false)} />
      <ModalEditarDemanda d={editando} onFechar={() => setEditando(null)} />
      <Confirmar aberto={!!cancelar} titulo="Cancelar demanda(s)" perigo confirmarTexto="Cancelar demanda(s)" onFechar={() => setCancelar(null)}
        texto={<>Cancelar {cancelar?.length} demanda(s)? Elas saem das telas ativas, mas ficam no histórico e podem ser restauradas.</>}
        onConfirmar={() => { const c = cancelar!; setCancelar(null); run(() => acoes.cancelar(c, null), 'Cancelada(s).') }} />
    </Pagina>
  )
}
