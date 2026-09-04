// Pendências: o que o técnico não conseguiu executar e já voltou ao planejamento.
//
// Importante: NÃO é uma fila de espera. O reagendamento é automático — ao marcar
// "não deu", a demanda recebe a nova data, volta a AGUARDANDO ROTEIRIZAÇÃO e já aparece
// no quadro do PCM naquele dia. Esta tela é o acompanhamento: o que voltou, de quando,
// por quê, e o que ainda não foi remontado em roteiro.
import { CalendarClock, XCircle, Search, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { BarraSelecao } from '../components/TabelaDemandas'
import { CardDemanda, GrupoCard, Chip } from '../components/Cards'
import { Botao, Campo, Checkbox, Confirmar, Input, Modal, Pagina, Select, Vazio, cx } from '../components/ui'
import { STATUS_A_ROTEIRIZAR, STATUS_ARQUIVADOS, STATUS_EM_ROTA } from '../lib/status'
import { agrupar, normalizar, textoBusca, hojeISO, rotuloData } from '../lib/format'
import type { Demanda } from '../lib/types'

export function Pendencias() {
  const { demandas, acoes, tecnicos } = useData()
  const { pode } = useAuth()
  const { toast, erro } = useToast()
  const [busca, setBusca] = useState('')
  const [tecnico, setTecnico] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [reagendar, setReagendar] = useState<string[] | null>(null)
  const [nova, setNova] = useState(hojeISO())
  const [cancelar, setCancelar] = useState<string[] | null>(null)
  const editar = pode('pendencias.reagendar')
  const hoje = hojeISO()

  const itens = useMemo(() => {
    const b = normalizar(busca)
    return demandas
      .filter(d => d.herdado_de_pendencia && !STATUS_ARQUIVADOS.includes(d.status))
      .filter(d => !tecnico || (tecnico === '__sem' ? !d.tecnico_id : d.tecnico_id === tecnico))
      .filter(d => !b || textoBusca(d).includes(b))
  }, [demandas, busca, tecnico])

  // Agrupado pela data para onde a demanda foi reagendada: é a pergunta real do PCM,
  // "o que volta na quinta?", e não "quais itens existem".
  const porData = useMemo(() => {
    const chave = (d: Demanda) => d.data_reagendada ?? d.data_planejada ?? ''
    return Array.from(agrupar(itens, chave).entries())
      .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
  }, [itens])

  const aguardando = itens.filter(d => STATUS_A_ROTEIRIZAR.includes(d.status)).length
  const jaEmRota = itens.filter(d => STATUS_EM_ROTA.includes(d.status)).length
  const vencidas = itens.filter(d => STATUS_A_ROTEIRIZAR.includes(d.status) && (d.data_reagendada ?? d.data_planejada ?? '') < hoje).length

  const ids = Array.from(sel)
  const run = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast(msg); setSel(new Set()) } catch (e) { erro(e) } }
  const alternar = (id: string, v: boolean) => setSel(s => { const n = new Set(s); v ? n.add(id) : n.delete(id); return n })
  const marcarGrupo = (lista: Demanda[]) => setSel(s => {
    const n = new Set(s); const todos = lista.every(d => n.has(d.id))
    for (const d of lista) todos ? n.delete(d.id) : n.add(d.id)
    return n
  })

  return (
    <Pagina titulo="Pendências" subtitulo="O que o técnico não conseguiu executar já voltou ao planejamento com a nova data — aqui é o acompanhamento do que ainda não foi remontado em roteiro">
      <div className="mb-3 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <Resumo rotulo="Reagendadas ativas" n={itens.length} />
        <Resumo rotulo="A remontar em roteiro" n={aguardando} tom="text-violet-700" />
        <Resumo rotulo="Já de volta em rota" n={jaEmRota} tom="text-emerald-700" icone={CheckCircle2} />
        <Resumo rotulo="Com data vencida" n={vencidas} tom={vencidas ? 'text-red-700' : 'text-slate-700'} icone={vencidas ? AlertTriangle : undefined} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar OS, cliente, local, equipamento…" className="pl-8" /></div>
        <Select value={tecnico} onChange={e => setTecnico(e.target.value)} className="w-48"><option value="">Todos os técnicos</option><option value="__sem">Sem técnico</option>{tecnicos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</Select>
      </div>

      {porData.length === 0 && <Vazio titulo="Nenhuma pendência" texto="Quando um técnico marcar “não deu”, a demanda volta ao planejamento com a nova data e aparece aqui." />}

      <div className="space-y-3">
        {porData.map(([data, lista]) => {
          const atrasada = data && data < hoje
          const aRemontar = lista.filter(d => STATUS_A_ROTEIRIZAR.includes(d.status)).length
          return (
            <GrupoCard key={data || 'sem'} cor={atrasada ? '#dc2626' : '#f59e0b'}
              titulo={<span className="inline-flex items-center gap-1.5"><CalendarClock size={15} className={atrasada ? 'text-red-600' : 'text-amber-600'} />{rotuloData(data || null)}</span>}
              subtitulo={atrasada ? <span className="font-semibold text-red-700">data já passou</span> : undefined}
              contagem={lista.length}
              chips={<>
                {aRemontar > 0 && <Chip tone="bg-violet-50 text-violet-800">{aRemontar} a remontar</Chip>}
                {lista.length - aRemontar > 0 && <Chip tone="bg-emerald-50 text-emerald-800">{lista.length - aRemontar} já em rota</Chip>}
              </>}
              direita={editar && <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-slate-500"><Checkbox checked={lista.every(d => sel.has(d.id))} onChange={() => marcarGrupo(lista)} />marcar grupo</label>}>
              <div className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-2 xl:grid-cols-3">
                {lista.map(d => (
                  <div key={d.id} className={cx('rounded-lg ring-1', sel.has(d.id) ? 'ring-brand-400' : 'ring-slate-200')}>
                    <CardDemanda d={d} vertical mostrarCliente selecionado={sel.has(d.id)} onSelecionar={editar ? v => alternar(d.id, v) : undefined}
                      acoes={editar ? <>
                        <Botao tamanho="sm" variante="fantasma" title="Alterar a data" onClick={() => { setNova(d.data_reagendada ?? hojeISO()); setReagendar([d.id]) }}><CalendarClock size={13} /></Botao>
                        <Botao tamanho="sm" variante="fantasma" title="Cancelar a demanda" onClick={() => setCancelar([d.id])}><XCircle size={13} className="text-red-600" /></Botao>
                      </> : undefined} />
                  </div>
                ))}
              </div>
            </GrupoCard>
          )
        })}
      </div>

      <BarraSelecao n={ids.length} onLimpar={() => setSel(new Set())}>
        {editar && <Botao tamanho="sm" variante="primario" onClick={() => setReagendar(ids)}><CalendarClock size={13} />Alterar a data</Botao>}
        {editar && <Botao tamanho="sm" variante="perigo" onClick={() => setCancelar(ids)}><XCircle size={13} />Cancelar</Botao>}
      </BarraSelecao>

      <Modal aberto={!!reagendar} onFechar={() => setReagendar(null)} titulo="Alterar a data do reagendamento"
        rodape={<><Botao onClick={() => setReagendar(null)}>Voltar</Botao><Botao variante="primario" onClick={() => { const r = reagendar!; setReagendar(null); run(() => acoes.reagendar(r, nova), 'Data alterada.') }}>Aplicar</Botao></>}>
        <Campo rotulo="Nova data planejada"><Input type="date" value={nova} onChange={e => setNova(e.target.value)} /></Campo>
        <p className="mt-2 text-xs text-slate-500">A demanda continua no planejamento (aguardando roteirização) e passa a aparecer no quadro nesta data.</p>
      </Modal>
      <Confirmar aberto={!!cancelar} perigo titulo="Cancelar demanda" texto={`Cancelar ${cancelar?.length} item(ns)? Ficam no histórico e podem ser restaurados.`} onFechar={() => setCancelar(null)}
        onConfirmar={() => { const c = cancelar!; setCancelar(null); run(() => acoes.cancelar(c, null), 'Cancelado(s).') }} />
    </Pagina>
  )
}

function Resumo({ rotulo, n, tom = 'text-slate-900', icone: Icone }: { rotulo: string; n: number; tom?: string; icone?: typeof AlertTriangle }) {
  return (
    <div className="rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{rotulo}</span>
        {Icone && <Icone size={14} className={tom} />}
      </div>
      <div className={cx('mt-1 text-[26px] font-bold leading-none tabular-nums', tom)}>{n}</div>
    </div>
  )
}
