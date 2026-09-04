// Imp. técnico: o que o técnico executa, agrupado por parada.
//
// Duas regras que mudam como a tela se comporta:
//
// 1. O item concluído **fica**, em verde e riscado. Ele sai da tabela de ativas assim que
//    é finalizado (o `useData` só carrega as vivas), então é preciso buscá-lo de volta pelo
//    `useEncerradas` — senão a lista encolheria a cada clique e ninguém conseguiria conferir
//    o roteiro no fim do dia.
//
// 2. Quando não sobra nada em rota — tudo concluído, cancelado ou reagendado — o roteiro
//    do dia é arquivado sozinho e sai daqui, indo para o Arquivo de roteiros.
import { Check, Clock, Lock, Printer, Trash2, Archive } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { useEncerradas } from '../hooks/useEncerradas'
import { ModalPendente } from '../components/ModalPendente'
import { EspelhoRoteiro } from '../components/EspelhoRoteiro'
import { usePrint } from '../components/Print'
import { Badge, BadgeStatus, BadgeTipo, Botao, Campo, Confirmar, Input, Modal, Pagina, Select, Vazio, cx } from '../components/ui'
import { STATUS_EM_ROTA } from '../lib/status'
import { agrupar, chaveParada, fmtData, fmtPatrimonio, hojeISO, ordenarParadas, rotuloData, addDias } from '../lib/format'
import type { Demanda } from '../lib/types'

export function ImpTecnico() {
  const { demandas, tecnicos, acoes, tecnicoPorId } = useData()
  const { pode, usuario } = useAuth()
  const { toast, erro } = useToast()
  const { imprimir } = usePrint()
  const meuTec = usuario?.perfil.papel === 'TECNICO' ? usuario.perfil.tecnico_id : null
  const [tecnico, setTecnico] = useState<string>(() => meuTec ?? localStorage.getItem('imp-tecnico') ?? '')
  const [pendente, setPendente] = useState<Demanda[] | null>(null)
  const [fechar, setFechar] = useState<{ data: string; itens: Demanda[] } | null>(null)
  const [desfazer, setDesfazer] = useState<{ data: string; itens: Demanda[] } | null>(null)
  const executar = pode('roteiro.executar')
  const editar = pode('roteiro.editar')

  const emRota = useMemo(() => demandas.filter(d => STATUS_EM_ROTA.includes(d.status) && d.tecnico_id === tecnico), [demandas, tecnico])
  // As datas que ainda têm roteiro aberto. Uma data em que tudo terminou não aparece mais
  // aqui — é exatamente o que faz o roteiro fechado sair da tela.
  const datas = useMemo(() => Array.from(new Set(emRota.map(d => d.data_planejada ?? ''))).filter(Boolean).sort(), [emRota])
  const encerradas = useEncerradas(datas, tecnico)

  const porData = useMemo(() => {
    const todas = [...emRota, ...encerradas.filter(e => e.tecnico_id === tecnico)]
    return Array.from(agrupar(todas, d => d.data_planejada ?? '')).sort(([a], [b]) => a.localeCompare(b))
  }, [emRota, encerradas, tecnico])

  const hoje = hojeISO()
  const nomeTec = tecnicoPorId(tecnico)?.nome ?? ''
  const escolher = (id: string) => { setTecnico(id); localStorage.setItem('imp-tecnico', id) }

  /**
   * Executa a ação e, logo depois, tenta arquivar o roteiro daquele dia. `itensDoDia` é a
   * composição lida ANTES da ação: a demanda reagendada muda de data e sairia de qualquer
   * filtro por dia — é pelos ids que o arquivo recupera o desfecho de cada uma.
   */
  const run = async (fn: () => Promise<unknown>, msg: string, itensDoDia?: Demanda[], data?: string) => {
    try {
      await fn()
      if (msg) toast(msg)
      if (itensDoDia?.length && data) {
        const arquivado = await acoes.arquivarSeCompleto({
          tecnicoId: tecnico, tecnicoNome: nomeTec, data,
          ids: itensDoDia.map(d => d.id),
          veiculo: itensDoDia.find(d => d.veiculo)?.veiculo ?? null,
          usuarioId: usuario?.id ?? null,
        }).catch(() => null)
        if (arquivado) toast(`Roteiro de ${fmtData(data)} concluído e arquivado.`, 'info')
      }
    } catch (e) { erro(e) }
  }

  return (
    <Pagina titulo="Imp. técnico" subtitulo="Execução em rota · o item concluído fica na tela, em verde, para conferência · quando não sobra nada em rota, o roteiro vai para o arquivo" acoes={
      !meuTec && <Select value={tecnico} onChange={e => escolher(e.target.value)} className="w-52"><option value="">Selecione o técnico…</option>{tecnicos.filter(t => t.ativo).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</Select>
    }>
      {!tecnico && <Vazio titulo="Selecione o técnico" texto="O roteiro aparece agrupado por parada, mostrando só as datas com itens em rota." />}
      {tecnico && porData.length === 0 && <Vazio titulo={`${nomeTec} não tem itens em rota`} texto="Quando o PCM gerar o roteiro, os itens aparecem aqui. O que já foi executado está no Arquivo de roteiros." />}

      <div className="space-y-5">
        {porData.map(([data, itens]) => {
          const ordenados = [...itens].sort(ordenarParadas)
          const paradas = Array.from(agrupar(ordenados, chaveParada).values())
          const veic = itens.find(d => d.veiculo)?.veiculo
          const abertos = itens.filter(d => STATUS_EM_ROTA.includes(d.status))
          const feitos = itens.filter(d => d.status === 'FINALIZADO').length
          return (
            <section key={data} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className={cx('flex flex-wrap items-center justify-between gap-2 px-4 py-3', data < hoje ? 'bg-red-50' : 'bg-slate-50')}>
                <div className="text-[15px] font-bold text-slate-900">
                  📅 {rotuloData(data || null)}
                  <span className="ml-2 text-[12px] font-normal text-slate-500">
                    🚗 {veic ?? 'sem veículo'} · {paradas.length} parada(s) · {feitos}/{itens.length} concluído(s)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Botao tamanho="sm" variante="primario" onClick={() => imprimir(<EspelhoRoteiro tecnico={tecnicoPorId(tecnico)} data={data} itens={itens} />)}><Printer size={13} />Imprimir espelho</Botao>
                  {executar && <Botao tamanho="sm" onClick={() => setFechar({ data, itens })}><Lock size={13} />Fechar roteiro do dia</Botao>}
                  {editar && abertos.length > 0 && <Botao tamanho="sm" variante="perigo" title="Desfaz o roteiro: os itens em rota voltam ao planejamento" onClick={() => setDesfazer({ data, itens })}><Trash2 size={13} />Excluir roteiro</Botao>}
                </div>
              </div>

              {/* Barra de progresso: a conferência do dia em uma linha. */}
              <div className="h-1 bg-slate-100"><div className="h-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${itens.length ? (feitos / itens.length) * 100 : 0}%` }} /></div>

              <ol className="divide-y divide-slate-100">
                {paradas.map((its, i) => {
                  const paradaFeita = its.every(d => !STATUS_EM_ROTA.includes(d.status))
                  const abertosParada = its.filter(d => STATUS_EM_ROTA.includes(d.status))
                  return (
                    <li key={i} className={cx('px-4 py-3', paradaFeita && 'bg-emerald-50/30')}>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={cx('flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white', paradaFeita ? 'bg-emerald-500' : 'bg-acao-500')}>
                            {paradaFeita ? <Check size={14} /> : its[0].ordem_parada ? its[0].ordem_parada / 10 : i + 1}
                          </span>
                          <div>
                            <div className="text-sm font-semibold text-slate-800">{its[0].cliente_nome ?? '—'}</div>
                            <div className="text-xs text-slate-500">📍 {its[0].local ?? '—'}</div>
                          </div>
                        </div>
                        {executar && abertosParada.length > 1 && <Botao tamanho="sm" variante="sucesso" onClick={() => run(() => acoes.finalizar(abertosParada.map(d => d.id)), `Parada finalizada (${abertosParada.length} itens).`, itens, data)}><Check size={13} />Finalizar parada</Botao>}
                      </div>
                      <ul className="space-y-1.5 pl-9">
                        {its.map(d => {
                          const feito = d.status === 'FINALIZADO'
                          const cancelado = d.status === 'CANCELADO'
                          const encerrado = feito || cancelado
                          return (
                            <li key={d.id} className={cx('flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-3 py-2 text-sm ring-1',
                              feito ? 'bg-emerald-50 ring-emerald-200' : cancelado ? 'bg-slate-100 ring-slate-200' : 'bg-slate-50 ring-slate-100')}>
                              {feito && <Check size={14} className="shrink-0 text-emerald-600" />}
                              <BadgeTipo tipo={d.tipo} />
                              <span className={cx('font-medium', encerrado ? 'text-slate-500 line-through' : 'text-slate-800')}>{d.equipamento_nome}</span>
                              <span className={cx('text-xs', d.patrimonio ? 'font-mono font-semibold' : 'text-slate-600', encerrado && 'text-slate-400')}>{fmtPatrimonio(d)}</span>
                              <span className={cx('om text-xs', encerrado ? 'text-slate-400' : 'text-slate-500')}>OM {d.om ?? '—'}</span>
                              <BadgeStatus status={d.status} />
                              {d.observacao && <span className="text-xs text-slate-500">· {d.observacao}</span>}
                              {executar && !encerrado && <div className="ml-auto flex gap-1">
                                <Botao tamanho="sm" variante="sucesso" onClick={() => run(() => acoes.finalizar([d.id]), 'Finalizado.', itens, data)}><Check size={13} />Finalizar</Botao>
                                <Botao tamanho="sm" onClick={() => setPendente([d])}><Clock size={13} />Pendente</Botao>
                              </div>}
                            </li>
                          )
                        })}
                      </ul>
                    </li>
                  )
                })}
              </ol>
            </section>
          )
        })}
      </div>

      {pendente && (
        <ModalPendente itens={pendente} onFechar={() => {
          setPendente(null)
          // Reagendar tira o item do dia; pode ter sido o último em rota.
          const dia = porData.find(([, its]) => its.some(x => x.id === pendente[0].id))
          if (dia) run(async () => {}, '', dia[1], dia[0])
        }} />
      )}
      {fechar && <ModalFecharRoteiro data={fechar.data} itens={fechar.itens} tecnicoId={tecnico} tecnicoNome={nomeTec} onFechar={() => setFechar(null)} />}
      <Confirmar aberto={!!desfazer} titulo="Excluir o roteiro do dia" perigo confirmarTexto="Excluir roteiro" onFechar={() => setDesfazer(null)}
        texto={<>Devolver ao planejamento <b>{desfazer?.itens.filter(d => STATUS_EM_ROTA.includes(d.status)).length}</b> item(ns) em rota de {fmtData(desfazer?.data ?? '')}? O técnico e a data continuam; some a ordem das paradas e a separação. O que já foi concluído não volta.</>}
        onConfirmar={() => { const x = desfazer!; setDesfazer(null); run(() => acoes.desfazerRoteiro(x.itens), 'Roteiro desfeito: itens de volta ao planejamento.') }} />
    </Pagina>
  )
}

function ModalFecharRoteiro({ data, itens, tecnicoId, tecnicoNome, onFechar }: { data: string; itens: Demanda[]; tecnicoId: string; tecnicoNome: string; onFechar(): void }) {
  const { acoes } = useData()
  const { usuario } = useAuth()
  const { toast, erro } = useToast()
  const [opcao, setOpcao] = useState<'manter' | 'reagendar'>('reagendar')
  const [nova, setNova] = useState(addDias(hojeISO(), 1))
  const abertos = itens.filter(d => STATUS_EM_ROTA.includes(d.status))
  const salvar = async () => {
    try {
      await acoes.fecharRoteiro(tecnicoId, data, itens, { reagendarPara: opcao === 'reagendar' ? nova : null }, usuario?.id ?? null)
      // Fechar o roteiro é o momento natural de guardar o retrato — mesmo que algum item
      // tenha ficado em aberto por escolha ("manter em andamento").
      const arq = await acoes.arquivarSeCompleto({
        tecnicoId, tecnicoNome, data, ids: itens.map(d => d.id),
        veiculo: itens.find(d => d.veiculo)?.veiculo ?? null,
        usuarioId: usuario?.id ?? null, automatico: false,
      }).catch(() => null)
      toast(arq ? 'Roteiro fechado e arquivado.' : 'Roteiro do dia fechado.')
      onFechar()
    } catch (e) { erro(e) }
  }
  return (
    <Modal aberto onFechar={onFechar} titulo={`Fechar roteiro · ${fmtData(data)}`} rodape={<><Botao onClick={onFechar}>Cancelar</Botao><Botao variante="primario" onClick={salvar}>Fechar roteiro</Botao></>}>
      <p className="text-sm text-slate-700">Restam <b>{abertos.length}</b> item(ns) não executado(s) neste roteiro.</p>
      {abertos.length > 0 && (
        <div className="mt-3 space-y-2">
          <label className="flex items-start gap-2 text-sm"><input type="radio" checked={opcao === 'reagendar'} onChange={() => setOpcao('reagendar')} className="mt-1" /><span>Reagendar os não executados (voltam ao planejamento como pendência, com a data abaixo)</span></label>
          {opcao === 'reagendar' && <Campo rotulo="Nova data planejada" className="ml-6 w-48"><Input type="date" value={nova} onChange={e => setNova(e.target.value)} /></Campo>}
          <label className="flex items-start gap-2 text-sm"><input type="radio" checked={opcao === 'manter'} onChange={() => setOpcao('manter')} className="mt-1" /><span>Manter em andamento (continuam no roteiro desta data)</span></label>
        </div>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><Archive size={13} />O roteiro vai para o Arquivo com o desfecho de cada item, do jeito que foi montado.</p>
      <div className="mt-2 flex flex-wrap gap-1">{abertos.map(d => <Badge key={d.id}>{d.equipamento_nome} · {fmtPatrimonio(d)}</Badge>)}</div>
    </Modal>
  )
}
