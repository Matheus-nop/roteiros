// Roteiro do dia por técnico, com paradas ordenadas.
import { Play, Printer, Trash2, Tag } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { SeletorData } from '../components/Filtros'
import { usePrint } from '../components/Print'
import { FolhaEtiquetas, FolhaRoteiro } from '../components/Etiqueta'
import { CabecalhoTecnico, veiculosDoGrupo } from '../components/GrupoTecnico'
import { Badge, BadgeStatus, BadgeTipo, Botao, Checkbox, Confirmar, Pagina, Vazio, cx } from '../components/ui'
import { STATUS_EM_ROTA } from '../lib/status'
import { agrupar, chaveParada, fmtData, fmtPatrimonio, hojeISO, ordenarParadas, codigo } from '../lib/format'
import type { Demanda } from '../lib/types'

export function Roteiro() {
  const { demandas, tecnicos, acoes, tecnicoPorId } = useData()
  const { pode, usuario } = useAuth()
  const { toast, erro } = useToast()
  const { imprimir } = usePrint()
  const [data, setData] = useState(hojeISO())
  const [todasDatas, setTodasDatas] = useState(false)
  const [remover, setRemover] = useState<{ d: Demanda; irmaos: Demanda[] } | null>(null)
  const editar = pode('roteiro.editar')
  const meuTec = usuario?.perfil.papel === 'TECNICO' ? usuario.perfil.tecnico_id : null

  const emRota = useMemo(() => demandas.filter(d => STATUS_EM_ROTA.includes(d.status) && (todasDatas || d.data_planejada === data) && (!meuTec || d.tecnico_id === meuTec)), [demandas, data, todasDatas, meuTec])
  const grupos = useMemo(() => {
    const out: { t: ReturnType<typeof tecnicoPorId>; tecId: string; data: string; itens: Demanda[] }[] = []
    for (const [k, its] of agrupar(emRota, d => `${d.tecnico_id ?? ''}|${d.data_planejada ?? ''}`)) {
      const [tecId, dt] = k.split('|')
      out.push({ t: tecnicoPorId(tecId), tecId, data: dt, itens: [...its].sort(ordenarParadas) })
    }
    return out.sort((a, b) => a.data.localeCompare(b.data) || (a.t?.nome ?? 'zz').localeCompare(b.t?.nome ?? 'zz'))
  }, [emRota, tecnicoPorId, tecnicos])

  const run = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast(msg) } catch (e) { erro(e) } }

  return (
    <Pagina titulo="Roteiro" subtitulo="Roteiro do dia por técnico, com paradas ordenadas" acoes={<>
      <label className="flex items-center gap-1.5 text-sm text-slate-600"><Checkbox checked={todasDatas} onChange={e => setTodasDatas(e.target.checked)} />Todas as datas</label>
      <SeletorData valor={data} onChange={setData} />
    </>}>
      {grupos.length === 0 && <Vazio titulo={`Nenhum roteiro para ${todasDatas ? 'as datas ativas' : fmtData(data)}`} texto="Gere roteiros no Planejamento ou Pré-roteiro." />}
      <div className="space-y-4">
        {grupos.map(g => {
          const paradas = Array.from(agrupar(g.itens, chaveParada).values())
          const emDesloc = g.itens.filter(d => d.status === 'EM_DESLOCAMENTO').length
          const sep = g.itens.filter(d => d.status_separacao === 'SEPARADO').length
          return (
            <section key={`${g.tecId}|${g.data}`} className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
              <CabecalhoTecnico tecnico={g.t} total={g.itens.length} veiculos={veiculosDoGrupo(g.itens)} direita={<>
                {todasDatas && <Badge>{fmtData(g.data)}</Badge>}
                <Badge>{paradas.length} parada(s)</Badge>
                <Badge tone="bg-emerald-50 text-emerald-800 ring-emerald-200">{sep}/{g.itens.length} sep.</Badge>
                {emDesloc > 0 && <Badge tone="bg-cyan-50 text-cyan-800 ring-cyan-200">{emDesloc} em deslocamento</Badge>}
                <Botao tamanho="sm" onClick={() => imprimir(<FolhaRoteiro tecnico={g.t} data={g.data} itens={g.itens} />)}><Printer size={13} />Roteiro</Botao>
                <Botao tamanho="sm" onClick={() => imprimir(<FolhaEtiquetas itens={g.itens} prefixo="ROT" tecnicoPorId={id => tecnicoPorId(id)} />)}><Tag size={13} />Etiquetas</Botao>
                {(editar || pode('roteiro.executar')) && emDesloc < g.itens.length && <Botao tamanho="sm" variante="primario" onClick={() => run(() => acoes.iniciarRota(g.itens), 'Rota iniciada.')}><Play size={13} />Iniciar rota</Botao>}
              </>} />
              <ol className="divide-y divide-slate-100">
                {paradas.map((its, i) => (
                  <li key={i} className="flex gap-3 px-4 py-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">{its[0].ordem_parada ? its[0].ordem_parada / 10 : i + 1}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-800">{its[0].cliente_nome ?? '—'} <span className="font-normal text-slate-500">· 📍 {its[0].local ?? '—'}</span></div>
                      <ul className="mt-1 space-y-1">
                        {its.map(d => (
                          <li key={d.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                            <span className="font-mono text-[11px] text-slate-400">{codigo('ROT', d.numero)}</span>
                            <span className="w-4 text-center text-xs font-semibold text-slate-500">{d.ordem_parada ? d.ordem_parada / 10 : ''}</span>
                            <BadgeTipo tipo={d.tipo} />
                            <span className="text-slate-800">{d.equipamento_nome}</span>
                            <span className={cx('text-xs', d.patrimonio ? 'font-mono font-semibold' : 'text-slate-600')}>{fmtPatrimonio(d)}</span>
                            <span className="om text-xs text-slate-500">OM {d.om ?? '—'}</span>
                            <BadgeStatus status={d.status} />
                            {d.status_separacao === 'SEPARADO' ? <span className="text-[11px] text-emerald-700">✓ sep.</span> : <span className="text-[11px] text-amber-700">não sep.</span>}
                            {editar && <button className="ml-auto rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Remover do roteiro (volta ao planejamento)" onClick={() => setRemover({ d, irmaos: g.itens })}><Trash2 size={13} /></button>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )
        })}
      </div>
      <Confirmar aberto={!!remover} titulo="Remover do roteiro" onFechar={() => setRemover(null)}
        texto={<>Remover <b>{remover?.d.equipamento_nome}</b> (OM {remover?.d.om}) do roteiro? Volta ao planejamento e as demais paradas são renumeradas sem reembaralhar.</>}
        onConfirmar={() => { const r = remover!; setRemover(null); run(() => acoes.removerDoRoteiro(r.d, r.irmaos), 'Removida do roteiro.') }} />
    </Pagina>
  )
}
