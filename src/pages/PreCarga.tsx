// Pré-carga: separação por técnico com paradas ordenadas. Mesma fonte da expedição.
import { Lock, Printer, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { SeletorData } from '../components/Filtros'
import { usePrint } from '../components/Print'
import { FolhaEtiquetas, FolhaRoteiro } from '../components/Etiqueta'
import { CabecalhoTecnico, veiculosDoGrupo } from '../components/GrupoTecnico'
import { Badge, BadgeTipo, Botao, Confirmar, Pagina, Select, Vazio, cx } from '../components/ui'
import { STATUS_EM_ROTA, separaNaExpedicao } from '../lib/status'
import { fmtData, fmtPatrimonio, hojeISO, ordenarParadas, fmtDataHora } from '../lib/format'
import type { Demanda, Fechamento } from '../lib/types'

export function PreCarga() {
  const { demandas, tecnicos, expedidores, fechamentos, acoes, tecnicoPorId } = useData()
  const { pode, usuario } = useAuth()
  const { toast, erro } = useToast()
  const { imprimir } = usePrint()
  const [data, setData] = useState(hojeISO())
  const [expedidor, setExpedidor] = useState<string>(() => localStorage.getItem('expedidor') ?? '')
  const [confirmar, setConfirmar] = useState<{ titulo: string; texto: React.ReactNode; fn(): Promise<unknown>; msg: string } | null>(null)
  const separar = pode('expedicao.separar'); const fechar = pode('expedicao.fechar')

  const doDia = useMemo(() => demandas.filter(d => STATUS_EM_ROTA.includes(d.status) && separaNaExpedicao(d.tipo) && d.data_planejada === data), [demandas, data])
  const grupos = tecnicos.map(t => ({ t, itens: doDia.filter(d => d.tecnico_id === t.id).sort(ordenarParadas) })).filter(g => g.itens.length)
  const fechDia = fechamentos.filter(f => f.tipo === 'PRE_CARGA' && f.data === data && !f.estornado)
  const ultimo = fechamentos.find(f => f.tipo === 'PRE_CARGA' && !f.estornado)

  const quem = () => expedidor || usuario?.perfil.nome || null
  const marcar = async (d: Demanda, v: boolean) => {
    if (v && !quem()) { toast('Selecione quem está separando.', 'erro'); return }
    try { await acoes.marcarSeparado(d.id, v, v ? quem() : null) } catch (e) { erro(e) }
  }
  const run = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast(msg) } catch (e) { erro(e) } }

  const fecharDia = (tecId: string, itens: Demanda[]) => {
    const abertos = itens.filter(d => d.status === 'ROTEIRIZADO')
    const naoSep = abertos.filter(d => d.status_separacao !== 'SEPARADO').length
    setConfirmar({
      titulo: 'Fechar pré-carga do dia',
      texto: <>Fechar a pré-carga de <b>{tecnicoPorId(tecId)?.nome}</b> em {fmtData(data)} ({abertos.length} item(ns))?{naoSep > 0 && <span className="mt-1 block text-amber-700">{naoSep} item(ns) ainda não separado(s).</span>} Os itens passam a AGUARDANDO SAÍDA. É possível estornar.</>,
      fn: () => acoes.fecharPreCarga(tecId, data, itens, usuario?.id ?? null), msg: 'Pré-carga fechada.',
    })
  }
  const estornar = (f: Fechamento) => setConfirmar({
    titulo: 'Estornar fechamento', texto: <>Estornar o fechamento de <b>{tecnicoPorId(f.tecnico_id)?.nome}</b> em {fmtData(f.data)} ({f.demanda_ids.length} item(ns))? Os itens voltam a ROTEIRIZADO.</>,
    fn: () => acoes.estornarFechamento(f), msg: 'Fechamento estornado.',
  })

  return (
    <Pagina titulo="Pré-carga" subtitulo="Separação por técnico com paradas ordenadas · fecha o dia e estorna" acoes={<>
      {separar && <Select value={expedidor} onChange={e => { setExpedidor(e.target.value); localStorage.setItem('expedidor', e.target.value) }} className="w-40"><option value="">Quem separa…</option>{expedidores.filter(x => x.ativo).map(x => <option key={x.id} value={x.nome}>{x.nome}</option>)}</Select>}
      {fechar && ultimo && <Botao onClick={() => estornar(ultimo)} title={`Último fechamento: ${tecnicoPorId(ultimo.tecnico_id)?.nome} · ${fmtDataHora(ultimo.fechado_em)}`}><Undo2 size={14} />Estornar último fechamento</Botao>}
      <SeletorData valor={data} onChange={setData} />
    </>}>
      {fechDia.length > 0 && <p className="mb-3 text-xs text-slate-500">Fechamentos hoje: {fechDia.map(f => `${tecnicoPorId(f.tecnico_id)?.nome ?? '?'} (${f.demanda_ids.length}) às ${fmtDataHora(f.fechado_em).slice(-5)}`).join(' · ')}</p>}
      {grupos.length === 0 && <Vazio titulo={`Nenhuma carga para ${fmtData(data)}`} texto="Gere roteiros no Planejamento/Pré-roteiro para os itens aparecerem aqui." />}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {grupos.map(({ t, itens }) => {
          const sep = itens.filter(d => d.status_separacao === 'SEPARADO').length
          const abertos = itens.filter(d => d.status === 'ROTEIRIZADO').length
          return (
            <section key={t.id} className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
              <CabecalhoTecnico tecnico={t} total={itens.length} veiculos={veiculosDoGrupo(itens)} direita={<>
                <Badge tone={sep === itens.length ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-amber-50 text-amber-800 ring-amber-200'}>{sep}/{itens.length} separados</Badge>
                <Botao tamanho="sm" variante="fantasma" title="Imprimir lista" onClick={() => imprimir(<FolhaRoteiro tecnico={t} data={data} itens={itens} />)}><Printer size={13} /></Botao>
                <Botao tamanho="sm" variante="fantasma" title="Etiquetas" onClick={() => imprimir(<FolhaEtiquetas itens={itens} prefixo="EXP" tecnicoPorId={id => tecnicoPorId(id)} />)}>🏷</Botao>
                {fechar && <Botao tamanho="sm" variante="primario" disabled={!abertos} onClick={() => fecharDia(t.id, itens)}><Lock size={13} />{abertos ? `Fechar dia (${abertos})` : 'Dia fechado'}</Botao>}
              </>} />
              <ul className="divide-y divide-slate-100">
                {itens.map(d => {
                  const ok = d.status_separacao === 'SEPARADO'
                  const fechado = d.status !== 'ROTEIRIZADO'
                  return (
                    <li key={d.id} className={cx('flex items-center gap-3 px-4 py-2', ok && 'bg-emerald-50/40')}>
                      <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-slate-600">{d.ordem_parada ? d.ordem_parada / 10 : '—'}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="truncate text-sm font-medium text-slate-800">{d.equipamento_nome}</span>
                          <span className={cx('text-xs', d.patrimonio ? 'font-mono font-semibold text-slate-800' : 'text-slate-600')}>{fmtPatrimonio(d)}</span>
                          <BadgeTipo tipo={d.tipo} />
                        </div>
                        <div className="truncate text-xs text-slate-500"><span className="om">{d.om ?? '—'}</span> · {d.cliente_nome} · {d.local}</div>
                        {ok && <div className="text-[11px] text-emerald-700">✓ {d.separado_por} · {fmtData(d.data_separacao)}</div>}
                      </div>
                      {fechado && <Badge tone="bg-indigo-50 text-indigo-800 ring-indigo-200">🔒</Badge>}
                      {separar && (ok
                        ? <Botao tamanho="sm" onClick={() => marcar(d, false)} disabled={fechado} title="Estornar separação">↩</Botao>
                        : <Botao tamanho="sm" variante="sucesso" onClick={() => marcar(d, true)} disabled={fechado}>✓ Separado</Botao>)}
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
      <Confirmar aberto={!!confirmar} titulo={confirmar?.titulo ?? ''} texto={confirmar?.texto} onFechar={() => setConfirmar(null)}
        onConfirmar={() => { const c = confirmar!; setConfirmar(null); run(c.fn, c.msg) }} />
    </Pagina>
  )
}
