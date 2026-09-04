// Meu roteiro — a tela do técnico em campo.
//
// É a única tela pensada para ser usada de pé, com uma mão, no sol: alvos grandes,
// uma parada por vez, e só dois botões por item ("Concluí" e "Não deu"). Tudo que o
// técnico marca aqui é o que o PCM lê no painel, sem ninguém ligar para ninguém.
//
// O que o técnico NÃO faz aqui: fechar o roteiro do dia (é do PCM/expedição, e a RLS
// nem deixaria gravar o fechamento) e mexer em roteiro de outra pessoa.
import { Check, ChevronDown, Clock, MapPin, Navigation, Play, Printer, CheckCircle2, CircleDashed } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { useEncerradas } from '../hooks/useEncerradas'
import { ModalPendente } from '../components/ModalPendente'
import { EspelhoRoteiro } from '../components/EspelhoRoteiro'
import { usePrint } from '../components/Print'
import { BadgeTipo, Select, Vazio, cx } from '../components/ui'
import { STATUS_EM_ROTA } from '../lib/status'
import { addDias, agrupar, chaveParada, fmtData, fmtPatrimonio, hojeISO, ordenarParadas } from '../lib/format'
import type { Demanda, Tecnico } from '../lib/types'

export function MeuRoteiro() {
  const { demandas, tecnicos, acoes, tecnicoPorId } = useData()
  const { usuario, pode } = useAuth()
  const { toast, erro } = useToast()
  const { imprimir } = usePrint()

  const meuTec = usuario?.perfil.papel === 'TECNICO' ? usuario.perfil.tecnico_id : null
  // Quem não é técnico (PCM conferindo, ADMIN) escolhe de quem é o roteiro.
  const [escolhido, setEscolhido] = useState<string>(() => localStorage.getItem('meu-roteiro-tec') ?? '')
  const tecnicoId = (meuTec ?? escolhido) || null
  const tecnico = tecnicoPorId(tecnicoId)

  const [data, setData] = useState(hojeISO())
  const [pendente, setPendente] = useState<Demanda[] | null>(null)
  const executar = pode('roteiro.executar')

  const encerradas = useEncerradas(useMemo(() => [data], [data]), tecnicoId)
  const abertas = useMemo(
    () => demandas.filter(d => STATUS_EM_ROTA.includes(d.status) && d.tecnico_id === tecnicoId && d.data_planejada === data),
    [demandas, tecnicoId, data])

  // As encerradas continuam na lista, riscadas: é o que prova o progresso do dia.
  const todas = useMemo(() => [...abertas, ...encerradas].sort(ordenarParadas), [abertas, encerradas])
  const paradas = useMemo(() => Array.from(agrupar(todas, chaveParada).values()), [todas])
  const feitas = todas.filter(d => d.status === 'FINALIZADO').length
  const veiculo = todas.find(d => d.veiculo)?.veiculo
  const naRua = abertas.some(d => d.status === 'EM_DESLOCAMENTO')

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn()
      if (msg) toast(msg)
      // Concluído o último item do dia, o roteiro fecha e vai para o arquivo sozinho.
      if (tecnicoId && tecnico && todas.length) {
        const arq = await acoes.arquivarSeCompleto({
          tecnicoId, tecnicoNome: tecnico.nome, data,
          ids: todas.map(d => d.id), veiculo: veiculo ?? null,
          usuarioId: usuario?.id ?? null,
        }).catch(() => null)
        if (arq) toast('Roteiro do dia concluído e arquivado.', 'info')
      }
    } catch (e) { erro(e) }
  }
  const escolher = (id: string) => { setEscolhido(id); localStorage.setItem('meu-roteiro-tec', id) }

  if (!tecnicoId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <Vazio titulo="De quem é o roteiro?" texto="Esta tela mostra um roteiro por vez. O técnico entra direto no seu; quem é do PCM escolhe abaixo.">
          <Select value={escolhido} onChange={e => escolher(e.target.value)} className="w-64">
            <option value="">Selecione o técnico…</option>
            {tecnicos.filter(t => t.ativo).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </Select>
        </Vazio>
        {usuario?.perfil.papel === 'TECNICO' && (
          <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-[13px] text-amber-900 ring-1 ring-amber-200">
            Seu usuário é do tipo técnico mas não está vinculado a nenhum cadastro em <b>Técnicos</b>. Peça ao PCM para
            fazer o vínculo — sem ele o app não sabe quais paradas são suas.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-3 pb-24 pt-3 sm:px-4">
      <Cabecalho
        tecnico={tecnico} veiculo={veiculo ?? undefined} data={data} onData={setData}
        feitas={feitas} total={todas.length} naRua={naRua}
        podeTrocar={!meuTec} tecnicos={tecnicos} tecnicoId={tecnicoId} onTecnico={escolher}
        onImprimir={todas.length ? () => imprimir(<EspelhoRoteiro tecnico={tecnico} data={data} itens={todas} />) : undefined}
        onIniciar={executar && abertas.some(d => d.status !== 'EM_DESLOCAMENTO') ? () => run(() => acoes.iniciarRota(abertas), 'Boa rota!') : undefined}
      />

      {todas.length === 0 && (
        <Vazio titulo={`Nada para ${fmtData(data)}`} texto="Quando o PCM gerar o roteiro desta data, as paradas aparecem aqui — e o app avisa sozinho, sem precisar recarregar." />
      )}

      <div className="mt-3 space-y-2.5">
        {paradas.map((its, i) => (
          <Parada key={its[0].id} itens={its} numero={its[0].ordem_parada ? its[0].ordem_parada / 10 : i + 1}
            executar={executar}
            onFinalizar={lista => run(() => acoes.finalizar(lista.map(d => d.id)), lista.length > 1 ? `Parada concluída (${lista.length} itens).` : 'Item concluído.')}
            onPendente={lista => setPendente(lista)} />
        ))}
      </div>

      {/* Reagendar tira o item do dia — pode ter sido o último em rota, então revalida o arquivo. */}
      {pendente && <ModalPendente itens={pendente} titulo="Não deu para fazer" onFechar={() => { setPendente(null); run(async () => {}, '') }} />}
    </div>
  )
}

// ---------------------------------------------------------------- cabeçalho fixo do dia
function Cabecalho({ tecnico, veiculo, data, onData, feitas, total, naRua, podeTrocar, tecnicos, tecnicoId, onTecnico, onImprimir, onIniciar }: {
  tecnico: Tecnico | undefined; veiculo: string | undefined; data: string; onData(v: string): void
  feitas: number; total: number; naRua: boolean
  podeTrocar: boolean; tecnicos: Tecnico[]; tecnicoId: string; onTecnico(id: string): void
  onImprimir?(): void; onIniciar?(): void
}) {
  const pct = total ? Math.round((feitas / total) * 100) : 0
  const hoje = hojeISO()
  const atalhos: [string, string][] = [['Ontem', addDias(hoje, -1)], ['Hoje', hoje], ['Amanhã', addDias(hoje, 1)]]

  return (
    <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-800 to-brand-600 text-white shadow-sm">
      <div className="px-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-acento-400">Roteiro do dia</div>
            <h1 className="mt-0.5 truncate text-[22px] font-extrabold leading-tight">{tecnico?.nome ?? 'Sem técnico'}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-white/80">
              <span>🚗 {veiculo ?? 'veículo não informado'}</span>
              <span>📅 {fmtData(data)}</span>
              {naRua && <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[11px] font-bold text-emerald-200 ring-1 ring-emerald-400/30">Em rota</span>}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[26px] font-black leading-none tabular-nums">{feitas}<span className="text-[15px] font-bold text-white/60">/{total}</span></div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60">concluídas</div>
          </div>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-acento-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 bg-black/15 px-3 py-2.5">
        {atalhos.map(([rotulo, iso]) => (
          <button key={iso} onClick={() => onData(iso)}
            className={cx('toque rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition',
              data === iso ? 'bg-white text-brand-800' : 'bg-white/10 text-white/85 hover:bg-white/20')}>
            {rotulo}
          </button>
        ))}
        <input type="date" value={data} onChange={e => onData(e.target.value)}
          className="toque rounded-lg bg-white/10 px-2 py-1.5 text-[12.5px] font-medium text-white [color-scheme:dark]" />

        <div className="flex-1" />

        {podeTrocar && (
          <select value={tecnicoId} onChange={e => onTecnico(e.target.value)}
            className="toque max-w-[9.5rem] rounded-lg bg-white/10 px-2 py-1.5 text-[12.5px] font-medium text-white [color-scheme:dark]">
            {tecnicos.filter(t => t.ativo || t.id === tecnicoId).map(t => <option key={t.id} value={t.id} className="text-slate-800">{t.nome}</option>)}
          </select>
        )}
        {onImprimir && <button onClick={onImprimir} title="Imprimir o espelho" className="toque rounded-lg bg-white/10 px-2.5 py-1.5 text-white hover:bg-white/20"><Printer size={15} /></button>}
        {onIniciar && <button onClick={onIniciar} className="toque flex items-center gap-1.5 rounded-lg bg-acento-500 px-3 py-1.5 text-[12.5px] font-bold text-brand-900 hover:bg-acento-400"><Play size={14} />Iniciar rota</button>}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- uma parada (cliente + local)
function Parada({ itens, numero, executar, onFinalizar, onPendente }: {
  itens: Demanda[]; numero: number; executar: boolean
  onFinalizar(lista: Demanda[]): void; onPendente(lista: Demanda[]): void
}) {
  const p0 = itens[0]
  const abertos = itens.filter(d => STATUS_EM_ROTA.includes(d.status))
  const concluida = abertos.length === 0
  // Parada resolvida começa recolhida: o que importa é o que ainda falta.
  const [aberta, setAberta] = useState(!concluida)

  const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p0.local, p0.cliente_nome].filter(Boolean).join(', '))}`

  return (
    <section className={cx('overflow-hidden rounded-xl bg-white shadow-sm ring-1 transition', concluida ? 'ring-emerald-200' : 'ring-slate-200')}>
      <header className={cx('flex items-center gap-3 px-3 py-3', concluida && 'bg-emerald-50/70')}>
        <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[14px] font-black text-white',
          concluida ? 'bg-emerald-500' : 'bg-acao-500')}>
          {concluida ? <Check size={18} /> : numero}
        </span>
        <button onClick={() => setAberta(a => !a)} className="min-w-0 flex-1 text-left">
          <div className={cx('truncate text-[15px] font-bold', concluida ? 'text-emerald-900' : 'text-slate-900')}>{p0.cliente_nome ?? '—'}</div>
          <div className="truncate text-[12.5px] text-slate-500"><MapPin size={11} className="mr-0.5 inline text-red-500" />{p0.local ?? '—'}</div>
        </button>
        <a href={mapa} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
          title="Abrir no mapa" className="toque flex w-10 items-center justify-center rounded-lg text-brand-600 hover:bg-brand-50">
          <Navigation size={18} />
        </a>
        <button onClick={() => setAberta(a => !a)} className="toque flex w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
          <ChevronDown size={18} className={cx('transition', !aberta && '-rotate-90')} />
        </button>
      </header>

      {aberta && (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {itens.map(d => <Item key={d.id} d={d} executar={executar} onFinalizar={() => onFinalizar([d])} onPendente={() => onPendente([d])} />)}

          {executar && abertos.length > 1 && (
            <div className="p-3">
              <button onClick={() => onFinalizar(abertos)}
                className="toque flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-[14px] font-bold text-white shadow-sm transition hover:bg-emerald-700">
                <CheckCircle2 size={17} />Concluir a parada inteira ({abertos.length} itens)
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- um item dentro da parada
function Item({ d, executar, onFinalizar, onPendente }: { d: Demanda; executar: boolean; onFinalizar(): void; onPendente(): void }) {
  const feito = d.status === 'FINALIZADO'
  const cancelado = d.status === 'CANCELADO'
  const encerrado = feito || cancelado

  return (
    <div className={cx('px-3 py-3', feito && 'bg-emerald-50/40', cancelado && 'bg-slate-50')}>
      <div className="flex items-start gap-2.5">
        {encerrado
          ? <CheckCircle2 size={17} className={cx('mt-0.5 shrink-0', feito ? 'text-emerald-600' : 'text-slate-400')} />
          : <CircleDashed size={17} className="mt-0.5 shrink-0 text-slate-300" />}
        <div className="min-w-0 flex-1">
          <div className={cx('text-[14px] font-semibold leading-snug', encerrado ? 'text-slate-400 line-through' : 'text-slate-800')}>{d.equipamento_nome ?? '—'}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate-500">
            <BadgeTipo tipo={d.tipo} />
            <span className={d.patrimonio ? 'font-mono font-semibold text-slate-700' : ''}>{fmtPatrimonio(d)}</span>
            <span className="om">OS {d.om ?? '—'}</span>
            {d.status_separacao !== 'SEPARADO' && !encerrado && <span className="font-semibold text-amber-700">material não separado</span>}
          </div>
          {d.observacao && <p className="mt-1.5 rounded-md bg-amber-50 px-2 py-1 text-[12px] text-amber-900">⚠ {d.observacao}</p>}
        </div>
      </div>

      {executar && !encerrado && (
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <button onClick={onFinalizar}
            className="toque flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-[13.5px] font-bold text-white shadow-sm transition hover:bg-emerald-700">
            <Check size={16} />Concluí
          </button>
          <button onClick={onPendente}
            className="toque flex items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-[13.5px] font-bold text-amber-800 ring-1 ring-amber-300 transition hover:bg-amber-50">
            <Clock size={16} />Não deu
          </button>
        </div>
      )}
      {feito && <div className="mt-1.5 pl-7 text-[11.5px] font-semibold text-emerald-700">Concluído</div>}
      {cancelado && <div className="mt-1.5 pl-7 text-[11.5px] font-semibold text-slate-500">Cancelado pelo PCM</div>}
    </div>
  )
}
