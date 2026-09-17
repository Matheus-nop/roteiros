// Relatórios: quem, o quê e onde concentra o trabalho da equipe.
//
// A pergunta que essa tela responde não é "o que está acontecendo hoje" (isso é o
// painel) e sim "o que vem se repetindo". Por isso tudo aqui é recortado por período e
// ordenado por concentração — o topo de cada lista é onde vale a pena mexer.
//
// DE ONDE VÊM OS NÚMEROS
//
// Da view `v_rel_demandas` (migração 0008), que devolve uma linha por demanda com as
// dimensões já resolvidas — inclusive as demandas arquivadas, que são justamente as que
// contam a história. Enquanto a migração não roda, a tela cai nas demandas ativas em
// memória e diz isso na cara do usuário: relatório que não avisa que está incompleto é
// pior do que relatório nenhum.
import { AlertTriangle, BarChart3, Building2, ClipboardCheck, MapPin, Package, RotateCcw, ShieldAlert, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useData } from '../hooks/useData'
import { db } from '../lib'
import {
  agrupar, conferenciaDaCarga, daDemanda, porMes, resumir, topo, ultimosMeses,
  type LinhaFato, type Ranking,
} from '../lib/relatorios'
import { Cartao, Pagina, Vazio, cx } from '../components/ui'
import { fmtData } from '../lib/format'

const COR_BARRA = '#1f4f7f'
const COR_APOIO = '#d97706'

// O PostgREST corta em 1000 linhas por resposta, calado. Num relatório, resposta cortada
// sem aviso é pior do que erro: o número aparece, parece certo e está errado. Por isso a
// busca é paginada até a última página vir curta.
const PAGINA = 1000
/** Teto de segurança: 40 mil linhas é muito além de qualquer ano da operação. */
const MAX_PAGINAS = 40

async function buscarTudo(meses: string[]): Promise<LinhaFato[]> {
  const tudo: LinhaFato[] = []
  for (let i = 0; i < MAX_PAGINAS; i++) {
    const pagina = await db.select<LinhaFato>('v_rel_demandas', {
      in: { mes: meses },
      order: [{ col: 'data', asc: false }],
      limit: PAGINA,
      offset: i * PAGINA,
    })
    tudo.push(...pagina)
    if (pagina.length < PAGINA) break
  }
  return tudo
}

const PERIODOS = [
  { k: '1', rotulo: 'Este mês', meses: 1 },
  { k: '3', rotulo: '3 meses', meses: 3 },
  { k: '12', rotulo: '12 meses', meses: 12 },
] as const

export function Relatorios() {
  const { demandas, tecnicoPorId, carregando } = useData()
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]['k']>('3')
  const [daView, setDaView] = useState<LinhaFato[] | null>(null)
  const [buscando, setBuscando] = useState(true)

  const meses = useMemo(() => ultimosMeses(PERIODOS.find(p => p.k === periodo)!.meses), [periodo])
  const chaveMeses = meses.join('|')

  useEffect(() => {
    let vivo = true
    setBuscando(true)
    // Filtra por `mes` no servidor: a tela nunca baixa período que não está olhando.
    buscarTudo(chaveMeses.split('|'))
      .then(r => { if (vivo) { setDaView(r); setBuscando(false) } })
      .catch(() => { if (vivo) { setDaView(null); setBuscando(false) } })
    return () => { vivo = false }
  }, [chaveMeses])

  // Reserva: as demandas ativas em memória. Serve para a tela não abrir vazia antes da
  // migração, mas não é o relatório — e o aviso abaixo deixa isso explícito.
  const daMemoria = useMemo(
    () => demandas.map(d => daDemanda(d, id => tecnicoPorId(id)?.nome ?? null)).filter(l => meses.includes(l.mes)),
    [demandas, tecnicoPorId, meses])

  const completo = daView !== null
  const linhas = completo ? daView : daMemoria

  const resumo = useMemo(() => resumir(linhas), [linhas])
  const clientes = useMemo(() => agrupar(linhas, l => l.cliente), [linhas])
  const equipamentos = useMemo(() => agrupar(linhas, l => l.equipamento), [linhas])
  const tecnicos = useMemo(() => agrupar(linhas, l => l.tecnico), [linhas])
  const locais = useMemo(() => agrupar(linhas, l => l.localidade), [linhas])
  const serie = useMemo(() => porMes(linhas, meses), [linhas, meses])
  const conf = useMemo(() => conferenciaDaCarga(linhas), [linhas])

  const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`)

  return (
    <Pagina
      titulo="Relatórios"
      subtitulo={`${meses.length === 1 ? 'Mês corrente' : `Últimos ${meses.length} meses`} · ${resumo.total} demanda(s)${buscando || carregando ? ' · carregando…' : ''}`}
      acoes={
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {PERIODOS.map(p => (
            <button key={p.k} onClick={() => setPeriodo(p.k)}
              className={cx('rounded-md px-3 py-1 text-[12.5px] font-medium transition',
                periodo === p.k ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-600 hover:text-slate-800')}>
              {p.rotulo}
            </button>
          ))}
        </div>
      }>

      {!completo && !buscando && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <b>Relatório parcial.</b> Estes números saem só das demandas <b>ainda ativas</b> — o que já foi
            concluído, cancelado ou arquivado está de fora. Rode a migração <code>0008_relatorios_e_vocabulario.sql</code> no
            Supabase para o relatório passar a ler o histórico inteiro.
          </div>
        </div>
      )}

      {!linhas.length ? (
        <Vazio titulo="Nada no período" texto="Não há demandas com data neste recorte. Experimente 12 meses." />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Numero rotulo="Demandas" valor={resumo.total} />
            <Numero rotulo="Concluídas" valor={resumo.concluidas} tom="text-emerald-700" />
            <Numero rotulo="Taxa de conclusão" valor={pct(resumo.taxa)} legenda="sobre o que já teve desfecho" />
            <Numero rotulo="Reagendamentos" valor={resumo.reagendamentos} tom="text-amber-700" />
            <Numero rotulo="Em aberto" valor={resumo.emAberto} legenda="ainda em algum estágio" />
          </div>

          {/* `items-start`: sem isso os cartões da linha esticam até a altura do maior. */}
          <div className="mb-4 grid items-start gap-4 xl:grid-cols-3">
            <Cartao titulo="Volume por mês" className="min-w-0 xl:col-span-2">
              <SerieMensal serie={serie} />
            </Cartao>
            <Cartao titulo={<Titulo icone={MapPin}>Localidades que mais concentram</Titulo>} className="min-w-0">
              <Lista dados={topo(locais, 'total', 8)} campo="total" sufixo="demandas" />
            </Cartao>
          </div>

          {/* ── Conferência da carga (0019/0020) ──
              Fica acima dos rankings de sempre porque responde a uma pergunta
              mais urgente que "quem atende mais": a carga que sai está certa?
              E, antes disso, alguém está olhando? */}
          <div className="mb-4">
            <h2 className="mb-2 flex items-center gap-2 text-[15px] font-bold text-slate-800">
              <ClipboardCheck size={16} className="text-slate-400" />
              Conferência da carga
              {/* De quando em diante estes números valem. Sem isto, a adesão
                  muda de tamanho quando a janela muda e ninguém sabe por quê —
                  e número que muda sem explicação é número em que não se
                  confia. */}
              {conf.inicio && (
                <span className="text-[12px] font-medium text-slate-500">
                  · desde {fmtData(conf.inicio)}, a primeira carga conferida
                </span>
              )}
            </h2>

            {conf.base === 0 ? (
              /* A tela é nova. Cobrar adesão de um período em que ela não
                 existia seria inventar uma falha que não houve — e a primeira
                 coisa que o gestor faria com esse 0% é uma conversa injusta. */
              <p className="rounded-xl bg-white px-4 py-6 text-center text-[13px] text-slate-500 shadow-sm ring-1 ring-slate-200">
                Nenhuma carga foi conferida ainda. Assim que o primeiro técnico conferir,
                esta seção passa a contar <b>daquela carga em diante</b> — o que saiu antes
                não entra, porque não havia como conferir.
              </p>
            ) : (
              <>
              {/* A adesão vem primeiro e sozinha na frente do resto: divergência
                  zero não quer dizer carga certa, quer dizer que ninguém
                  conferiu. Sem este aviso o relatório vira otimismo. */}
              {(conf.adesao ?? 0) < 0.5 && (
                <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
                  <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <b>Leia a adesão antes dos números.</b> {conf.conferidos === 0
                      ? 'Nenhum item foi conferido no período — o zero de divergências abaixo não significa carga certa, significa que ninguém olhou.'
                      : `Só ${pct(conf.adesao)} da carga foi conferida. O que aparece abaixo é o que deu para ver nessa fatia, não o retrato do período.`}
                  </div>
                </div>
              )}

              <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Numero rotulo="Adesão" valor={pct(conf.adesao)}
                  legenda={`${conf.conferidos} de ${conf.base} itens de carga`}
                  tom={(conf.adesao ?? 0) >= 0.8 ? 'text-emerald-700' : 'text-amber-700'} />
                <Numero rotulo="Divergências" valor={conf.divergentes}
                  tom={conf.divergentes > 0 ? 'text-red-600' : 'text-emerald-700'}
                  legenda="itens que o técnico apontou" />
                <Numero rotulo="Taxa de erro" legenda="sobre o que foi conferido"
                  valor={conf.conferidos ? pct(conf.divergentes / conf.conferidos) : '—'} />
                <Numero rotulo="Saíram sem conferência" valor={conf.base - conf.conferidos}
                  legenda="ninguém olhou antes de sair"
                  tom={conf.base - conf.conferidos > 0 ? 'text-amber-700' : undefined} />
              </div>

              <div className="grid items-start gap-4 xl:grid-cols-3">
                <Cartao titulo={<Titulo icone={ShieldAlert}>Quem separou o que não bateu</Titulo>} className="min-w-0">
                  {conf.porExpedidor.length ? (
                    <>
                      <Tabela
                        dados={conf.porExpedidor}
                        colunas={[
                          { r: 'Separou', v: d => d.base },
                          { r: 'Não bateu', v: d => d.divergencias, alerta: d => d.divergencias > 0 },
                          { r: 'Taxa', v: d => pct(d.taxa) },
                        ]} />
                      {/* O aviso que evita a leitura errada mais provável desta
                          tabela — e a mais cara, porque é a que vira conversa
                          injusta com quem trabalha mais. */}
                      <p className="border-t border-slate-100 px-4 py-2 text-[11.5px] text-slate-500">
                        Ordenado pela taxa, não pelo número. Quem separa mais erra mais em
                        quantidade sem errar mais em proporção.
                      </p>
                    </>
                  ) : (
                    <p className="px-4 py-6 text-center text-[13px] text-slate-500">
                      Nenhuma divergência apontada no período.
                    </p>
                  )}
                </Cartao>

                <Cartao titulo={<Titulo icone={AlertTriangle}>O que mais acontece</Titulo>} className="min-w-0">
                  {conf.porMotivo.length ? (
                    <ul className="space-y-2 px-4 py-3">
                      {conf.porMotivo.slice(0, 8).map(m => (
                        <li key={m.rotulo} className="flex items-center gap-3">
                          <span className="w-1/2 truncate text-[12.5px] font-medium text-slate-700" title={m.rotulo}>{m.rotulo}</span>
                          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full"
                              style={{ width: `${(m.total / conf.porMotivo[0].total) * 100}%`, background: COR_BARRA }} />
                          </div>
                          <span className="w-7 shrink-0 text-right text-[12px] font-bold tabular-nums text-slate-700">{m.total}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-4 py-6 text-center text-[13px] text-slate-500">Nada apontado no período.</p>
                  )}
                </Cartao>

                <Cartao titulo={<Titulo icone={Users}>Quem está conferindo</Titulo>} className="min-w-0">
                  <Tabela
                    dados={conf.porTecnico.slice(0, 12)}
                    colunas={[
                      { r: 'Carga', v: d => d.base },
                      { r: 'Conferiu', v: d => d.conferidos },
                      { r: 'Adesão', v: d => pct(d.adesao), alerta: d => (d.adesao ?? 1) < 0.5 },
                    ]} />
                  <p className="border-t border-slate-100 px-4 py-2 text-[11.5px] text-slate-500">
                    Do menor para o maior: quem está no topo carregou sem conferir, e é
                    carga que ninguém olhou.
                  </p>
                </Cartao>
              </div>
              </>
            )}
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-2">
            <Cartao titulo={<Titulo icone={Building2}>Clientes</Titulo>} className="min-w-0">
              <Tabela
                dados={topo(clientes, 'total', 12)}
                colunas={[
                  { r: 'Demandas', v: d => d.total },
                  { r: 'Concluídas', v: d => d.concluidas },
                  { r: 'Reag.', v: d => d.reagendamentos, alerta: d => d.reagendamentos > 0 },
                  { r: 'Taxa', v: d => pct(d.taxa) },
                ]} />
            </Cartao>

            <Cartao titulo={<Titulo icone={Package}>Equipamentos que mais dão manutenção</Titulo>} className="min-w-0">
              {topo(equipamentos, 'manutencoes', 12).length ? (
                <Tabela
                  dados={topo(equipamentos, 'manutencoes', 12)}
                  colunas={[
                    { r: 'Manutenções', v: d => d.manutencoes, alerta: d => d.manutencoes > 1 },
                    { r: 'Demandas', v: d => d.total },
                    { r: 'Reag.', v: d => d.reagendamentos },
                  ]} />
              ) : (
                <p className="px-4 py-6 text-center text-[13px] text-slate-500">
                  Nenhuma manutenção, retorno ou retirada para orçamento no período.
                </p>
              )}
            </Cartao>

            <Cartao titulo={<Titulo icone={Users}>Técnicos</Titulo>} className="min-w-0">
              <Tabela
                dados={topo(tecnicos, 'total', 12)}
                colunas={[
                  { r: 'Atendimentos', v: d => d.total },
                  { r: 'Concluídos', v: d => d.concluidas },
                  { r: 'Reag.', v: d => d.reagendamentos, alerta: d => d.reagendamentos > 0 },
                  { r: 'Taxa', v: d => pct(d.taxa) },
                ]} />
            </Cartao>

            <Cartao titulo={<Titulo icone={RotateCcw}>Quem mais reagenda</Titulo>} className="min-w-0">
              {topo(clientes, 'reagendamentos', 8).length || topo(tecnicos, 'reagendamentos', 8).length ? (
                <div className="grid gap-0 sm:grid-cols-2 sm:divide-x sm:divide-slate-100">
                  <Subitem titulo="Por cliente" dados={topo(clientes, 'reagendamentos', 6)} />
                  <Subitem titulo="Por técnico" dados={topo(tecnicos, 'reagendamentos', 6)} />
                </div>
              ) : (
                <p className="px-4 py-6 text-center text-[13px] text-slate-500">Nenhum reagendamento no período. Bom sinal.</p>
              )}
            </Cartao>
          </div>
        </>
      )}
    </Pagina>
  )
}

function Titulo({ icone: Icone, children }: { icone: typeof BarChart3; children: React.ReactNode }) {
  return <span className="flex items-center gap-2"><Icone size={14} className="text-slate-400" />{children}</span>
}

function Numero({ rotulo, valor, legenda, tom }: { rotulo: string; valor: number | string; legenda?: string; tom?: string }) {
  return (
    <div className="rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{rotulo}</div>
      <div className={cx('mt-0.5 text-2xl font-bold tabular-nums', tom ?? 'text-slate-800')}>{valor}</div>
      {legenda && <div className="text-[11px] text-slate-400">{legenda}</div>}
    </div>
  )
}

/** Barras do volume mensal, com a fatia concluída em destaque dentro da mesma barra. */
function SerieMensal({ serie }: { serie: { mes: string; total: number; concluidas: number }[] }) {
  const max = Math.max(1, ...serie.map(s => s.total))
  return (
    <div className="px-4 pb-3 pt-4">
      <div className="flex h-40 items-end gap-2">
        {serie.map(s => (
          <div key={s.mes} className="flex h-full flex-1 flex-col justify-end gap-1.5"
            title={`${rotuloMes(s.mes)}: ${s.total} demanda(s), ${s.concluidas} concluída(s)`}>
            <div className="text-center text-[11px] font-bold tabular-nums text-slate-700">{s.total || ''}</div>
            <div className="flex w-full flex-col justify-end rounded-t"
              style={{ height: `${(s.total / max) * 100}%`, minHeight: s.total ? 4 : 2, background: s.total ? COR_BARRA : '#e2e8f0' }}>
              <div className="w-full rounded-b" style={{ height: `${s.total ? (s.concluidas / s.total) * 100 : 0}%`, background: COR_APOIO }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2 border-t border-slate-100 pt-2">
        {serie.map(s => <div key={s.mes} className="flex-1 text-center text-[10.5px] text-slate-500">{rotuloMes(s.mes)}</div>)}
      </div>
      <div className="mt-1 flex items-center justify-center gap-3 text-[10.5px] text-slate-500">
        <Legenda cor={COR_BARRA}>lançadas</Legenda>
        <Legenda cor={COR_APOIO}>concluídas</Legenda>
      </div>
    </div>
  )
}

function Legenda({ cor, children }: { cor: string; children: React.ReactNode }) {
  return <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: cor }} />{children}</span>
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const rotuloMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1] ?? m}/${m.slice(2, 4)}`

/** Lista com barra proporcional — para quando só interessa a concentração. */
function Lista({ dados, campo, sufixo }: { dados: Ranking[]; campo: keyof Ranking; sufixo: string }) {
  const max = Math.max(1, ...dados.map(d => Number(d[campo] ?? 0)))
  if (!dados.length) return <p className="px-4 py-6 text-center text-[13px] text-slate-500">Sem dados no período.</p>
  return (
    <ul className="space-y-2 px-4 py-3">
      {dados.map(d => (
        <li key={d.rotulo} className="flex items-center gap-3">
          <span className="w-1/2 truncate text-[12.5px] font-medium text-slate-700" title={d.rotulo}>{d.rotulo}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${(Number(d[campo] ?? 0) / max) * 100}%`, background: COR_BARRA }} />
          </div>
          <span className="w-7 shrink-0 text-right text-[12px] font-bold tabular-nums text-slate-700" title={sufixo}>{String(d[campo])}</span>
        </li>
      ))}
    </ul>
  )
}

type Coluna<T> = { r: string; v(d: T): number | string; alerta?(d: T): boolean }

/** Ranking com colunas. Rola na horizontal no celular em vez de espremer o nome.
 *  Genérica porque a conferência da carga tem forma própria (`LinhaConferencia`)
 *  e duplicar a tabela por causa do tipo seria duas tabelas divergindo no
 *  primeiro ajuste. */
function Tabela<T extends { rotulo: string }>({ dados, colunas }: { dados: T[]; colunas: Coluna<T>[] }) {
  if (!dados.length) return <p className="px-4 py-6 text-center text-[13px] text-slate-500">Sem dados no período.</p>
  return (
    <div className="overflow-x-auto">
      <table className="tabela w-full min-w-[420px]">
        <thead>
          <tr>
            <th>Nome</th>
            {colunas.map(c => <th key={c.r} className="text-right">{c.r}</th>)}
          </tr>
        </thead>
        <tbody>
          {dados.map(d => (
            <tr key={d.rotulo}>
              <td className="max-w-[220px] truncate font-medium" title={d.rotulo}>{d.rotulo}</td>
              {colunas.map(c => (
                <td key={c.r} className={cx('text-right tabular-nums', c.alerta?.(d) && 'font-bold text-amber-700')}>{c.v(d)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Subitem({ titulo, dados }: { titulo: string; dados: Ranking[] }) {
  return (
    <div className="px-4 py-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</div>
      {dados.length ? (
        <ul className="space-y-1.5">
          {dados.map(d => (
            <li key={d.rotulo} className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="truncate text-slate-700" title={d.rotulo}>{d.rotulo}</span>
              <span className="shrink-0 font-bold tabular-nums text-amber-700">{d.reagendamentos}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-[12.5px] text-slate-400">—</p>}
    </div>
  )
}
