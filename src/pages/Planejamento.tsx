// Planejamento em kanban. A coluna é escolhida pelo PCM:
//
//   • por técnico    — a visão de sempre: arrastar um card para outra coluna atribui o técnico,
//                      e dentro da mesma data arrastar reordena as paradas.
//   • por cliente    — todas as demandas do mesmo cliente lado a lado, para fechar uma visita só.
//   • por localidade — o mesmo pela região, para não mandar dois técnicos ao mesmo bairro.
//
// Nas visões por cliente/localidade não se arrasta: soltar um card em outra coluna significaria
// trocar o cliente da demanda, que não é decisão de planejamento. Lá se seleciona e se atribui em lote.
import { Pencil, Undo2, UserCog, Route, XCircle, Printer, CalendarDays, Search, Users, Building2, MapPin, CheckSquare } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { ModalAtribuir } from '../components/ModalAtribuir'
import { ModalEditarDemanda } from '../components/FormDemanda'
import { BarraSelecao } from '../components/TabelaDemandas'
import { CardDemanda, ItemArrastavel, Quadro, type Coluna } from '../components/Cards'
import { Botao, Confirmar, Input, Pagina, Select, cx } from '../components/ui'
import { STATUS_PLANEJAMENTO, STATUS_LABEL, STATUS_A_ROTEIRIZAR } from '../lib/status'
import { normalizar, textoBusca, agrupar, ordenarParadas, rotuloData, hojeISO } from '../lib/format'
import { usePrint } from '../components/Print'
import { FolhaRoteiro } from '../components/Etiqueta'
import type { Demanda, Status, Tecnico } from '../lib/types'

type Agrupamento = 'tecnico' | 'cliente' | 'local'

const VISOES: { id: Agrupamento; rotulo: string; icone: typeof Users }[] = [
  { id: 'tecnico', rotulo: 'Técnico', icone: Users },
  { id: 'cliente', rotulo: 'Cliente', icone: Building2 },
  { id: 'local', rotulo: 'Localidade', icone: MapPin },
]

export function Planejamento() {
  const { demandas, tecnicos, acoes } = useData()
  const { pode } = useAuth()
  const { toast, erro } = useToast()
  const { imprimir } = usePrint()
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('')
  const [dataFiltro, setDataFiltro] = useState('')
  const [agrupamento, setAgrupamento] = useState<Agrupamento>(() => (localStorage.getItem('plan-agrupar') as Agrupamento) || 'tecnico')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [atribuir, setAtribuir] = useState<Demanda[] | null>(null)
  const [editando, setEditando] = useState<Demanda | null>(null)
  const [confirmar, setConfirmar] = useState<{ titulo: string; texto: string; fn(): Promise<unknown>; msg: string; perigo?: boolean } | null>(null)
  const editar = pode('planejamento.editar')
  const porTecnico = agrupamento === 'tecnico'

  const escolherVisao = (v: Agrupamento) => { setAgrupamento(v); localStorage.setItem('plan-agrupar', v) }

  const itens = useMemo(() => {
    const b = normalizar(busca)
    return demandas.filter(d => STATUS_PLANEJAMENTO.includes(d.status) && (!status || d.status === status) && (!dataFiltro || d.data_planejada === dataFiltro) && (!b || textoBusca(d).includes(b)))
  }, [demandas, busca, status, dataFiltro])

  const colunas: Coluna<Demanda>[] = useMemo(() => {
    const ordenar = (l: Demanda[]) => [...l].sort((a, b) => (a.data_planejada ?? '9999').localeCompare(b.data_planejada ?? '9999') || ordenarParadas(a, b))

    if (porTecnico) {
      const cols: Coluna<Demanda>[] = [{ id: '__sem', titulo: 'Sem técnico', cor: '#94a3b8', itens: ordenar(itens.filter(d => !d.tecnico_id)) }]
      for (const t of tecnicos.filter(t => t.ativo || itens.some(d => d.tecnico_id === t.id))) {
        cols.push({ id: t.id, titulo: t.nome, cor: t.cor ?? '#64748b', itens: ordenar(itens.filter(d => d.tecnico_id === t.id)) })
      }
      return cols
    }

    // Cliente / localidade: a chave normalizada agrupa "AEGEA" e "Aegea " na mesma coluna,
    // mas o título mostra o texto como está no cadastro.
    const campo = (d: Demanda) => (agrupamento === 'cliente' ? d.cliente_nome : d.local)
    const grupos = agrupar(itens, d => normalizar(campo(d)) || '__sem')
    return Array.from(grupos.entries())
      .map(([chave, lista]) => ({
        id: chave,
        titulo: chave === '__sem' ? (agrupamento === 'cliente' ? 'Sem cliente' : 'Sem localidade') : (campo(lista[0]) ?? chave),
        cor: chave === '__sem' ? '#94a3b8' : undefined,
        itens: ordenar(lista),
      }))
      // Maior volume primeiro: é onde há consolidação a fazer. "Sem X" vai para o fim.
      .sort((a, b) => (a.id === '__sem' ? 1 : b.id === '__sem' ? -1 : 0) || b.itens.length - a.itens.length || String(a.titulo).localeCompare(String(b.titulo)))
  }, [itens, tecnicos, agrupamento, porTecnico])

  const ids = Array.from(sel)
  const limpar = () => setSel(new Set())
  const run = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast(msg); limpar() } catch (e) { erro(e) } }
  const toggle = (id: string, v: boolean) => setSel(s => { const n = new Set(s); v ? n.add(id) : n.delete(id); return n })
  const selecionarTodos = (lista: Demanda[]) => setSel(s => {
    const n = new Set(s)
    const todosJa = lista.every(d => n.has(d.id))
    for (const d of lista) todosJa ? n.delete(d.id) : n.add(d.id)
    return n
  })

  const gerar = (its: Demanda[], rotulo: string) => {
    const aptos = its.filter(d => STATUS_A_ROTEIRIZAR.includes(d.status))
    if (!aptos.length) { toast('Nada a roteirizar neste grupo.', 'info'); return }
    setConfirmar({ titulo: 'Gerar roteiro', texto: `Roteirizar ${aptos.length} item(ns) de ${rotulo}? A ordem manual das paradas é mantida.`, fn: () => acoes.gerarRoteiro(its), msg: 'Roteiro gerado.' })
  }
  const gerarTodos = () => {
    const grupos = Array.from(agrupar(itens.filter(d => d.tecnico_id && d.data_planejada && STATUS_A_ROTEIRIZAR.includes(d.status)), d => `${d.tecnico_id}|${d.data_planejada}`).values())
    const n = grupos.reduce((s, g) => s + g.length, 0)
    if (!n) { toast('Nenhum item com técnico e data para roteirizar.', 'info'); return }
    setConfirmar({ titulo: 'Gerar todos os roteiros', texto: `Roteirizar ${n} item(ns) com técnico e data definidos?`, msg: 'Roteiros gerados.',
      fn: async () => { for (const g of grupos) { const irm = itens.filter(d => d.tecnico_id === g[0].tecnico_id && d.data_planejada === g[0].data_planejada); await acoes.gerarRoteiro(irm) } } })
  }

  const onMover = async (d: Demanda, de: string, para: string, indice: number) => {
    if (!editar || !porTecnico) return
    try {
      if (de !== para) {
        await acoes.atribuir([d.id], { tecnico_id: para === '__sem' ? null : para })
        toast(para === '__sem' ? 'Técnico removido.' : `Atribuída a ${tecnicos.find(t => t.id === para)?.nome}.`)
        return
      }
      // reordenar dentro do mesmo grupo de data
      const col = colunas.find(c => c.id === para)!
      const grupo = col.itens.filter(x => x.data_planejada === d.data_planejada && x.id !== d.id)
      const alvo = col.itens[indice]
      const pos = alvo && alvo.data_planejada === d.data_planejada ? grupo.findIndex(x => x.id === alvo.id) : grupo.length
      const nova = [...grupo]; nova.splice(pos < 0 ? grupo.length : pos, 0, d)
      await acoes.reordenar(nova.map(x => x.id))
    } catch (e) { erro(e) }
  }

  const acoesItem = (d: Demanda) => <>
    {editar && <Botao tamanho="sm" variante="fantasma" title="Técnico / veículo / data" onClick={() => setAtribuir([d])}><UserCog size={13} /></Botao>}
    {editar && <Botao tamanho="sm" variante="fantasma" title="Editar dados" onClick={() => setEditando(d)}><Pencil size={13} /></Botao>}
    {editar && <Botao tamanho="sm" variante="fantasma" title="Devolver à fila" onClick={() => setConfirmar({ titulo: 'Devolver à fila', texto: 'Devolver esta demanda à fila? Técnico, veículo e data serão limpos.', fn: () => acoes.devolverParaFila([d.id]), msg: 'Devolvida à fila.' })}><Undo2 size={13} /></Botao>}
    {editar && <Botao tamanho="sm" variante="fantasma" title="Cancelar demanda" onClick={() => setConfirmar({ titulo: 'Cancelar demanda', texto: 'Cancelar esta demanda? Ela sai das telas ativas e fica no histórico (restaurável).', fn: () => acoes.cancelar([d.id], null), msg: 'Cancelada.', perigo: true })}><XCircle size={13} className="text-red-600" /></Botao>}
  </>

  /** Chip do técnico: só aparece quando a coluna não é o técnico — senão seria repetir o cabeçalho. */
  const chipTecnico = (t: Tecnico | undefined) => (
    <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: t?.cor ?? '#cbd5e1' }} />{t?.nome ?? 'sem técnico'}
    </span>
  )

  const renderGrupo = (_k: string, lista: Demanda[], colunaId: string) => {
    const porData = Array.from(agrupar(lista, d => d.data_planejada ?? '').entries()).sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
    const tec = porTecnico ? tecnicos.find(t => t.id === colunaId) : undefined
    return <>
      {porData.map(([data, its]) => {
        const aRot = its.filter(d => STATUS_A_ROTEIRIZAR.includes(d.status)).length
        const atrasada = data && data < hojeISO()
        return (
          <div key={data || 'sem'} className="space-y-1.5">
            <div className={cx('sticky top-0 z-10 flex items-center justify-between rounded-md px-2 py-1 text-[11px] font-bold', atrasada ? 'bg-red-100 text-red-700' : !data ? 'bg-slate-200/90 text-slate-500' : 'bg-slate-200/90 text-slate-700')}>
              <span className="inline-flex items-center gap-1"><CalendarDays size={11} />{rotuloData(data || null)} · {its.length}</span>
              <span className="flex items-center gap-0.5">
                {editar && <button className="rounded p-0.5 hover:bg-white" title="Selecionar / desmarcar este grupo" onClick={() => selecionarTodos(its)}><CheckSquare size={12} /></button>}
                {porTecnico && <button className="rounded p-0.5 hover:bg-white" title="Imprimir lista" onClick={() => imprimir(<FolhaRoteiro tecnico={tec} data={data} itens={[...its].sort(ordenarParadas)} />)}><Printer size={12} /></button>}
                {editar && porTecnico && tec && data && aRot > 0 && <button className="rounded bg-acao-500 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-acao-600" onClick={() => gerar(its, `${tec.nome} em ${rotuloData(data)}`)}><Route size={10} className="mr-0.5 inline" />Gerar ({aRot})</button>}
              </span>
            </div>
            {its.map(d => (
              <ItemArrastavel key={d.id} id={d.id} desabilitado={!editar || !porTecnico}>
                <CardDemanda d={d} vertical mostrarCliente cabecalho={porTecnico ? 'ambos' : agrupamento === 'cliente' ? 'local' : 'cliente'}
                  selecionado={sel.has(d.id)} onSelecionar={v => toggle(d.id, v)} acoes={acoesItem(d)}
                  extra={<>
                    {!porTecnico && chipTecnico(tecnicos.find(t => t.id === d.tecnico_id))}
                    {d.ordem_parada ? <span className="ml-1 text-[10px] font-bold text-slate-400">parada {d.ordem_parada / 10}</span> : null}
                  </>} />
              </ItemArrastavel>
            ))}
          </div>
        )
      })}
    </>
  }

  // A instrução comprida é útil, mas no celular empurraria o quadro para fora da tela.
  const subtitulo = porTecnico
    ? <>{itens.length} demandas · uma coluna por técnico<span className="hidden md:inline"> · arraste um card para outra coluna para atribuir o técnico; dentro da mesma data, arraste para definir a ordem das paradas</span></>
    : <>{itens.length} demandas em {colunas.length} {agrupamento === 'cliente' ? 'cliente(s)' : 'localidade(s)'}<span className="hidden md:inline"> · marque os cards e use "Técnico / veículo / data" para fechar tudo de uma vez</span></>

  return (
    <Pagina titulo="Planejamento (PCM)" subtitulo={subtitulo} acoes={<>
      {/* Seletor de visão: muda só o que vira coluna, os filtros e a seleção continuam valendo. */}
      <div className="flex rounded-lg bg-slate-200/70 p-0.5">
        {VISOES.map(v => (
          <button key={v.id} onClick={() => escolherVisao(v.id)} title={`Agrupar por ${v.rotulo.toLowerCase()}`}
            className={cx('flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition',
              agrupamento === v.id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>
            <v.icone size={13} /><span className="hidden sm:inline">{v.rotulo}</span>
          </button>
        ))}
      </div>
      {editar && porTecnico && <Botao variante="primario" onClick={gerarTodos}><Route size={14} />Gerar todos os roteiros</Botao>}
    </>}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por OS, cliente, local ou equipamento…" className="pl-8" /></div>
        <Select value={status} onChange={e => setStatus(e.target.value)} className="w-44"><option value="">Todos os status</option>{STATUS_PLANEJAMENTO.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select>
        <Input type="date" value={dataFiltro} onChange={e => setDataFiltro(e.target.value)} className="w-40" title="Filtrar por data planejada" />
        {dataFiltro && <Botao tamanho="sm" variante="fantasma" onClick={() => setDataFiltro('')}>limpar data</Botao>}
      </div>

      <Quadro colunas={colunas} larguraColuna={340} podeArrastar={editar && porTecnico} onMover={onMover} renderGrupo={renderGrupo}
        vazio={porTecnico ? 'Solte aqui' : 'Nada aqui'}
        renderItem={(d) => <CardDemanda d={d} vertical mostrarCliente />} />

      <BarraSelecao n={ids.length} onLimpar={limpar}>
        {editar && <Botao tamanho="sm" variante="primario" onClick={() => setAtribuir(demandas.filter(d => sel.has(d.id)))}><UserCog size={13} />Técnico / veículo / data</Botao>}
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
