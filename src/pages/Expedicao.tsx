// Expedição: painel por técnico, separação em três estados, quem separou, etiquetas e liberação para rota.
import { Printer, Play, Volume2, VolumeX, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { SeletorData } from '../components/Filtros'
import { ModalEtiquetas } from '../components/ModalEtiquetas'
import { BarraSelecao } from '../components/TabelaDemandas'
import { Chip, GrupoCard, LocalData } from '../components/Cards'
import { Badge, BadgeTipo, Botao, Confirmar, Contador, Input, Pagina, Select, Vazio, cx } from '../components/ui'
import { STATUS_EM_ROTA, SEPARACAO_LABEL, separaNaExpedicao } from '../lib/status'
import { hojeISO, normalizar, textoBusca, ordenarParadas, agrupar, fmtPatrimonio, fmtData } from '../lib/format'
import { veiculosDoGrupo } from '../components/GrupoTecnico'
import { db } from '../lib'
import type { Demanda, StatusSeparacao } from '../lib/types'

function beep() {
  try { const ctx = new AudioContext(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.08; o.start(); o.stop(ctx.currentTime + 0.18) } catch { /* sem áudio */ }
}

export function Expedicao() {
  const { demandas, tecnicos, expedidores, acoes, tecnicoPorId, conectado } = useData()
  const { pode, usuario } = useAuth()
  const { toast, erro } = useToast()
  const [data, setData] = useState(hojeISO())
  const [todas, setTodas] = useState(false)
  const [busca, setBusca] = useState('')
  const [som, setSom] = useState(() => localStorage.getItem('exp-som') !== 'off')
  const [etiquetas, setEtiquetas] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [confirmar, setConfirmar] = useState<{ titulo: string; texto: React.ReactNode; fn(): Promise<unknown>; msg: string } | null>(null)
  const separar = pode('expedicao.separar'); const liberar = pode('expedicao.fechar')
  const somRef = useRef(som); somRef.current = som

  useEffect(() => db.subscribe<Demanda>('demandas', e => {
    if (somRef.current && e.novo && (e.novo as Demanda).status === 'ROTEIRIZADO' && (!e.antigo || (e.antigo as Demanda).status !== 'ROTEIRIZADO') && separaNaExpedicao((e.novo as Demanda).tipo)) beep()
  }), [])

  const base = useMemo(() => demandas.filter(d => STATUS_EM_ROTA.includes(d.status) && separaNaExpedicao(d.tipo) && (todas || d.data_planejada === data)), [demandas, data, todas])
  const itens = useMemo(() => { const b = normalizar(busca); return base.filter(d => !b || textoBusca(d).includes(b) || normalizar(tecnicoPorId(d.tecnico_id)?.nome).includes(b)) }, [base, busca, tecnicoPorId])
  const grupos = useMemo(() => tecnicos.map(t => ({ t, itens: itens.filter(d => d.tecnico_id === t.id).sort(ordenarParadas) })).filter(g => g.itens.length), [itens, tecnicos])
  const semTec = itens.filter(d => !d.tecnico_id)

  const n = (s: StatusSeparacao) => base.filter(d => d.status_separacao === s).length
  const quem = () => usuario?.perfil.nome ?? null
  const run = async (fn: () => Promise<unknown>, msg?: string) => { try { await fn(); if (msg) toast(msg) } catch (e) { erro(e) } }

  const liberarRota = (lista: Demanda[], rotulo: string) => {
    const aptos = lista.filter(d => d.status === 'ROTEIRIZADO')
    const naoSep = aptos.filter(d => d.status_separacao !== 'SEPARADO').length
    if (!aptos.length) { toast('Nada para liberar.', 'info'); return }
    setConfirmar({ titulo: 'Liberar para rota', texto: <>Liberar {aptos.length} item(ns) de <b>{rotulo}</b> para saída?{naoSep > 0 && <span className="mt-1 block text-amber-700">{naoSep} ainda não separado(s).</span>} A expedição confirma que está tudo pronto para sair.</>, fn: () => acoes.liberarParaRota(aptos.map(d => d.id)), msg: 'Rota liberada.' })
  }

  const Linha = ({ d }: { d: Demanda }) => {
    const liberado = d.status !== 'ROTEIRIZADO'
    // Os dois selects têm largura fixa e não encolhem: numa linha só eles esmagavam o
    // nome do equipamento no celular. Empilham abaixo de `sm`.
    return (
      <div className={cx('flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3', d.status_separacao === 'SEPARADO' && 'bg-emerald-50/40', sel.has(d.id) && 'bg-blue-50/60')}>
        <div className="flex min-w-0 flex-1 items-start gap-3">
        <input type="checkbox" checked={sel.has(d.id)} onChange={e => setSel(s => { const x = new Set(s); e.target.checked ? x.add(d.id) : x.delete(d.id); return x })} className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 text-[13px] font-bold text-slate-800">{d.cliente_nome ?? '—'} <LocalData local={d.local} /></div>
          <div className="flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-slate-500">📦 {d.equipamento_nome} · <span className={d.patrimonio ? 'font-mono' : ''}>{fmtPatrimonio(d)}</span> · <span className="om">OS {d.om ?? '—'}</span>{todas && <> · 📅 {fmtData(d.data_planejada)}</>}{d.ordem_parada ? <> · parada {d.ordem_parada / 10}</> : null}</div>
        </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pl-7 sm:shrink-0 sm:pl-0">
        <BadgeTipo tipo={d.tipo} />
        {liberado && <Badge tone="bg-indigo-50 text-indigo-800 ring-indigo-200">▶ liberado</Badge>}
        {separar ? (
          <Select value={d.status_separacao} disabled={liberado} onChange={e => run(() => acoes.definirSeparacao(d.id, e.target.value as StatusSeparacao, d.separado_por ?? quem()))}
            className={cx('!w-full !py-1 !text-xs font-bold sm:!w-40', d.status_separacao === 'SEPARADO' ? '!bg-emerald-50 !text-emerald-800 !border-emerald-300' : d.status_separacao === 'EM_SEPARACAO' ? '!bg-amber-50 !text-amber-800 !border-amber-300' : '!bg-red-50 !text-red-800 !border-red-300')}>
            {(Object.keys(SEPARACAO_LABEL) as StatusSeparacao[]).map(s => <option key={s} value={s}>{SEPARACAO_LABEL[s].toUpperCase()}</option>)}
          </Select>
        ) : <Badge>{SEPARACAO_LABEL[d.status_separacao]}</Badge>}
        {separar && <Select value={d.separado_por ?? ''} disabled={liberado} onChange={e => run(() => acoes.definirSeparadoPor(d.id, e.target.value || null))} className="!w-full !py-1 !text-xs sm:!w-36">
          <option value="">quem separou</option>{expedidores.filter(x => x.ativo || x.nome === d.separado_por).map(x => <option key={x.id} value={x.nome}>{x.nome}</option>)}{d.separado_por && !expedidores.some(x => x.nome === d.separado_por) && <option value={d.separado_por}>{d.separado_por}</option>}
        </Select>}
        </div>
      </div>
    )
  }

  return (
    <Pagina titulo="Expedição" subtitulo="Separação do material por técnico · entra aqui o que sai do galpão: entrega, troca, retorno e locação" acoes={<>
      <Botao variante="primario" onClick={() => setEtiquetas(true)}><Printer size={14} />Etiquetas</Botao>
      {liberar && <Botao variante="sucesso" onClick={() => liberarRota(sel.size ? itens.filter(d => sel.has(d.id)) : itens, sel.size ? `${sel.size} selecionado(s)` : 'todos os técnicos')}><Play size={14} />Liberar para rota</Botao>}
      <Botao onClick={() => { const v = !som; setSom(v); localStorage.setItem('exp-som', v ? 'on' : 'off'); if (v) beep() }} title="Aviso sonoro quando entra item novo na expedição">{som ? <Volume2 size={14} /> : <VolumeX size={14} />}Som: {som ? 'ligado' : 'desligado'}</Botao>
      <span className={cx('inline-flex items-center gap-1.5 text-xs font-semibold', conectado ? 'text-emerald-700' : 'text-red-600')}><span className={cx('h-2 w-2 rounded-full', conectado ? 'bg-emerald-500' : 'bg-red-500')} />{conectado ? 'ao vivo' : 'sem tempo real'}</span>
      <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={todas} onChange={e => setTodas(e.target.checked)} />Todas as datas</label>
      <SeletorData valor={data} onChange={setData} />
    </>}>
      <div className="mb-3 relative"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar técnico, cliente, local, equipamento, OS…" className="pl-8" /></div>
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Contador rotulo="Total" valor={base.length} />
        <Contador rotulo="Não separado" valor={n('NAO_SEPARADO')} tom="text-red-700" />
        <Contador rotulo="Em separação" valor={n('EM_SEPARACAO')} tom="text-amber-700" />
        <Contador rotulo="Separado" valor={n('SEPARADO')} tom="text-emerald-700" />
      </div>
      {grupos.length === 0 && semTec.length === 0 && <Vazio titulo="Nada para separar nesta data" texto="Os itens chegam aqui quando o PCM gera o roteiro ou libera uma parada no pré-roteiro." />}
      <div className="space-y-3">
        {grupos.map(({ t, itens: its }) => {
          const sep = its.filter(d => d.status_separacao === 'SEPARADO').length
          const paradas = agrupar(its, agrupar.length ? (d => `${normalizar(d.cliente_nome)}|${normalizar(d.local)}`) : (d => d.id)).size
          return (
            <GrupoCard key={t.id} cor={t.cor} titulo={<span>👷 {t.nome}</span>} subtitulo={<span>🚗 {veiculosDoGrupo(its).join(' / ') || <span className="text-amber-700">sem veículo</span>} · {paradas} parada(s)</span>}
              chips={<div className="flex items-center gap-2"><div className="h-1.5 w-40 overflow-hidden rounded bg-slate-200"><div className={cx('h-full', sep === its.length ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: `${(sep / its.length) * 100}%` }} /></div><span className={cx('text-xs font-bold', sep === its.length ? 'text-emerald-700' : 'text-red-600')}>{sep}/{its.length} separados</span></div>}
              contagem={its.length}
              direita={<>
                <Botao tamanho="sm" variante="fantasma" title="Etiquetas deste técnico" onClick={() => { setSel(new Set(its.map(d => d.id))); setEtiquetas(true) }}><Printer size={13} /></Botao>
                {liberar && its.some(d => d.status === 'ROTEIRIZADO') && <Botao tamanho="sm" variante="sucesso" onClick={() => liberarRota(its, t.nome)}><Play size={12} />Liberar</Botao>}
              </>}>
              {its.map(d => <Linha key={d.id} d={d} />)}
            </GrupoCard>
          )
        })}
        {semTec.length > 0 && <GrupoCard titulo="Sem técnico" contagem={semTec.length} chips={<Chip tone="bg-red-50 text-red-700">atribua no planejamento</Chip>}>{semTec.map(d => <Linha key={d.id} d={d} />)}</GrupoCard>}
      </div>

      <BarraSelecao n={sel.size} onLimpar={() => setSel(new Set())}>
        {separar && <Botao tamanho="sm" variante="sucesso" onClick={() => run(async () => { for (const id of sel) await acoes.definirSeparacao(id, 'SEPARADO', quem()) }, 'Marcados como separados.')}>✓ Marcar separados</Botao>}
        {separar && <Botao tamanho="sm" onClick={() => run(async () => { for (const id of sel) await acoes.definirSeparacao(id, 'NAO_SEPARADO', null) }, 'Separação desfeita.')}>↩ Desfazer</Botao>}
        {liberar && <Botao tamanho="sm" variante="primario" onClick={() => liberarRota(itens.filter(d => sel.has(d.id)), `${sel.size} selecionado(s)`)}><Play size={12} />Liberar para rota</Botao>}
        <Botao tamanho="sm" onClick={() => setEtiquetas(true)}><Printer size={13} />Etiquetas</Botao>
      </BarraSelecao>

      <ModalEtiquetas aberto={etiquetas} onFechar={() => setEtiquetas(false)} itens={sel.size ? itens.filter(d => sel.has(d.id)) : itens} tipo="EXPEDICAO" />
      <Confirmar aberto={!!confirmar} titulo={confirmar?.titulo ?? ''} texto={confirmar?.texto} onFechar={() => setConfirmar(null)}
        onConfirmar={() => { const c = confirmar!; setConfirmar(null); run(c.fn, c.msg); setSel(new Set()) }} />
    </Pagina>
  )
}
