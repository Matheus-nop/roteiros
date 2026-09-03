import { ArrowRight, Plus, Upload, Pencil, Send, Copy, XCircle, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { BarraFiltros } from '../components/Filtros'
import { ModalEditarDemanda, ModalNovaDemanda } from '../components/FormDemanda'
import { ModalImportar } from '../components/ModalImportar'
import { BarraSelecao, TabelaDemandas } from '../components/TabelaDemandas'
import { Botao, Confirmar, Pagina, Select } from '../components/ui'
import { STATUS_FILA, STATUS_LABEL, TIPOS, TRIAGEM_ORDEM, proximaTriagem } from '../lib/status'
import { textoBusca, normalizar } from '../lib/format'
import { chaveIdentidade } from '../lib/actions'
import type { Demanda, Status } from '../lib/types'

export function Fila() {
  const { demandas, acoes } = useData()
  const { pode } = useAuth()
  const { toast, erro } = useToast()
  const [params, setParams] = useSearchParams()
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState<string>('')
  const [tipo, setTipo] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [nova, setNova] = useState(false)
  const [importar, setImportar] = useState(false)
  const [editando, setEditando] = useState<Demanda | null>(null)
  const [cancelar, setCancelar] = useState<string[] | null>(null)
  const auditar = params.get('auditar') === '1'

  const fila = useMemo(() => demandas.filter(d => STATUS_FILA.includes(d.status)), [demandas])
  const duplicatas = useMemo(() => {
    const m = new Map<string, Demanda[]>()
    for (const d of fila) { const k = chaveIdentidade(d); m.set(k, [...(m.get(k) ?? []), d]) }
    return new Set(Array.from(m.values()).filter(a => a.length > 1).flat().map(d => d.id))
  }, [fila])

  const itens = useMemo(() => {
    const b = normalizar(busca)
    return fila
      .filter(d => !status || d.status === status)
      .filter(d => !tipo || d.tipo === tipo)
      .filter(d => !auditar || duplicatas.has(d.id))
      .filter(d => !b || textoBusca(d).includes(b))
      .sort((a, b) => (a.data_abertura ?? '').localeCompare(b.data_abertura ?? '') || a.numero - b.numero)
  }, [fila, status, tipo, busca, auditar, duplicatas])

  const contagem = useMemo(() => Object.fromEntries(TRIAGEM_ORDEM.map(s => [s, fila.filter(d => d.status === s).length])), [fila])
  const ids = Array.from(sel)
  const limpar = () => setSel(new Set())
  const run = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast(msg); limpar() } catch (e) { erro(e) } }

  return (
    <Pagina titulo="Fila" subtitulo={`${fila.length} demanda(s) aguardando triagem/planejamento`} acoes={<>
      {pode('fila.lancar') && <Botao onClick={() => setImportar(true)}><Upload size={14} />Importar</Botao>}
      {pode('fila.lancar') && <Botao variante="primario" onClick={() => setNova(true)}><Plus size={14} />Nova demanda</Botao>}
    </>}>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <button onClick={() => setStatus('')} className={'rounded-full px-3 py-1 text-xs font-medium ring-1 ' + (!status ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50')}>Todas ({fila.length})</button>
        {TRIAGEM_ORDEM.map(s => (
          <button key={s} onClick={() => setStatus(s === status ? '' : s)} className={'rounded-full px-3 py-1 text-xs font-medium ring-1 ' + (status === s ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50')}>{STATUS_LABEL[s]} ({contagem[s]})</button>
        ))}
      </div>
      <BarraFiltros busca={busca} setBusca={setBusca}>
        <Select value={tipo} onChange={e => setTipo(e.target.value)} className="w-44"><option value="">Todos os tipos</option>{TIPOS.map(t => <option key={t}>{t}</option>)}</Select>
        <Botao variante={auditar ? 'primario' : 'secundario'} onClick={() => setParams(auditar ? {} : { auditar: '1' })} title="Mostrar só possíveis duplicatas (mesmo equipamento + patrimônio + OM + cliente)">
          <Search size={14} />Auditar duplicatas{duplicatas.size ? ` (${duplicatas.size})` : ''}
        </Botao>
      </BarraFiltros>

      <TabelaDemandas itens={itens} colunas={['sel', 'om', 'cliente', 'tipo', 'equipamento', 'patrimonio', 'abertura', 'status', 'obs', 'acoes']}
        selecionados={sel} onSelecionar={setSel}
        vazio={auditar ? 'Nenhuma duplicata na fila.' : 'Fila vazia.'}
        acoes={d => <>
          {duplicatas.has(d.id) && <span title="Possível duplicata" className="mr-1 text-amber-600"><Copy size={14} /></span>}
          {pode('fila.triar') && proximaTriagem(d.status) && <Botao tamanho="sm" variante="fantasma" title={`Avançar para ${STATUS_LABEL[proximaTriagem(d.status)!]}`} onClick={() => run(() => acoes.avancarTriagem(d), `→ ${STATUS_LABEL[proximaTriagem(d.status)!]}`)}><ArrowRight size={14} /></Botao>}
          {pode('fila.enviar_planejamento') && <Botao tamanho="sm" variante="fantasma" title="Enviar ao planejamento" onClick={() => run(() => acoes.enviarParaPlanejamento([d.id]), 'Enviada ao planejamento.')}><Send size={14} /></Botao>}
          {pode('fila.lancar') && <Botao tamanho="sm" variante="fantasma" title="Editar" onClick={() => setEditando(d)}><Pencil size={14} /></Botao>}
          {pode('fila.triar') && <Botao tamanho="sm" variante="fantasma" title="Cancelar" onClick={() => setCancelar([d.id])}><XCircle size={14} className="text-red-600" /></Botao>}
        </>}
      />

      <BarraSelecao n={ids.length} onLimpar={limpar}>
        {pode('fila.triar') && <Select className="!w-48 !py-1 !text-xs" value="" onChange={e => { if (e.target.value) run(() => acoes.definirStatus(ids, e.target.value as Status), 'Status aplicado.') }}>
          <option value="">Mudar status…</option>{TRIAGEM_ORDEM.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>}
        {pode('fila.enviar_planejamento') && <Botao tamanho="sm" variante="primario" onClick={() => run(() => acoes.enviarParaPlanejamento(ids), `${ids.length} enviada(s) ao planejamento.`)}><Send size={13} />Enviar ao planejamento</Botao>}
        {pode('fila.triar') && <Botao tamanho="sm" variante="perigo" onClick={() => setCancelar(ids)}>Cancelar</Botao>}
      </BarraSelecao>

      <ModalNovaDemanda aberto={nova} onFechar={() => setNova(false)} />
      <ModalImportar aberto={importar} onFechar={() => setImportar(false)} />
      <ModalEditarDemanda d={editando} onFechar={() => setEditando(null)} />
      <Confirmar aberto={!!cancelar} titulo="Cancelar demanda(s)" perigo confirmarTexto="Cancelar demanda(s)" onFechar={() => setCancelar(null)}
        texto={<>Cancelar {cancelar?.length} demanda(s)? Elas saem das telas ativas, mas ficam no histórico e podem ser restauradas.</>}
        onConfirmar={() => { const c = cancelar!; setCancelar(null); run(() => acoes.cancelar(c, null), 'Cancelada(s).') }} />
    </Pagina>
  )
}
