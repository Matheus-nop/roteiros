// Histórico: demandas arquivadas, eventos de auditoria e fechamentos. Tudo restaurável.
import { RotateCcw, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { db } from '../lib'
import { TabelaDemandas } from '../components/TabelaDemandas'
import { Badge, BadgeStatus, Botao, Cartao, Confirmar, Input, Pagina, Select, cx } from '../components/ui'
import { STATUS_ARQUIVADOS } from '../lib/status'
import { fmtData, fmtDataHora, normalizar, textoBusca, fmtPatrimonio } from '../lib/format'
import type { Demanda, Historico as Evento, Status } from '../lib/types'

type Aba = 'arquivadas' | 'eventos' | 'fechamentos'

export function Historico() {
  const { pode } = useAuth()
  const [aba, setAba] = useState<Aba>('arquivadas')
  const abas: { k: Aba; r: string }[] = [{ k: 'arquivadas', r: 'Demandas arquivadas' }, { k: 'eventos', r: 'Eventos (auditoria)' }, { k: 'fechamentos', r: 'Fechamentos' }]
  return (
    <Pagina titulo="Histórico" subtitulo="Consulta do que foi arquivado · nada se perde, tudo pode ser restaurado">
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {abas.map(a => <button key={a.k} onClick={() => setAba(a.k)} className={cx('-mb-px border-b-2 px-3 py-2 text-sm font-medium', aba === a.k ? 'border-brand-700 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700')}>{a.r}</button>)}
      </div>
      {aba === 'arquivadas' && <Arquivadas restaurar={pode('historico.restaurar')} />}
      {aba === 'eventos' && <Eventos restaurar={pode('historico.restaurar')} />}
      {aba === 'fechamentos' && <Fechamentos />}
    </Pagina>
  )
}

function Arquivadas({ restaurar }: { restaurar: boolean }) {
  const { acoes } = useData()
  const { toast, erro } = useToast()
  const [lista, setLista] = useState<Demanda[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [buscaAtiva, setBuscaAtiva] = useState('')
  const [status, setStatus] = useState<string>('')
  const [conf, setConf] = useState<Demanda | null>(null)
  const [tecnico, setTecnico] = useState('')
  const [mostrar, setMostrar] = useState(200)
  const { tecnicos } = useData()
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
      setMostrar(200)
    } catch (e) { erro(e) } finally { setCarregando(false) }
  }
  useEffect(() => { carregar() }, [buscaAtiva]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => db.subscribe<Demanda>('demandas', (e) => { if (e.novo && STATUS_ARQUIVADOS.includes((e.novo as Demanda).status)) carregar() }), []) // eslint-disable-line react-hooks/exhaustive-deps

  const itens = useMemo(() => {
    const b = normalizar(busca)
    return lista.filter(d => (!status || d.status === status) && (!tecnico || d.tecnico_id === tecnico) && (!b || textoBusca(d).includes(b)))
  }, [lista, busca, status, tecnico])

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar OM, cliente, equipamento…" className="w-72 pl-8" /></div>
        <Select value={status} onChange={e => setStatus(e.target.value)} className="w-40"><option value="">Finalizadas e canceladas</option><option value="FINALIZADO">Finalizadas</option><option value="CANCELADO">Canceladas</option></Select>
        <Select value={tecnico} onChange={e => setTecnico(e.target.value)} className="w-44"><option value="">Todos os técnicos</option>{tecnicos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</Select>
        <span className="text-xs text-slate-500">{carregando ? 'carregando…' : `${itens.length} encontrada(s)${lista.length >= LIMITE ? ` · mostrando as ${LIMITE} mais recentes, refine a busca` : ''}`}</span>
      </div>
      <TabelaDemandas itens={itens.slice(0, mostrar)} colunas={['numero', 'om', 'cliente', 'tipo', 'equipamento', 'patrimonio', 'tecnico', 'veiculo', 'data', 'status', 'obs', 'acoes']}
        vazio={carregando ? 'Carregando…' : 'Nenhuma demanda arquivada.'}
        acoes={d => restaurar && <Botao tamanho="sm" variante="fantasma" title="Restaurar para o planejamento" onClick={() => setConf(d)}><RotateCcw size={14} /></Botao>} />
      {itens.length > mostrar && <div className="mt-3 text-center"><Botao onClick={() => setMostrar(m => m + 200)}>Mostrar mais ({itens.length - mostrar} restantes)</Botao></div>}
      <Confirmar aberto={!!conf} titulo="Restaurar demanda" onFechar={() => setConf(null)} texto={<>Restaurar <b>{conf?.equipamento_nome}</b> (OM {conf?.om}) para o planejamento (aguardando roteirização)?</>}
        onConfirmar={async () => { const d = conf!; setConf(null); try { await acoes.restaurar(d.id); toast('Restaurada.') } catch (e) { erro(e) } }} />
    </>
  )
}

function Eventos({ restaurar }: { restaurar: boolean }) {
  const { acoes, demandas } = useData()
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
    return lista.filter(h => !b || normalizar([h.snapshot?.om, h.snapshot?.cliente_nome, h.snapshot?.equipamento_nome, h.snapshot?.patrimonio, h.acao].join(' ')).includes(b))
  }, [lista, busca])
  return (
    <Cartao titulo={<span>Últimos {lista.length} eventos</span>} acoes={<Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar OM, equipamento, ação…" className="w-64" />}>
      <div className="max-h-[70vh] overflow-auto">
        <table className="tabela w-full">
          <thead><tr><th>Quando</th><th>Demanda</th><th>Ação</th><th>De → Para</th><th /></tr></thead>
          <tbody>
            {itens.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-500">Nenhum evento.</td></tr>}
            {itens.map(h => {
              const s = h.snapshot
              const excluida = h.acao === 'excluída' && !ativos.has(h.demanda_id ?? '')
              return (
                <tr key={h.id}>
                  <td className="whitespace-nowrap text-xs text-slate-500">{fmtDataHora(h.alterado_em)}</td>
                  <td className="text-xs">{s ? <><span className="om font-medium">{s.om ?? '—'}</span> · {s.equipamento_nome} · {s.patrimonio ? fmtPatrimonio(s as Demanda) : `Qtd ${s.quantidade}`} · {s.cliente_nome}</> : '—'}</td>
                  <td className="text-xs">{h.acao}</td>
                  <td className="text-xs">{h.status_anterior && <BadgeStatus status={h.status_anterior as Status} />}{h.status_anterior && h.status_novo && ' → '}{h.status_novo && <BadgeStatus status={h.status_novo as Status} />}</td>
                  <td className="text-right">{restaurar && excluida && <Botao tamanho="sm" variante="fantasma" title="Reinserir demanda excluída a partir do snapshot" onClick={() => setConf(h)}><RotateCcw size={14} /></Botao>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Confirmar aberto={!!conf} titulo="Recuperar demanda excluída" onFechar={() => setConf(null)} texto={<>Reinserir <b>{conf?.snapshot?.equipamento_nome}</b> (OM {conf?.snapshot?.om}) a partir do snapshot, no planejamento?</>}
        onConfirmar={async () => { const h = conf!; setConf(null); try { await acoes.restaurarDoSnapshot(h); toast('Demanda recuperada.') } catch (e) { erro(e) } }} />
    </Cartao>
  )
}

function Fechamentos() {
  const { fechamentos, tecnicoPorId, acoes } = useData()
  const { pode } = useAuth()
  const { toast, erro } = useToast()
  return (
    <Cartao titulo="Fechamentos de pré-carga e roteiro">
      <table className="tabela w-full">
        <thead><tr><th>Quando</th><th>Tipo</th><th>Técnico</th><th>Data</th><th>Itens</th><th>Situação</th><th /></tr></thead>
        <tbody>
          {fechamentos.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-slate-500">Nenhum fechamento.</td></tr>}
          {fechamentos.map(f => (
            <tr key={f.id}>
              <td className="whitespace-nowrap text-xs text-slate-500">{fmtDataHora(f.fechado_em)}</td>
              <td><Badge>{f.tipo === 'PRE_CARGA' ? 'Pré-carga' : 'Roteiro'}</Badge></td>
              <td>{tecnicoPorId(f.tecnico_id)?.nome ?? '—'}</td>
              <td className="tabular-nums">{fmtData(f.data)}</td>
              <td className="tabular-nums">{f.demanda_ids.length}</td>
              <td>{f.estornado ? <Badge tone="bg-orange-50 text-orange-800 ring-orange-200">estornado</Badge> : <Badge tone="bg-emerald-50 text-emerald-800 ring-emerald-200">fechado</Badge>}</td>
              <td className="text-right">{pode('expedicao.fechar') && !f.estornado && f.tipo === 'PRE_CARGA' && <Botao tamanho="sm" variante="fantasma" onClick={async () => { try { await acoes.estornarFechamento(f); toast('Estornado.') } catch (e) { erro(e) } }}>↩ Estornar</Botao>}</td>
            </tr>))}
        </tbody>
      </table>
    </Cartao>
  )
}
