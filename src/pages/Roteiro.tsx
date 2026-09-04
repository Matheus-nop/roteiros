// Roteiro do dia por técnico, com paradas ordenadas (cards).
import { Play, Printer, Trash2, Tag, Search, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { SeletorData } from '../components/Filtros'
import { usePrint } from '../components/Print'
import { FolhaEtiquetas } from '../components/Etiqueta'
import { EspelhoRoteiro } from '../components/EspelhoRoteiro'
import { CardDemanda, Chip, GrupoCard, LocalData } from '../components/Cards'
import { Botao, Confirmar, Input, Pagina, Vazio, cx } from '../components/ui'
import { STATUS_EM_ROTA } from '../lib/status'
import { agrupar, chaveParada, fmtData, hojeISO, ordenarParadas, normalizar, textoBusca } from '../lib/format'
import { veiculosDoGrupo } from '../components/GrupoTecnico'
import type { Demanda } from '../lib/types'

export function Roteiro() {
  const { demandas, tecnicos, acoes, tecnicoPorId } = useData()
  const { pode, usuario } = useAuth()
  const { toast, erro } = useToast()
  const { imprimir } = usePrint()
  const [data, setData] = useState(hojeISO())
  const [todas, setTodas] = useState(false)
  const [busca, setBusca] = useState('')
  const [remover, setRemover] = useState<{ d: Demanda; irmaos: Demanda[] } | null>(null)
  const [desfazer, setDesfazer] = useState<{ tecNome: string; data: string; itens: Demanda[] } | null>(null)
  const editar = pode('roteiro.editar')
  const meuTec = usuario?.perfil.papel === 'TECNICO' ? usuario.perfil.tecnico_id : null

  const emRota = useMemo(() => { const b = normalizar(busca); return demandas.filter(d => STATUS_EM_ROTA.includes(d.status) && (todas || d.data_planejada === data) && (!meuTec || d.tecnico_id === meuTec) && (!b || textoBusca(d).includes(b) || normalizar(tecnicoPorId(d.tecnico_id)?.nome).includes(b))) }, [demandas, data, todas, meuTec, busca, tecnicoPorId])
  const grupos = useMemo(() => {
    const out: { t: ReturnType<typeof tecnicoPorId>; tecId: string; data: string; itens: Demanda[] }[] = []
    for (const [k, its] of agrupar(emRota, d => `${d.tecnico_id ?? ''}|${d.data_planejada ?? ''}`)) { const [tecId, dt] = k.split('|'); out.push({ t: tecnicoPorId(tecId), tecId, data: dt, itens: [...its].sort(ordenarParadas) }) }
    return out.sort((a, b) => a.data.localeCompare(b.data) || (a.t?.nome ?? 'zz').localeCompare(b.t?.nome ?? 'zz'))
  }, [emRota, tecnicoPorId, tecnicos])
  const run = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast(msg) } catch (e) { erro(e) } }

  return (
    <Pagina titulo="Roteiro" subtitulo="Roteiro do dia por técnico, parada por parada · imprima o espelho para levar na rota" acoes={<>
      <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={todas} onChange={e => setTodas(e.target.checked)} />Todas as datas</label>
      <SeletorData valor={data} onChange={setData} />
    </>}>
      <div className="mb-3 relative"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar técnico, cliente, local, equipamento, OS…" className="pl-8" /></div>
      {grupos.length === 0 && <Vazio titulo={`Nenhum roteiro para ${todas ? 'as datas ativas' : fmtData(data)}`} texto="Libere paradas no pré-roteiro ou gere roteiros no planejamento." />}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {grupos.map(g => {
          const paradas = Array.from(agrupar(g.itens, chaveParada).values())
          const emDesloc = g.itens.filter(d => d.status === 'EM_DESLOCAMENTO').length
          const sep = g.itens.filter(d => d.status_separacao === 'SEPARADO').length
          return (
            <GrupoCard key={`${g.tecId}|${g.data}`} cor={g.t?.cor} titulo={<span>👷 {g.t?.nome ?? 'Sem técnico'}</span>} subtitulo={<span>🚗 {veiculosDoGrupo(g.itens).join(' / ') || <span className="text-amber-700">sem veículo</span>} · 📅 {fmtData(g.data)}</span>}
              chips={<><Chip tone="bg-slate-100 text-slate-700">{paradas.length} paradas</Chip><Chip tone="bg-emerald-50 text-emerald-800">{sep}/{g.itens.length} sep.</Chip>{emDesloc > 0 && <Chip tone="bg-cyan-50 text-cyan-800">{emDesloc} em deslocamento</Chip>}</>}
              direita={<>
                <Botao tamanho="sm" onClick={() => imprimir(<EspelhoRoteiro tecnico={g.t} data={g.data} itens={g.itens} />)}><Printer size={13} />Espelho</Botao>
                <Botao tamanho="sm" onClick={() => imprimir(<FolhaEtiquetas itens={g.itens} tipo="ROTEIRO" modo={(localStorage.getItem('et-modo') as 'normal') || 'normal'} tecnicoPorId={id => tecnicoPorId(id)} />)}><Tag size={13} />Etiquetas</Botao>
                {(editar || pode('roteiro.executar')) && emDesloc < g.itens.length && <Botao tamanho="sm" variante="primario" onClick={() => run(() => acoes.iniciarRota(g.itens), 'Rota iniciada.')}><Play size={13} />Iniciar rota</Botao>}
                {editar && <Botao tamanho="sm" variante="perigo" title="Desfaz o roteiro inteiro: os itens voltam ao planejamento" onClick={() => setDesfazer({ tecNome: g.t?.nome ?? 'sem técnico', data: g.data, itens: g.itens })}><XCircle size={13} />Excluir roteiro</Botao>}
              </>}>
              {paradas.map((its, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2 bg-slate-50/80 px-4 py-1.5">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1a56db] text-[11px] font-bold text-white">{its[0].ordem_parada ? its[0].ordem_parada / 10 : i + 1}</span>
                    <span className="text-[13px] font-bold text-slate-800">{its[0].cliente_nome ?? '—'}</span><LocalData local={its[0].local} />
                  </div>
                  <div className="pl-6">{its.map(d => <CardDemanda key={d.id} d={d} compacto mostrarSeparacao acoes={editar ? <button className={cx('rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600')} title="Remover do roteiro (volta ao planejamento)" onClick={() => setRemover({ d, irmaos: g.itens })}><Trash2 size={13} /></button> : undefined} />)}</div>
                </div>
              ))}
            </GrupoCard>
          )
        })}
      </div>
      <Confirmar aberto={!!desfazer} titulo="Excluir o roteiro inteiro" perigo confirmarTexto="Excluir roteiro" onFechar={() => setDesfazer(null)}
        texto={<>Devolver ao planejamento as <b>{desfazer?.itens.length}</b> demanda(s) do roteiro de <b>{desfazer?.tecNome}</b> em {fmtData(desfazer?.data ?? '')}? Técnico e data continuam — some a ordem das paradas e a separação, que eram deste roteiro.</>}
        onConfirmar={() => { const x = desfazer!; setDesfazer(null); run(() => acoes.desfazerRoteiro(x.itens), `${x.itens.length} demanda(s) de volta ao planejamento.`) }} />
      <Confirmar aberto={!!remover} titulo="Remover do roteiro" onFechar={() => setRemover(null)}
        texto={<>Remover <b>{remover?.d.equipamento_nome}</b> (OS {remover?.d.om}) do roteiro? Volta ao planejamento e as demais paradas são renumeradas sem reembaralhar.</>}
        onConfirmar={() => { const r = remover!; setRemover(null); run(() => acoes.removerDoRoteiro(r.d, r.irmaos), 'Removida do roteiro.') }} />
    </Pagina>
  )
}
