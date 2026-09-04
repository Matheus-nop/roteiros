// Histórico: demandas arquivadas, auditoria e fechamentos — tudo em cards, como o
// resto do sistema. Nada aqui se perde: arquivada volta ao planejamento, e a excluída
// é recuperável a partir do retrato guardado pelo gatilho de auditoria.
import { RotateCcw, Search, Archive, ScrollText, Lock, Undo2, CheckCircle2, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { db } from '../lib'
import { CardDemanda, GrupoCard, Chip } from '../components/Cards'
import { Badge, BadgeStatus, Botao, Cartao, Confirmar, Input, Pagina, Select, Vazio, cx } from '../components/ui'
import { STATUS_ARQUIVADOS } from '../lib/status'
import { addDias, agrupar, diaSemana, fmtData, fmtDataHora, hojeISO, normalizar, textoBusca, fmtPatrimonio } from '../lib/format'
import type { Demanda, Historico as Evento, Status } from '../lib/types'

type Aba = 'arquivadas' | 'eventos' | 'fechamentos'

const ABAS: { k: Aba; r: string; i: typeof Archive }[] = [
  { k: 'arquivadas', r: 'Demandas arquivadas', i: Archive },
  { k: 'eventos', r: 'Eventos (auditoria)', i: ScrollText },
  { k: 'fechamentos', r: 'Fechamentos', i: Lock },
]

export function Historico() {
  const { pode } = useAuth()
  const [aba, setAba] = useState<Aba>('arquivadas')
  return (
    <Pagina titulo="Histórico" subtitulo="Consulta do que foi arquivado · nada se perde, tudo pode ser restaurado">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {ABAS.map(a => (
          <button key={a.k} onClick={() => setAba(a.k)}
            className={cx('flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition ring-1',
              aba === a.k ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-200 hover:text-slate-900')}>
            <a.i size={14} />{a.r}
          </button>
        ))}
      </div>
      {aba === 'arquivadas' && <Arquivadas restaurar={pode('historico.restaurar')} />}
      {aba === 'eventos' && <Eventos restaurar={pode('historico.restaurar')} />}
      {aba === 'fechamentos' && <Fechamentos />}
    </Pagina>
  )
}

/**
 * Rótulo de um dia que já passou. O `rotuloData` comum chama de "Atrasada" tudo que é
 * anterior a hoje — o que faz sentido para uma data planejada, e nenhum para uma demanda
 * que já foi concluída.
 */
function rotuloDia(iso: string): string {
  if (!iso) return 'Sem data'
  const hoje = hojeISO()
  if (iso === hoje) return `Hoje · ${fmtData(iso)}`
  if (iso === addDias(hoje, -1)) return `Ontem · ${fmtData(iso)}`
  return `${diaSemana(iso)} · ${fmtData(iso)}`
}

// ---------------------------------------------------------------- demandas arquivadas
function Arquivadas({ restaurar }: { restaurar: boolean }) {
  const { acoes, tecnicos, tecnicoPorId } = useData()
  const { toast, erro } = useToast()
  const [lista, setLista] = useState<Demanda[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [buscaAtiva, setBuscaAtiva] = useState('')
  const [status, setStatus] = useState('')
  const [tecnico, setTecnico] = useState('')
  const [conf, setConf] = useState<Demanda | null>(null)
  const [mostrar, setMostrar] = useState(12)
  const LIMITE = 500

  // Busca no servidor (ilike) com atraso de digitação; sem busca, traz as 500 mais recentes.
  useEffect(() => { const t = setTimeout(() => setBuscaAtiva(busca), 350); return () => clearTimeout(t) }, [busca])
  const carregar = async () => {
    setCarregando(true)
    try {
      setLista(await db.select<Demanda>('demandas', {
        in: { status: STATUS_ARQUIVADOS }, order: [{ col: 'updated_at', asc: false }], limit: LIMITE,
        busca: buscaAtiva.trim().length >= 2 ? { colunas: ['om', 'cliente_nome', 'equipamento_nome', 'patrimonio', 'local'], termo: buscaAtiva } : undefined,
      }))
      setMostrar(12)
    } catch (e) { erro(e) } finally { setCarregando(false) }
  }
  useEffect(() => { carregar() }, [buscaAtiva]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => db.subscribe<Demanda>('demandas', (e) => { if (e.novo && STATUS_ARQUIVADOS.includes((e.novo as Demanda).status)) carregar() }), []) // eslint-disable-line react-hooks/exhaustive-deps

  const itens = useMemo(() => {
    const b = normalizar(busca)
    return lista.filter(d => (!status || d.status === status) && (!tecnico || d.tecnico_id === tecnico) && (!b || textoBusca(d).includes(b)))
  }, [lista, busca, status, tecnico])

  // Agrupado pelo dia em que saiu de circulação — é como se procura no arquivo.
  const porDia = useMemo(() => {
    const dia = (d: Demanda) => (d.finalizado_em ?? d.updated_at ?? '').slice(0, 10)
    return Array.from(agrupar(itens, dia).entries()).sort(([a], [b]) => b.localeCompare(a))
  }, [itens])

  const visiveis = porDia.slice(0, mostrar)

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar OS, cliente, local, equipamento, patrimônio…" className="pl-8" /></div>
        <Select value={status} onChange={e => setStatus(e.target.value)} className="w-48"><option value="">Finalizadas e canceladas</option><option value="FINALIZADO">Só finalizadas</option><option value="CANCELADO">Só canceladas</option></Select>
        <Select value={tecnico} onChange={e => setTecnico(e.target.value)} className="w-44"><option value="">Todos os técnicos</option>{tecnicos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</Select>
      </div>

      <div className="mb-3 rounded-lg bg-slate-50 px-4 py-2.5 text-[12.5px] ring-1 ring-slate-200">
        {carregando ? 'Carregando…' : <>
          <b className="text-slate-800">{itens.length} demanda(s)</b> em {porDia.length} dia(s)
          {lista.length >= LIMITE && <span className="text-slate-500"> · mostrando as {LIMITE} mais recentes, refine a busca</span>}
        </>}
      </div>

      {!carregando && porDia.length === 0 && <Vazio titulo="Nenhuma demanda arquivada" texto="Finalizadas e canceladas aparecem aqui, com o botão de restaurar." />}

      <div className="space-y-3">
        {visiveis.map(([dia, lista]) => {
          const fin = lista.filter(d => d.status === 'FINALIZADO').length
          return (
            <GrupoCard key={dia || 'sem'} cor="#94a3b8" aberto={false}
              titulo={rotuloDia(dia)} contagem={lista.length}
              chips={<>
                {fin > 0 && <Chip tone="bg-emerald-50 text-emerald-800">{fin} finalizada(s)</Chip>}
                {lista.length - fin > 0 && <Chip tone="bg-red-50 text-red-700">{lista.length - fin} cancelada(s)</Chip>}
              </>}>
              <div className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-2 xl:grid-cols-3">
                {lista.map(d => (
                  <div key={d.id} className="rounded-lg ring-1 ring-slate-200">
                    <CardDemanda d={d} vertical mostrarCliente
                      extra={<span className="mt-1 block text-[10.5px] text-slate-400">{tecnicoPorId(d.tecnico_id)?.nome ?? 'sem técnico'}{d.veiculo ? ` · ${d.veiculo}` : ''}</span>}
                      acoes={restaurar ? <Botao tamanho="sm" variante="fantasma" title="Restaurar para o planejamento" onClick={() => setConf(d)}><RotateCcw size={13} /></Botao> : undefined} />
                  </div>
                ))}
              </div>
            </GrupoCard>
          )
        })}
      </div>

      {porDia.length > mostrar && <div className="mt-3 text-center"><Botao onClick={() => setMostrar(m => m + 12)}>Mostrar mais ({porDia.length - mostrar} dia(s) restante(s))</Botao></div>}

      <Confirmar aberto={!!conf} titulo="Restaurar demanda" onFechar={() => setConf(null)}
        texto={<>Restaurar <b>{conf?.equipamento_nome}</b> (OS {conf?.om}) para o planejamento, aguardando roteirização?</>}
        onConfirmar={async () => { const d = conf!; setConf(null); try { await acoes.restaurar(d.id); toast('Restaurada.') } catch (e) { erro(e) } }} />
    </>
  )
}

// ---------------------------------------------------------------- auditoria
function Eventos({ restaurar }: { restaurar: boolean }) {
  const { acoes, demandas, nomeDoUsuario } = useData()
  const { toast, erro } = useToast()
  const [lista, setLista] = useState<Evento[]>([])
  const [busca, setBusca] = useState('')
  const [conf, setConf] = useState<Evento | null>(null)
  const carregar = async () => { try { setLista(await db.select<Evento>('historico', { order: [{ col: 'alterado_em', asc: false }], limit: 500 })) } catch (e) { erro(e) } }
  useEffect(() => { carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => db.subscribe('historico', () => { carregar() }), []) // eslint-disable-line react-hooks/exhaustive-deps

  const ativos = useMemo(() => new Set(demandas.map(d => d.id)), [demandas])
  const itens = useMemo(() => {
    const b = normalizar(busca)
    return lista.filter(h => !b || normalizar([h.snapshot?.om, h.snapshot?.cliente_nome, h.snapshot?.equipamento_nome, h.snapshot?.patrimonio, h.acao, nomeDoUsuario(h.alterado_por)].join(' ')).includes(b))
  }, [lista, busca, nomeDoUsuario])

  return (
    <>
      <div className="mb-3 relative"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar OS, equipamento, cliente, ação, pessoa…" className="pl-8" /></div>
      {itens.length === 0 && <Vazio titulo="Nenhum evento" texto="Cada mudança de status de demanda entra aqui automaticamente." />}

      {/* Linha do tempo: um card por evento, o mais recente no topo. */}
      <ol className="space-y-1.5">
        {itens.map(h => {
          const s = h.snapshot
          const excluida = h.acao === 'excluída' && !ativos.has(h.demanda_id ?? '')
          return (
            <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-white px-4 py-2.5 shadow-sm ring-1 ring-slate-200">
              <span className="w-28 shrink-0 text-[11.5px] tabular-nums text-slate-400">{fmtDataHora(h.alterado_em)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-slate-800">
                  {s ? <>{s.equipamento_nome ?? '—'} <span className="font-normal text-slate-500">· {s.cliente_nome ?? '—'}</span></> : '—'}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-slate-500">
                  {s && <><span className="om">OS {s.om ?? '—'}</span><span>·</span><span className={s.patrimonio ? 'font-mono' : ''}>{s.patrimonio ? fmtPatrimonio(s as Demanda) : `Qtd ${s.quantidade}`}</span></>}
                  {h.acao && <><span>·</span><span className="font-medium text-slate-600">{h.acao}</span></>}
                  <span>·</span><span className="font-semibold text-brand-700">{nomeDoUsuario(h.alterado_por)}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {h.status_anterior && <BadgeStatus status={h.status_anterior as Status} />}
                {h.status_anterior && h.status_novo && <span className="text-slate-300">→</span>}
                {h.status_novo && <BadgeStatus status={h.status_novo as Status} />}
                {restaurar && excluida && <Botao tamanho="sm" variante="fantasma" title="Reinserir a demanda excluída" onClick={() => setConf(h)}><RotateCcw size={13} /></Botao>}
              </div>
            </li>
          )
        })}
      </ol>

      <Confirmar aberto={!!conf} titulo="Recuperar demanda excluída" onFechar={() => setConf(null)}
        texto={<>Reinserir <b>{conf?.snapshot?.equipamento_nome}</b> (OS {conf?.snapshot?.om}) no planejamento, a partir do retrato guardado?</>}
        onConfirmar={async () => { const h = conf!; setConf(null); try { await acoes.restaurarDoSnapshot(h); toast('Demanda recuperada.') } catch (e) { erro(e) } }} />
    </>
  )
}

// ---------------------------------------------------------------- fechamentos
function Fechamentos() {
  const { fechamentos, tecnicoPorId, acoes } = useData()
  const { pode } = useAuth()
  const { toast, erro } = useToast()

  if (fechamentos.length === 0) return <Vazio titulo="Nenhum fechamento" texto="A pré-carga e o roteiro do dia aparecem aqui quando são fechados — com o botão de estornar." />

  return (
    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
      {fechamentos.map(f => (
        <Cartao key={f.id}>
          <div className="flex items-start gap-3 px-4 py-3">
            <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
              f.estornado ? 'bg-orange-50 text-orange-700' : 'bg-emerald-50 text-emerald-700')}>
              {f.estornado ? <Undo2 size={16} /> : <CheckCircle2 size={16} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={f.tipo === 'PRE_CARGA' ? 'bg-teal-50 text-teal-800 ring-teal-200' : 'bg-blue-50 text-blue-800 ring-blue-200'}>
                  {f.tipo === 'PRE_CARGA' ? 'Pré-carga' : 'Roteiro'}
                </Badge>
                {f.estornado
                  ? <Badge tone="bg-orange-50 text-orange-800 ring-orange-200"><XCircle size={10} className="mr-0.5 inline" />estornado</Badge>
                  : <Badge tone="bg-emerald-50 text-emerald-800 ring-emerald-200">fechado</Badge>}
              </div>
              <div className="mt-1 text-[14px] font-bold text-slate-900">{tecnicoPorId(f.tecnico_id)?.nome ?? '—'}</div>
              <div className="text-[12px] text-slate-500">{fmtData(f.data)} · {f.demanda_ids.length} item(ns)</div>
              <div className="mt-0.5 text-[11px] text-slate-400">fechado em {fmtDataHora(f.fechado_em)}</div>
            </div>
          </div>
          {pode('expedicao.fechar') && !f.estornado && f.tipo === 'PRE_CARGA' && (
            <button onClick={async () => { try { await acoes.estornarFechamento(f); toast('Fechamento estornado.') } catch (e) { erro(e) } }}
              className="flex w-full items-center justify-center gap-1.5 border-t border-slate-100 px-4 py-2 text-[12px] font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900">
              <Undo2 size={13} />Estornar fechamento
            </button>
          )}
        </Cartao>
      ))}
    </div>
  )
}
