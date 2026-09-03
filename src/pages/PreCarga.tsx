// Pré-carga: uma pré-carga por técnico com as paradas ordenadas. Só o que se carrega
// (ENTREGA, LOCAÇÃO, TROCA, RETORNO). Marque o ✓ conforme separa; feche o dia; estorne se precisar.
import { Lock, Printer, Undo2, Check, Search, Tag } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { SeletorData } from '../components/Filtros'
import { usePrint } from '../components/Print'
import { FolhaEtiquetas, FolhaRoteiro } from '../components/Etiqueta'
import { Chip, GrupoCard, LocalData } from '../components/Cards'
import { Badge, BadgeTipo, Botao, Confirmar, Input, Pagina, Select, Vazio, cx } from '../components/ui'
import { STATUS_EM_ROTA, separaNaExpedicao } from '../lib/status'
import { fmtData, fmtPatrimonio, hojeISO, ordenarParadas, fmtDataHora, agrupar, chaveParada, normalizar, textoBusca } from '../lib/format'
import { veiculosDoGrupo } from '../components/GrupoTecnico'
import type { Demanda, Fechamento } from '../lib/types'

export function PreCarga() {
  const { demandas, tecnicos, expedidores, fechamentos, acoes, tecnicoPorId } = useData()
  const { pode, usuario } = useAuth()
  const { toast, erro } = useToast()
  const { imprimir } = usePrint()
  const [data, setData] = useState(hojeISO())
  const [busca, setBusca] = useState('')
  const [fTec, setFTec] = useState('')
  const [mostrar, setMostrar] = useState<'todos' | 'pendentes' | 'separados'>('todos')
  const [expedidor, setExpedidor] = useState<string>(() => localStorage.getItem('expedidor') ?? '')
  const [confirmar, setConfirmar] = useState<{ titulo: string; texto: React.ReactNode; fn(): Promise<unknown>; msg: string } | null>(null)
  const separar = pode('expedicao.separar'); const fechar = pode('expedicao.fechar')

  const doDia = useMemo(() => { const b = normalizar(busca); return demandas.filter(d => STATUS_EM_ROTA.includes(d.status) && separaNaExpedicao(d.tipo) && d.data_planejada === data && (!fTec || d.tecnico_id === fTec) && (!b || textoBusca(d).includes(b) || normalizar(tecnicoPorId(d.tecnico_id)?.nome).includes(b))) }, [demandas, data, fTec, busca, tecnicoPorId])
  const grupos = tecnicos.map(t => ({ t, itens: doDia.filter(d => d.tecnico_id === t.id).sort(ordenarParadas) })).filter(g => g.itens.length)
  const ultimo = fechamentos.find(f => f.tipo === 'PRE_CARGA' && !f.estornado)
  const totalSep = doDia.filter(d => d.status_separacao === 'SEPARADO').length

  const quem = () => expedidor || usuario?.perfil.nome || null
  const run = async (fn: () => Promise<unknown>, msg?: string) => { try { await fn(); if (msg) toast(msg) } catch (e) { erro(e) } }
  const marcar = (d: Demanda) => {
    if (d.status_separacao !== 'SEPARADO' && !quem()) { toast('Selecione quem está separando.', 'erro'); return }
    run(() => acoes.marcarSeparado(d.id, d.status_separacao !== 'SEPARADO', quem()))
  }
  const fecharDia = (tecId: string | null, itens: Demanda[]) => {
    const abertos = itens.filter(d => d.status === 'ROTEIRIZADO'); const naoSep = abertos.filter(d => d.status_separacao !== 'SEPARADO').length
    if (!abertos.length) { toast('Nada aberto para fechar.', 'info'); return }
    setConfirmar({ titulo: tecId ? 'Fechar pré-carga do técnico' : 'Fechar o dia', texto: <>Fechar {abertos.length} item(ns) de <b>{tecId ? tecnicoPorId(tecId)?.nome : 'todos os técnicos'}</b> em {fmtData(data)}?{naoSep > 0 && <span className="mt-1 block text-amber-700">{naoSep} ainda não separado(s).</span>} Os itens passam a AGUARDANDO SAÍDA. Dá para estornar.</>,
      fn: async () => { for (const g of grupos) if (!tecId || g.t.id === tecId) { if (g.itens.some(d => d.status === 'ROTEIRIZADO')) await acoes.fecharPreCarga(g.t.id, data, g.itens, usuario?.id ?? null) } }, msg: 'Pré-carga fechada.' })
  }
  const estornar = (f: Fechamento) => setConfirmar({ titulo: 'Estornar último fechamento', texto: <>Estornar o fechamento de <b>{tecnicoPorId(f.tecnico_id)?.nome}</b> em {fmtData(f.data)} ({f.demanda_ids.length} item)? Os itens voltam à pré-carga e à expedição.</>, fn: () => acoes.estornarFechamento(f), msg: 'Fechamento estornado.' })

  return (
    <Pagina titulo="Pré-carga" subtitulo="Uma pré-carga por técnico, na ordem das paradas · marque o ✓ conforme separa · a tela atualiza sozinha" acoes={<>
      <Botao variante="primario" title="Imprime a lista de carga de todos os técnicos" onClick={() => imprimir(<div>{grupos.map(g => <div key={g.t.id} style={{ pageBreakAfter: 'always' }}><FolhaRoteiro tecnico={g.t} data={data} itens={g.itens} /></div>)}</div>)}><Printer size={14} />Imprimir todas</Botao>
      {fechar && <Botao variante="perigo" onClick={() => fecharDia(null, doDia)}><Lock size={14} />Fechar dia</Botao>}
      {fechar && ultimo && <Botao onClick={() => estornar(ultimo)} title={`Último: ${tecnicoPorId(ultimo.tecnico_id)?.nome} · ${fmtDataHora(ultimo.fechado_em)}`}><Undo2 size={14} />Estornar</Botao>}
      <span className="text-sm font-bold text-red-600">{totalSep} de {doDia.length} separados</span>
      <SeletorData valor={data} onChange={setData} />
    </>}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente, local, equipamento, OS, técnico…" className="pl-8" /></div>
        <label className="text-xs text-slate-600">Técnico:</label>
        <Select value={fTec} onChange={e => setFTec(e.target.value)} className="w-44"><option value="">Todos</option>{tecnicos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</Select>
        <label className="text-xs text-slate-600">Mostrar:</label>
        <Select value={mostrar} onChange={e => setMostrar(e.target.value as typeof mostrar)} className="w-36"><option value="todos">Todos</option><option value="pendentes">Só pendentes</option><option value="separados">Só separados</option></Select>
        {separar && <Select value={expedidor} onChange={e => { setExpedidor(e.target.value); localStorage.setItem('expedidor', e.target.value) }} className="w-40"><option value="">Quem separa…</option>{expedidores.filter(x => x.ativo).map(x => <option key={x.id} value={x.nome}>{x.nome}</option>)}</Select>}
      </div>
      {grupos.length === 0 && <Vazio titulo={`Nenhuma carga para ${fmtData(data)}`} texto="A pré-carga se forma quando o PCM libera paradas no pré-roteiro ou gera roteiros no planejamento." />}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {grupos.map(({ t, itens }) => {
          const sep = itens.filter(d => d.status_separacao === 'SEPARADO').length
          const abertos = itens.filter(d => d.status === 'ROTEIRIZADO').length
          const visiveis = itens.filter(d => mostrar === 'todos' || (mostrar === 'separados') === (d.status_separacao === 'SEPARADO'))
          const paradas = Array.from(agrupar(visiveis, chaveParada).values())
          return (
            <GrupoCard key={t.id} cor={t.cor} titulo={<span>👷 {t.nome}</span>} subtitulo={<span>🚗 {veiculosDoGrupo(itens).join(' / ') || <span className="text-amber-700">sem veículo</span>}</span>}
              chips={<><Chip tone={abertos ? 'bg-blue-50 text-blue-800' : 'bg-indigo-50 text-indigo-800'}>{abertos ? 'Pré-carga' : 'Fechada'}</Chip><Chip tone={sep === itens.length ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'}>{sep}/{itens.length} sep.</Chip></>}
              direita={<>
                <Botao tamanho="sm" variante="fantasma" title="Imprimir lista" onClick={() => imprimir(<FolhaRoteiro tecnico={t} data={data} itens={itens} />)}><Printer size={13} /></Botao>
                <Botao tamanho="sm" variante="fantasma" title="Etiquetas" onClick={() => imprimir(<FolhaEtiquetas itens={itens} tipo="EXPEDICAO" modo={(localStorage.getItem('et-modo') as 'normal') || 'normal'} tecnicoPorId={id => tecnicoPorId(id)} />)}><Tag size={13} /></Botao>
                {fechar && <Botao tamanho="sm" disabled={!abertos} onClick={() => fecharDia(t.id, itens)}><Lock size={12} />{abertos ? 'Fechar' : 'Fechada'}</Botao>}
              </>}>
              {paradas.map((its, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2 bg-slate-50/80 px-4 py-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1a56db] text-[10px] font-bold text-white">{its[0].ordem_parada ? its[0].ordem_parada / 10 : i + 1}</span>
                    <span className="text-[12px] font-bold text-slate-800">{its[0].cliente_nome ?? '—'}</span><LocalData local={its[0].local} /><span className="text-[11px] text-slate-400">({its.length})</span>
                  </div>
                  {its.map(d => {
                    const ok = d.status_separacao === 'SEPARADO'; const fechado = d.status !== 'ROTEIRIZADO'
                    return (
                      <div key={d.id} className={cx('flex items-center gap-3 px-4 py-2 pl-11', ok && 'bg-emerald-50/40')}>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-semibold text-slate-800">📦 {d.equipamento_nome}</div>
                          <div className="text-[11px] text-slate-500"><span className={d.patrimonio ? 'font-mono' : ''}>{fmtPatrimonio(d)}</span> · <span className="om">OS {d.om ?? '—'}</span>{ok && d.separado_por && <span className="text-emerald-700"> · ✓ {d.separado_por}</span>}</div>
                        </div>
                        <BadgeTipo tipo={d.tipo} />
                        {fechado && <Badge tone="bg-indigo-50 text-indigo-800 ring-indigo-200">🔒</Badge>}
                        <button disabled={!separar || fechado} onClick={() => marcar(d)} title={ok ? 'Desfazer separação' : 'Marcar como separado'}
                          className={cx('flex h-8 w-8 items-center justify-center rounded-full ring-2 transition disabled:opacity-50', ok ? 'bg-emerald-500 text-white ring-emerald-500' : 'bg-white text-transparent ring-slate-300 hover:ring-emerald-400 hover:text-emerald-300')}><Check size={16} /></button>
                      </div>
                    )
                  })}
                </div>
              ))}
            </GrupoCard>
          )
        })}
      </div>
      <div className="fixed bottom-4 right-4 rounded-xl bg-[#134e4a] px-4 py-2.5 text-sm font-semibold text-white shadow-lg print:hidden">{doDia.length} itens na pré-carga</div>
      <Confirmar aberto={!!confirmar} titulo={confirmar?.titulo ?? ''} texto={confirmar?.texto} onFechar={() => setConfirmar(null)}
        onConfirmar={() => { const c = confirmar!; setConfirmar(null); run(c.fn, c.msg) }} />
    </Pagina>
  )
}
