// Agenda de treinamentos: calendário do mês, aviso do que está perto, e a lista.
//
// POR QUE CALENDÁRIO, E NÃO MAIS UMA TABELA
//
// O resto do app é tabela e quadro por status, porque demanda se organiza por
// ESTADO — está na fila, está separada, está na rua. Treinamento não: ele se
// organiza por DATA. A pergunta que se faz aqui é "que dia da semana que vem
// ainda está livre para o pessoal da Affonseca?", e essa pergunta uma lista
// ordenada por data responde mal. O mês inteiro numa tela responde de imediato.
//
// O QUE ESTA TELA NÃO FAZ: marcar presença em campo. A folha sai impressa, as
// pessoas assinam à caneta em obra, e os nomes são digitados aqui depois — é do
// que está digitado que saem os certificados (ver components/FolhaPresenca.tsx).
import { useMemo, useState } from 'react'
import { CalendarPlus, ChevronLeft, ChevronRight, GraduationCap, MapPin, Users } from 'lucide-react'
import { useData } from '../hooks/useData'
import { useAuth } from '../hooks/useAuth'
import { Badge, Botao, Cartao, Pagina, Vazio, cx } from '../components/ui'
import { ModalTreinamento } from '../components/ModalTreinamento'
import { PainelTreinamento } from '../components/PainelTreinamento'
import { addDias, agrupar, fmtData, hojeISO, plural, toISO } from '../lib/format'
import {
  ROTULO_PROXIMIDADE, STATUS_TREINAMENTO_LABEL, STATUS_TREINAMENTO_TONE, TOM_PROXIMIDADE,
  codigoTreinamento, fmtCarga, fmtHora, paraAvisar,
} from '../lib/treinamentos'
import type { Treinamento } from '../lib/types'

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** "setembro de 2026" → "Setembro de 2026". A classe `capitalize` do Tailwind
 *  maiusculiza cada palavra e produziria "Setembro De 2026". */
function mesPorExtenso(ano: number, mes: number): string {
  const s = new Date(ano, mes, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** As 42 células do mês (seis semanas), começando no domingo da primeira. */
function gradeDoMes(ano: number, mes: number): string[] {
  const deslocamento = new Date(ano, mes, 1).getDay()
  return Array.from({ length: 42 }, (_, i) => toISO(new Date(ano, mes, 1 - deslocamento + i)))
}

export function Treinamentos() {
  const { treinamentos, presencas, tecnicoPorId, erroTreinamentos } = useData()
  const { pode } = useAuth()
  const hoje = hojeISO()
  const podeEditar = pode('treinamentos.editar')

  const [mes, setMes] = useState(() => { const d = new Date(); return { ano: d.getFullYear(), mes: d.getMonth() } })
  const [aberto, setAberto] = useState<Treinamento | null>(null)
  const [agendando, setAgendando] = useState<{ data: string } | null>(null)
  const [editando, setEditando] = useState<Treinamento | null>(null)

  const porDia = useMemo(() => agrupar(treinamentos, t => t.data), [treinamentos])
  const contagemPorTreinamento = useMemo(
    () => agrupar(presencas.filter(p => p.presente), p => p.treinamento_id),
    [presencas])

  const grade = useMemo(() => gradeDoMes(mes.ano, mes.mes), [mes])
  const doMes = useMemo(
    () => treinamentos
      .filter(t => Number(t.data.slice(0, 4)) === mes.ano && Number(t.data.slice(5, 7)) === mes.mes + 1)
      .sort((a, b) => a.data.localeCompare(b.data) || a.hora_inicio.localeCompare(b.hora_inicio)),
    [treinamentos, mes])

  const avisos = useMemo(() => paraAvisar(treinamentos, hoje), [treinamentos, hoje])
  const rotuloMes = mesPorExtenso(mes.ano, mes.mes)
  const andar = (n: number) => setMes(m => {
    const d = new Date(m.ano, m.mes + n, 1)
    return { ano: d.getFullYear(), mes: d.getMonth() }
  })

  if (erroTreinamentos) {
    return (
      <Pagina titulo="Treinamentos">
        <Vazio titulo="A agenda de treinamentos ainda não existe no banco"
          texto={`Rode a migração supabase/migrations/0016_treinamentos.sql no SQL Editor do Supabase. O banco respondeu: ${erroTreinamentos}`} />
      </Pagina>
    )
  }

  return (
    <Pagina
      titulo="Treinamentos"
      subtitulo="Treinamento gratuito ao cliente: agenda, lista de presença e certificado."
      acoes={podeEditar && <Botao variante="primario" onClick={() => setAgendando({ data: hoje })}><CalendarPlus size={14} />Agendar treinamento</Botao>}>

      {/* O aviso. Fica no topo porque é a razão de alguém abrir esta tela sem ter
          vindo agendar nada — ver o que está chegando. */}
      {avisos.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {avisos.map(({ t, quando }) => {
            const tec = tecnicoPorId(t.tecnico_id)
            return (
              <button key={t.id} onClick={() => setAberto(t)}
                className={cx('flex items-center gap-2 rounded-lg px-3 py-2 text-left text-[12.5px] ring-1 ring-inset transition hover:brightness-95', TOM_PROXIMIDADE[quando])}>
                <GraduationCap size={15} className="shrink-0 opacity-70" />
                <span>
                  <b>{ROTULO_PROXIMIDADE[quando]}</b> · {fmtData(t.data)} {fmtHora(t.hora_inicio)} ·{' '}
                  {t.cliente_nome ?? 'cliente a definir'} · {t.tema}
                  {tec ? ` · ${tec.nome}` : ' · sem instrutor'}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* ------------------------------------------------------------ calendário */}
      <Cartao
        titulo={rotuloMes}
        acoes={<>
          <Botao tamanho="sm" onClick={() => andar(-1)} title="Mês anterior"><ChevronLeft size={14} /></Botao>
          <Botao tamanho="sm" onClick={() => { const d = new Date(); setMes({ ano: d.getFullYear(), mes: d.getMonth() }) }}>Hoje</Botao>
          <Botao tamanho="sm" onClick={() => andar(1)} title="Próximo mês"><ChevronRight size={14} /></Botao>
        </>}>
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {DIAS_SEMANA.map(d => (
            <div key={d} className="px-2 py-1.5 text-center text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {grade.map(iso => {
            const doDia = (porDia.get(iso) ?? []).sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
            const foraDoMes = Number(iso.slice(5, 7)) !== mes.mes + 1
            const eHoje = iso === hoje
            return (
              <div key={iso}
                className={cx('min-h-[92px] border-b border-r border-slate-100 p-1 last:border-r-0',
                  foraDoMes && 'bg-slate-50/60', eHoje && 'bg-acento-400/10')}>
                <div className="flex items-center justify-between px-1">
                  <span className={cx('text-[11.5px] tabular-nums',
                    eHoje ? 'font-bold text-acento-600' : foraDoMes ? 'text-slate-300' : 'text-slate-500')}>
                    {Number(iso.slice(8, 10))}
                  </span>
                  {podeEditar && !foraDoMes && (
                    <button onClick={() => setAgendando({ data: iso })}
                      className="rounded px-1 text-[15px] leading-none text-slate-300 transition hover:bg-brand-50 hover:text-brand-600"
                      title={`Agendar treinamento em ${fmtData(iso)}`}>+</button>
                  )}
                </div>
                <div className="mt-0.5 space-y-1">
                  {doDia.map(t => {
                    const tec = tecnicoPorId(t.tecnico_id)
                    return (
                      <button key={t.id} onClick={() => setAberto(t)}
                        className={cx('block w-full truncate rounded px-1.5 py-1 text-left text-[10.5px] leading-tight ring-1 ring-inset transition hover:brightness-95',
                          t.status === 'CANCELADO' ? 'bg-slate-100 text-slate-400 line-through ring-slate-200'
                            : t.status === 'REALIZADO' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                            : 'bg-violet-50 text-violet-800 ring-violet-200')}
                        title={`${fmtHora(t.hora_inicio)} · ${t.tema} · ${t.cliente_nome ?? '—'}`}>
                        <span className="flex items-center gap-1">
                          {tec?.cor && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tec.cor }} />}
                          <b className="tabular-nums">{fmtHora(t.hora_inicio)}</b>
                          <span className="truncate">{t.cliente_nome ?? t.tema}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </Cartao>

      {/* ------------------------------------------------------------ lista do mês */}
      <Cartao className="mt-3" titulo={`${rotuloMes} — ${plural(doMes.length, 'treinamento', 'treinamentos')}`}>
        {doMes.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            Nenhum treinamento neste mês.{podeEditar && ' Use o + no dia do calendário para agendar.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela w-full min-w-[760px]">
              <thead>
                <tr>
                  <th>Data</th><th>Horário</th><th>Tema</th><th>Cliente / local</th>
                  <th>Instrutor</th><th className="!text-right">Turma</th><th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {doMes.map(t => {
                  const tec = tecnicoPorId(t.tecnico_id)
                  const turma = contagemPorTreinamento.get(t.id)?.length ?? 0
                  return (
                    <tr key={t.id} className="cursor-pointer" onClick={() => setAberto(t)}>
                      <td className="whitespace-nowrap tabular-nums">
                        {fmtData(t.data)}
                        {t.data === hoje && <span className="ml-1.5 rounded bg-acento-500/15 px-1.5 py-0.5 text-[10px] font-bold text-acento-600">hoje</span>}
                        {t.data === addDias(hoje, 1) && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">amanhã</span>}
                      </td>
                      <td className="whitespace-nowrap tabular-nums text-xs text-slate-600">
                        {fmtHora(t.hora_inicio)}–{fmtHora(t.hora_fim)} <span className="text-slate-400">· {fmtCarga(t.carga_horaria)}</span>
                      </td>
                      <td className="font-medium">{t.tema}<div className="text-[11px] font-normal text-slate-400">{codigoTreinamento(t.numero)}</div></td>
                      <td className="text-xs">
                        <div className="font-medium text-slate-700">{t.cliente_nome ?? '—'}</div>
                        {t.local && <div className="flex items-center gap-1 text-slate-500"><MapPin size={11} />{t.local}</div>}
                      </td>
                      <td className="text-xs">
                        {tec ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tec.cor ?? '#94a3b8' }} />{tec.nome}
                          </span>
                        ) : <span className="font-semibold text-amber-700">a definir</span>}
                      </td>
                      <td className="text-right">
                        <span className="inline-flex items-center gap-1 tabular-nums text-slate-600"><Users size={12} className="text-slate-400" />{turma}</span>
                      </td>
                      <td><Badge tone={STATUS_TREINAMENTO_TONE[t.status]}>{STATUS_TREINAMENTO_LABEL[t.status]}</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      <ModalTreinamento
        aberto={!!agendando || !!editando}
        treinamento={editando}
        dataSugerida={agendando?.data}
        onFechar={() => { setAgendando(null); setEditando(null) }} />

      {aberto && (
        <PainelTreinamento
          treinamento={treinamentos.find(t => t.id === aberto.id) ?? aberto}
          onFechar={() => setAberto(null)}
          onEditar={t => { setAberto(null); setEditando(t) }} />
      )}
    </Pagina>
  )
}
