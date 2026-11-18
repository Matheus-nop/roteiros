// Conferências de carga: quem conferiu, dia a dia, e o que não bateu (0022).
//
// "Não tenho um campo onde consigo ver a conferência de carga de todos os dias
//  de cada técnico — para saber se o cara conferiu a carga, ou, se der erro na
//  carga, em qual foi e quando foi."
//
// Duas vistas sobre a mesma carga. O QUADRO é técnico × dia: em cada célula,
// quanto da carga dele o técnico conferiu, e se alguma não bateu. A LISTA é o
// detalhe: cada item de carga, de que cliente, o que era, quem separou, quem
// conferiu e quando, e o que o técnico apontou. Clicar numa célula recorta a
// lista naquele técnico e naquele dia.
//
// Lê a `v_rel_demandas` (0008, com a conferência desde a 0020 e o quando desde
// a 0022), recortada por mês no servidor e por dia aqui. Sem a view, cai nas
// demandas em memória — e diz isso, como o relatório.
import { AlertTriangle, ClipboardCheck, ShieldAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useData } from '../hooks/useData'
import { db } from '../lib'
import { daDemanda, type LinhaFato } from '../lib/relatorios'
import {
  cargaDoPeriodo, listaDaConferencia, mesesEntre, quadroPorTecnicoEDia, situacaoDoDia,
  ROTULO_FILTRO, type Celula, type FiltroDaConferencia,
} from '../lib/conferencias'
import { Cartao, Pagina, Vazio, cx } from '../components/ui'
import { addDias, diaSemana, fmtDataCurta, fmtDataHora, hojeISO } from '../lib/format'

const PAGINA = 1000
const MAX_PAGINAS = 20

async function buscar(meses: string[]): Promise<LinhaFato[]> {
  const tudo: LinhaFato[] = []
  for (let i = 0; i < MAX_PAGINAS; i++) {
    const pagina = await db.select<LinhaFato>('v_rel_demandas', {
      in: { mes: meses },
      // `id` no fim: paginar por coluna com empate repete e perde linhas.
      order: [{ col: 'data', asc: false }, { col: 'id', asc: true }],
      limit: PAGINA,
      offset: i * PAGINA,
    })
    tudo.push(...pagina)
    if (pagina.length < PAGINA) break
  }
  return tudo
}

const PERIODOS = [
  { k: 'hoje', rotulo: 'Hoje', dias: 0 },
  { k: '7', rotulo: '7 dias', dias: 6 },
  { k: '15', rotulo: '15 dias', dias: 14 },
  { k: '30', rotulo: '30 dias', dias: 29 },
] as const

/** A cor de cada situação do dia: a pior notícia é a mais forte. */
const COR: Record<ReturnType<typeof situacaoDoDia>, string> = {
  divergencia: 'bg-red-50 text-red-700 ring-red-200',
  nada: 'bg-amber-50 text-amber-800 ring-amber-200',
  parcial: 'bg-amber-50 text-amber-800 ring-amber-100',
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
}

const SELO_CONF = {
  OK: { rotulo: 'Conferida', tom: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  DIVERGENTE: { rotulo: 'Não bateu', tom: 'bg-red-50 text-red-700 ring-red-200' },
  NAO_CONFERIDO: { rotulo: 'Sem conferência', tom: 'bg-amber-50 text-amber-800 ring-amber-200' },
} as const

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—')

export function Conferencias() {
  const { demandas, tecnicoPorId, carregando } = useData()
  const hoje = hojeISO()
  const [ate, setAte] = useState(hoje)
  const [de, setDe] = useState(addDias(hoje, -6))
  const [daView, setDaView] = useState<LinhaFato[] | null>(null)
  const [buscando, setBuscando] = useState(true)
  const [tecnico, setTecnico] = useState<string | null>(null)
  const [dia, setDia] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<FiltroDaConferencia>('todas')

  const deOk = de <= ate ? de : ate
  const chaveMeses = mesesEntre(deOk, ate).join('|')

  useEffect(() => {
    let vivo = true
    setBuscando(true)
    buscar(chaveMeses.split('|'))
      .then(r => { if (vivo) { setDaView(r); setBuscando(false) } })
      .catch(() => { if (vivo) { setDaView(null); setBuscando(false) } })
    return () => { vivo = false }
  }, [chaveMeses])

  const daMemoria = useMemo(
    () => demandas.map(d => daDemanda(d, id => tecnicoPorId(id)?.nome ?? null)),
    [demandas, tecnicoPorId])
  const completo = daView !== null
  const carga = useMemo(
    () => cargaDoPeriodo(completo ? daView : daMemoria, deOk, ate),
    [completo, daView, daMemoria, deOk, ate])
  const quadro = useMemo(() => quadroPorTecnicoEDia(carga), [carga])
  const lista = useMemo(() => listaDaConferencia(carga, { tecnico, dia, filtro }), [carga, tecnico, dia, filtro])

  const total = useMemo(() => {
    const t: Celula = { base: 0, ok: 0, divergentes: 0, naoConferidos: 0 }
    for (const c of quadro.porTecnico.values()) {
      t.base += c.base; t.ok += c.ok; t.divergentes += c.divergentes; t.naoConferidos += c.naoConferidos
    }
    return t
  }, [quadro])

  function periodo(dias: number) {
    setAte(hoje)
    setDe(addDias(hoje, -dias))
    setDia(null)
  }
  const periodoAtual = PERIODOS.find(p => ate === hoje && deOk === addDias(hoje, -p.dias))?.k

  return (
    <Pagina
      titulo="Conferências de carga"
      subtitulo={`${fmtDataCurta(deOk)} a ${fmtDataCurta(ate)} · ${total.base} item(ns) de carga${buscando || carregando ? ' · carregando…' : ''}`}
      acoes={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            {PERIODOS.map(p => (
              <button key={p.k} onClick={() => periodo(p.dias)}
                className={cx('rounded-md px-3 py-1 text-[12.5px] font-medium transition',
                  periodoAtual === p.k ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-600 hover:text-slate-800')}>
                {p.rotulo}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1 text-[12px] text-slate-600">
            de <input type="date" value={de} max={ate} onChange={e => { setDe(e.target.value); setDia(null) }}
              className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[12.5px]" />
          </label>
          <label className="flex items-center gap-1 text-[12px] text-slate-600">
            até <input type="date" value={ate} max={hoje} onChange={e => { setAte(e.target.value); setDia(null) }}
              className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[12.5px]" />
          </label>
        </div>
      }>

      {!completo && !buscando && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <b>Leitura parcial.</b> Sem a view do relatório, estes números saem só das demandas <b>ainda ativas</b>.
            Rode as migrações <code>0020</code> e <code>0022</code> no Supabase.
          </div>
        </div>
      )}

      {!carga.length ? (
        <Vazio titulo="Nenhuma carga no período" texto="Não há item de carga com data neste recorte. Experimente 30 dias." />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Numero rotulo="Carga" valor={total.base} legenda="itens que passaram pela expedição" />
            <Numero rotulo="Conferida" valor={pct(total.ok + total.divergentes, total.base)}
              legenda={`${total.ok + total.divergentes} de ${total.base}`}
              tom={(total.ok + total.divergentes) / total.base >= 0.8 ? 'text-emerald-700' : 'text-amber-700'} />
            <Numero rotulo="Não bateu" valor={total.divergentes}
              tom={total.divergentes ? 'text-red-600' : 'text-emerald-700'} legenda="divergências apontadas" />
            <Numero rotulo="Sem conferência" valor={total.naoConferidos}
              tom={total.naoConferidos ? 'text-amber-700' : undefined} legenda="saiu sem ninguém olhar" />
          </div>

          <Cartao className="mb-4 min-w-0" titulo={
            <span className="flex items-center gap-2"><ClipboardCheck size={15} className="text-slate-400" />Técnico × dia</span>
          }>
            <div className="overflow-x-auto">
              <table className="tabela w-full min-w-[560px]">
                <thead>
                  <tr>
                    <th>Técnico</th>
                    <th className="text-right">Período</th>
                    {quadro.dias.map(d => (
                      <th key={d} className="text-center">
                        <button onClick={() => { setDia(dia === d ? null : d); setTecnico(null) }}
                          className={cx('rounded px-1', dia === d && !tecnico && 'bg-brand-100 text-brand-800')}>
                          {fmtDataCurta(d)}
                          <span className="block text-[10px] font-normal normal-case text-slate-400">{diaSemana(d)}</span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {quadro.tecnicos.map(t => {
                    const p = quadro.porTecnico.get(t)!
                    return (
                      <tr key={t}>
                        <td className="max-w-[180px] truncate font-medium">
                          <button onClick={() => { setTecnico(tecnico === t && !dia ? null : t); setDia(null) }}
                            className={cx('truncate text-left hover:underline', tecnico === t && !dia && 'text-brand-800 underline')}
                            title={t}>
                            {t}
                          </button>
                        </td>
                        <td className="text-right text-[12px] tabular-nums text-slate-600">
                          {pct(p.ok + p.divergentes, p.base)}
                          {p.divergentes > 0 && <span className="ml-1 font-bold text-red-600">· {p.divergentes}✕</span>}
                        </td>
                        {quadro.dias.map(d => {
                          const c = quadro.celulas.get(`${t}|${d}`)
                          if (!c) return <td key={d} className="text-center text-slate-300">·</td>
                          const ativo = tecnico === t && dia === d
                          return (
                            <td key={d} className="text-center">
                              <button
                                onClick={() => { if (ativo) { setTecnico(null); setDia(null) } else { setTecnico(t); setDia(d) } }}
                                title={`${c.ok + c.divergentes} de ${c.base} conferido(s)${c.divergentes ? ` · ${c.divergentes} não bateu` : ''}${c.naoConferidos ? ` · ${c.naoConferidos} sem conferência` : ''}`}
                                className={cx('inline-flex min-w-[52px] items-center justify-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-semibold tabular-nums ring-1',
                                  COR[situacaoDoDia(c)], ativo && 'outline outline-2 outline-brand-600')}>
                                {c.ok + c.divergentes}/{c.base}
                                {c.divergentes > 0 && <span>· {c.divergentes}✕</span>}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-2 text-[11.5px] text-slate-500">
              <span><b className="text-emerald-700">verde</b> conferiu tudo</span>
              <span><b className="text-amber-700">amarelo</b> parte ou nada conferido</span>
              <span><b className="text-red-600">vermelho</b> alguma não bateu (✕)</span>
              <span>clique na célula, no dia ou no técnico para ver os itens</span>
            </p>
          </Cartao>

          <Cartao className="min-w-0" titulo={
            <span className="flex flex-wrap items-center gap-2">
              <ShieldAlert size={15} className="text-slate-400" />
              Itens de carga
              {(tecnico || dia) && (
                <span className="text-[12px] font-medium text-slate-500">
                  · {[tecnico, dia && `${fmtDataCurta(dia)} (${diaSemana(dia)})`].filter(Boolean).join(' · ')}
                  <button onClick={() => { setTecnico(null); setDia(null) }} className="ml-2 text-brand-700 hover:underline">limpar</button>
                </span>
              )}
            </span>
          } acoes={
            <div className="flex rounded-lg bg-slate-100 p-0.5">
              {(Object.keys(ROTULO_FILTRO) as FiltroDaConferencia[]).map(f => (
                <button key={f} onClick={() => setFiltro(f)}
                  className={cx('rounded-md px-2.5 py-1 text-[12px] font-medium transition',
                    filtro === f ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-600 hover:text-slate-800')}>
                  {ROTULO_FILTRO[f]}
                </button>
              ))}
            </div>
          }>
            {!lista.length ? (
              <p className="px-4 py-6 text-center text-[13px] text-slate-500">Nenhum item com esse recorte.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="tabela w-full min-w-[860px]">
                  <thead>
                    <tr>
                      <th>Dia</th>
                      <th>Técnico</th>
                      <th>Cliente</th>
                      <th>Equipamento</th>
                      <th>Conferência</th>
                      <th>O que não bateu</th>
                      <th>Separou</th>
                      <th>Conferiu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map(l => (
                      <tr key={l.id} className={l.conferencia === 'DIVERGENTE' ? 'bg-red-50/40' : undefined}>
                        <td className="whitespace-nowrap tabular-nums">{fmtDataCurta(l.data)}</td>
                        <td className="max-w-[150px] truncate" title={l.tecnico ?? ''}>{l.tecnico ?? '—'}</td>
                        <td className="max-w-[180px] truncate" title={l.cliente ?? ''}>{l.cliente ?? '—'}</td>
                        <td className="max-w-[220px]">
                          <span className="block truncate" title={l.equipamento ?? ''}>{l.equipamento ?? '—'}</span>
                          {(l.om || l.patrimonio) && (
                            <span className="block text-[11px] text-slate-500">
                              {[l.om && `OM ${l.om}`, l.patrimonio].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={cx('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1', SELO_CONF[l.conferencia].tom)}>
                            {SELO_CONF[l.conferencia].rotulo}
                          </span>
                        </td>
                        <td className="max-w-[240px] text-[12.5px] text-red-700">{l.divergencia ?? ''}</td>
                        <td className="whitespace-nowrap text-[12.5px]">{l.separado_por ?? '—'}</td>
                        <td className="whitespace-nowrap text-[12.5px]">
                          {l.conferido_por ?? '—'}
                          {l.conferido_em && <span className="block text-[11px] text-slate-500">{fmtDataHora(l.conferido_em)}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Cartao>
        </>
      )}
    </Pagina>
  )
}

/** O mesmo número do Relatórios. */
function Numero({ rotulo, valor, legenda, tom }: { rotulo: string; valor: number | string; legenda?: string; tom?: string }) {
  return (
    <div className="rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{rotulo}</div>
      <div className={cx('mt-0.5 text-2xl font-bold tabular-nums', tom ?? 'text-slate-800')}>{valor}</div>
      {legenda && <div className="text-[11px] text-slate-400">{legenda}</div>}
    </div>
  )
}
