// Dashboard do PCM: o estado da operação em uma tela, sem precisar abrir cinco abas.
//
// Ordem de leitura: (1) onde está o trabalho — o funil; (2) como vai o dia de hoje;
// (3) a carga dos próximos dias; (4) quem está na rua e quanto já fez; (5) o que exige
// ação agora; (6) onde a demanda se concentra, que é o gancho do planejamento em lote.
//
// Sobre os gráficos: tudo aqui é uma medida só (quantidade de demandas) — então tudo
// usa uma cor só, o azul da marca. O âmbar não é "outra série": marca o dia de hoje.
// Cada barra é rotulada com o número, então nada depende só da cor.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Inbox, MapPin, Building2, Truck } from 'lucide-react'
import { useData } from '../hooks/useData'
import { useEncerradas } from '../hooks/useEncerradas'
import { Cartao, Pagina, cx } from '../components/ui'
import { STATUS_A_ROTEIRIZAR, STATUS_EM_ROTA, STATUS_FILA, separaNaExpedicao } from '../lib/status'
import { addDias, hojeISO, fmtData, diaSemana, normalizar, agrupar } from '../lib/format'
import { chaveIdentidade } from '../lib/actions'
import type { Demanda } from '../lib/types'

/** Uma medida, uma cor. O âmbar é destaque de "hoje", não uma segunda série. */
const COR_BARRA = '#1f4f7f'
const COR_HOJE = '#d97706'
const DIAS_ADIANTE = 7

export function Dashboard() {
  const { demandas, tecnicos, carregando } = useData()
  const nav = useNavigate()
  const hoje = hojeISO()
  const encerradasHoje = useEncerradas(useMemo(() => [hoje], [hoje]), null, true)

  const m = useMemo(() => {
    const fila = demandas.filter(d => STATUS_FILA.includes(d.status))
    const aRoteirizar = demandas.filter(d => STATUS_A_ROTEIRIZAR.includes(d.status))
    const emRota = demandas.filter(d => STATUS_EM_ROTA.includes(d.status))
    const hojeRota = emRota.filter(d => d.data_planejada === hoje)
    const feitasHoje = encerradasHoje.filter(d => d.status === 'FINALIZADO')
    const totalHoje = hojeRota.length + encerradasHoje.length

    const pendencias = demandas.filter(d => d.herdado_de_pendencia && STATUS_A_ROTEIRIZAR.includes(d.status))
    const atrasadas = demandas.filter(d => d.data_planejada && d.data_planejada < hoje && (STATUS_EM_ROTA.includes(d.status) || STATUS_A_ROTEIRIZAR.includes(d.status)))
    const semVeiculo = emRota.filter(d => !d.veiculo)
    const semData = aRoteirizar.filter(d => d.tecnico_id && !d.data_planejada)
    const semTecnico = aRoteirizar.filter(d => !d.tecnico_id)

    const porTec = tecnicos.filter(t => t.ativo).map(t => {
      const abertos = hojeRota.filter(d => d.tecnico_id === t.id)
      const encerrados = encerradasHoje.filter(d => d.tecnico_id === t.id)
      const doDia = [...abertos, ...encerrados]
      const aSeparar = doDia.filter(d => separaNaExpedicao(d.tipo))
      return {
        t,
        total: doDia.length,
        feitos: encerrados.filter(d => d.status === 'FINALIZADO').length,
        separados: aSeparar.filter(d => d.status_separacao === 'SEPARADO' || d.status === 'FINALIZADO').length,
        aSeparar: aSeparar.length,
        emDesloc: abertos.filter(d => d.status === 'EM_DESLOCAMENTO').length,
        veiculos: Array.from(new Set(doDia.map(d => d.veiculo).filter(Boolean))) as string[],
      }
    }).filter(x => x.total > 0).sort((a, b) => b.total - a.total)

    // Carga dos próximos dias: o que já tem data marcada, roteirizado ou não.
    const comprometidas = [...aRoteirizar, ...emRota]
    const dias = Array.from({ length: DIAS_ADIANTE }, (_, i) => {
      const iso = addDias(hoje, i)
      const doDia = comprometidas.filter(d => d.data_planejada === iso)
      return {
        iso,
        aRoteirizar: doDia.filter(d => STATUS_A_ROTEIRIZAR.includes(d.status)).length,
        emRota: doDia.filter(d => STATUS_EM_ROTA.includes(d.status)).length,
        total: doDia.length + (i === 0 ? encerradasHoje.length : 0),
      }
    })

    // Concentração da semana: onde vale consolidar visita. Alimenta o quadro por cliente/localidade.
    const janela = comprometidas.filter(d => d.data_planejada && d.data_planejada >= hoje && d.data_planejada <= addDias(hoje, DIAS_ADIANTE - 1))
    const topo = (campo: (d: Demanda) => string | null) =>
      Array.from(agrupar(janela, d => normalizar(campo(d)) || '—').entries())
        .map(([, lista]) => ({ rotulo: campo(lista[0]) ?? '—', n: lista.length }))
        .filter(x => x.rotulo !== '—')
        .sort((a, b) => b.n - a.n)
        .slice(0, 5)

    const chaves = new Map<string, number>()
    for (const d of fila) chaves.set(chaveIdentidade(d), (chaves.get(chaveIdentidade(d)) ?? 0) + 1)
    const duplicatasFila = Array.from(chaves.values()).filter(n => n > 1).length

    return {
      fila, aRoteirizar, emRota, hojeRota, feitasHoje, totalHoje, pendencias, atrasadas,
      semVeiculo, semData, semTecnico, porTec, dias, duplicatasFila,
      clientes: topo(d => d.cliente_nome), locais: topo(d => d.local),
    }
  }, [demandas, tecnicos, hoje, encerradasHoje])

  const alertas = m.semTecnico.length + m.semVeiculo.length + m.semData.length + m.atrasadas.length + m.duplicatasFila + m.pendencias.length

  return (
    <Pagina titulo="Painel da operação" subtitulo={`${diaSemana(hoje)}, ${fmtData(hoje)}${carregando ? ' · carregando…' : ''}`}>
      {/* 1. Funil: onde o trabalho está parado. */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <Etapa rotulo="Na fila" n={m.fila.length} legenda="aguardando triagem" icone={Inbox} onClick={() => nav('/fila')} />
        <Etapa rotulo="A roteirizar" n={m.aRoteirizar.length} legenda={`${m.semTecnico.length} sem técnico`} icone={CalendarDays} onClick={() => nav('/planejamento')} alerta={m.semTecnico.length > 0} />
        <Etapa rotulo="Em rota" n={m.emRota.length} legenda={`${m.hojeRota.length} para hoje`} icone={Truck} onClick={() => nav('/roteiro')} />
        <Etapa rotulo="Pendências" n={m.pendencias.length} legenda="reagendadas, a replanejar" icone={AlertTriangle} onClick={() => nav('/pendencias')} alerta={m.pendencias.length > 0} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* 2. O dia de hoje, em número único. */}
        <HeroHoje feitas={m.feitasHoje.length} total={m.totalHoje} emRua={m.hojeRota.filter(d => d.status === 'EM_DESLOCAMENTO').length} onClick={() => nav('/roteiro')} />

        {/* 3. Carga dos próximos dias. */}
        <Cartao titulo={`Carga dos próximos ${DIAS_ADIANTE} dias`} className="lg:col-span-2">
          <BarrasDia dias={m.dias} hoje={hoje} onDia={iso => nav(`/planejamento?data=${iso}`)} />
        </Cartao>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* 4. Quem está na rua. */}
        <Cartao titulo="Técnicos com roteiro hoje" className="lg:col-span-2">
          {m.porTec.length === 0
            ? <p className="px-4 py-8 text-center text-sm text-slate-500">Nenhum roteiro gerado para hoje.</p>
            : (
              <div className="overflow-x-auto">
                <table className="tabela w-full min-w-[560px]">
                  <thead><tr><th>Técnico</th><th>Veículo</th><th className="!text-right">Paradas</th><th>Separação</th><th>Execução</th></tr></thead>
                  <tbody>
                    {m.porTec.map(x => (
                      <tr key={x.t.id} className="cursor-pointer" onClick={() => nav('/roteiro')}>
                        <td>
                          <span className="inline-flex items-center gap-2 font-medium">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: x.t.cor ?? '#94a3b8' }} />{x.t.nome}
                            {x.emDesloc > 0 && <span className="rounded bg-cyan-50 px-1.5 py-0.5 text-[10px] font-bold text-cyan-800 ring-1 ring-cyan-200">na rua</span>}
                          </span>
                        </td>
                        <td className="text-xs text-slate-600">
                          {x.veiculos.length === 0 ? <span className="font-semibold text-red-700">sem veículo</span>
                            : x.veiculos.length > 1 ? <span className="font-semibold text-amber-700">{x.veiculos.length} veículos</span> : x.veiculos[0]}
                        </td>
                        <td className="text-right tabular-nums">{x.total}</td>
                        <td><Medidor feito={x.separados} total={x.aSeparar} /></td>
                        <td><Medidor feito={x.feitos} total={x.total} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Cartao>

        {/* 5. O que exige ação agora. */}
        <Cartao titulo={<span className="flex items-center gap-2">Precisa de ação {alertas > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">{alertas}</span>}</span>}>
          {alertas === 0
            ? <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-emerald-700"><CheckCircle2 size={16} />Nada pendente. Tudo em ordem.</p>
            : (
              <ul className="divide-y divide-slate-100">
                <Alerta n={m.atrasadas.length} texto="com data planejada já vencida" grave onClick={() => nav('/planejamento')} />
                <Alerta n={m.semTecnico.length} texto="sem técnico atribuído" onClick={() => nav('/planejamento')} />
                <Alerta n={m.semData.length} texto="com técnico mas sem data" onClick={() => nav('/planejamento')} />
                <Alerta n={m.semVeiculo.length} texto="roteirizada(s) sem veículo" onClick={() => nav('/planejamento')} />
                <Alerta n={m.pendencias.length} texto="pendência(s) aguardando roteirização" onClick={() => nav('/pendencias')} />
                <Alerta n={m.duplicatasFila} texto="possível(is) duplicata(s) na fila" onClick={() => nav('/fila?auditar=1')} />
              </ul>
            )}
        </Cartao>
      </div>

      {/* 6. Onde a demanda se concentra — o gancho para planejar em lote. */}
      {(m.clientes.length > 0 || m.locais.length > 0) && (
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Concentracao titulo="Clientes com mais demandas na semana" icone={Building2} dados={m.clientes} acao="Agrupar por cliente no planejamento" onAcao={() => nav('/planejamento')} />
          <Concentracao titulo="Localidades com mais demandas na semana" icone={MapPin} dados={m.locais} acao="Agrupar por localidade no planejamento" onAcao={() => nav('/planejamento')} />
        </div>
      )}
    </Pagina>
  )
}

// ---------------------------------------------------------------- etapa do funil
function Etapa({ rotulo, n, legenda, icone: Icone, onClick, alerta }: { rotulo: string; n: number; legenda: string; icone: typeof Inbox; onClick(): void; alerta?: boolean }) {
  return (
    <button onClick={onClick} className="group rounded-xl bg-white px-4 py-3.5 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-brand-300">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{rotulo}</span>
        <Icone size={15} className={cx('transition', alerta ? 'text-amber-500' : 'text-slate-300 group-hover:text-brand-400')} />
      </div>
      <div className="mt-1 text-[28px] font-bold leading-none tabular-nums text-slate-900">{n}</div>
      <div className={cx('mt-1.5 truncate text-[11.5px]', alerta ? 'font-medium text-amber-700' : 'text-slate-500')}>{legenda}</div>
    </button>
  )
}

// ---------------------------------------------------------------- número-herói do dia
function HeroHoje({ feitas, total, emRua, onClick }: { feitas: number; total: number; emRua: number; onClick(): void }) {
  const pct = total ? Math.round((feitas / total) * 100) : 0
  return (
    <button onClick={onClick} className="flex h-full flex-col justify-between overflow-hidden rounded-xl bg-gradient-to-br from-brand-800 to-brand-600 p-4 text-left text-white shadow-sm transition hover:brightness-110">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-acento-400">Execução de hoje</div>
      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-[40px] font-black leading-none tabular-nums">{feitas}</span>
        <span className="text-[18px] font-bold text-white/55">/ {total}</span>
        <span className="ml-1 text-[12px] text-white/70">concluídas</span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
        <div className="h-full rounded-full bg-acento-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2.5 flex items-center gap-3 text-[12px] text-white/75">
        <span>{pct}% do dia</span>
        <span className="h-1 w-1 rounded-full bg-white/30" />
        <span>{emRua} em deslocamento</span>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------- carga por dia
function BarrasDia({ dias, hoje, onDia }: { dias: { iso: string; aRoteirizar: number; emRota: number; total: number }[]; hoje: string; onDia(iso: string): void }) {
  const [sobre, setSobre] = useState<string | null>(null)
  const max = Math.max(1, ...dias.map(d => d.total))

  return (
    <div className="px-4 pb-4 pt-3">
      <div className="flex h-36 items-end gap-1.5 sm:gap-2">
        {dias.map((d, i) => {
          const eHoje = d.iso === hoje
          const ativo = sobre === d.iso
          // Alinhamento do balão pela borda: no centro ele estouraria o cartão nas pontas.
          const borda = i <= 1 ? 'left-0' : i >= dias.length - 2 ? 'right-0' : 'left-1/2 -translate-x-1/2'
          return (
            <button key={d.iso} onClick={() => onDia(d.iso)}
              onMouseEnter={() => setSobre(d.iso)} onMouseLeave={() => setSobre(s => (s === d.iso ? null : s))}
              className="group relative flex h-full flex-1 flex-col justify-end gap-1.5"
              title={`${fmtData(d.iso)}: ${d.total} demanda(s) — ${d.emRota} em rota, ${d.aRoteirizar} a roteirizar`}>
              {ativo && (
                <div className={cx('pointer-events-none absolute -top-1 z-10 w-max rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] leading-tight text-white shadow-lg', borda)}>
                  <div className="font-bold">{fmtData(d.iso)}</div>
                  <div className="text-white/75">{d.emRota} em rota · {d.aRoteirizar} a roteirizar</div>
                </div>
              )}
              <div className="text-center text-[11px] font-bold tabular-nums text-slate-700">{d.total || ''}</div>
              <div className="w-full rounded-t transition-opacity" style={{
                height: `${(d.total / max) * 100}%`,
                minHeight: d.total ? 4 : 2,
                background: d.total ? (eHoje ? COR_HOJE : COR_BARRA) : '#e2e8f0',
                opacity: sobre && !ativo ? 0.65 : 1,
              }} />
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex gap-1.5 border-t border-slate-100 pt-2 sm:gap-2">
        {dias.map(d => (
          <div key={d.iso} className={cx('flex-1 text-center text-[10.5px] leading-tight', d.iso === hoje ? 'font-bold text-acento-600' : 'text-slate-500')}>
            <div>{d.iso === hoje ? 'hoje' : diaSemana(d.iso)}</div>
            <div className="tabular-nums opacity-70">{d.iso.slice(8, 10)}/{d.iso.slice(5, 7)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- medidor de proporção
function Medidor({ feito, total }: { feito: number; total: number }) {
  if (total === 0) return <span className="text-[11px] text-slate-400">—</span>
  const pct = (feito / total) * 100
  const completo = feito >= total
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: completo ? '#059669' : COR_BARRA }} />
      </div>
      <span className={cx('text-[11px] font-semibold tabular-nums', completo ? 'text-emerald-700' : 'text-slate-600')}>{feito}/{total}</span>
    </div>
  )
}

// ---------------------------------------------------------------- top 5 (cliente / localidade)
function Concentracao({ titulo, icone: Icone, dados, acao, onAcao }: { titulo: string; icone: typeof MapPin; dados: { rotulo: string; n: number }[]; acao: string; onAcao(): void }) {
  const max = Math.max(1, ...dados.map(d => d.n))
  return (
    <Cartao titulo={<span className="flex items-center gap-2"><Icone size={14} className="text-slate-400" />{titulo}</span>}>
      <ul className="space-y-2 px-4 py-3">
        {dados.map(d => (
          <li key={d.rotulo} className="flex items-center gap-3">
            <span className="w-1/2 truncate text-[12.5px] font-medium text-slate-700" title={d.rotulo}>{d.rotulo}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full" style={{ width: `${(d.n / max) * 100}%`, background: COR_BARRA }} />
            </div>
            <span className="w-6 shrink-0 text-right text-[12px] font-bold tabular-nums text-slate-700">{d.n}</span>
          </li>
        ))}
      </ul>
      <button onClick={onAcao} className="flex w-full items-center justify-center gap-1.5 border-t border-slate-100 px-4 py-2.5 text-[12px] font-semibold text-brand-700 transition hover:bg-brand-50">
        {acao}<ArrowRight size={13} />
      </button>
    </Cartao>
  )
}

// ---------------------------------------------------------------- linha de alerta
function Alerta({ n, texto, onClick, grave }: { n: number; texto: string; onClick(): void; grave?: boolean }) {
  if (!n) return null
  return (
    <li className="flex cursor-pointer items-center gap-2.5 px-4 py-2.5 text-sm transition hover:bg-slate-50" onClick={onClick}>
      <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold tabular-nums',
        grave ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800')}>{n}</span>
      <span className="flex-1 text-slate-700">{texto}</span>
      <ArrowRight size={13} className="shrink-0 text-slate-300" />
    </li>
  )
}
