import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../hooks/useData'
import { Cartao, Contador, Pagina, Badge } from '../components/ui'
import { STATUS_A_ROTEIRIZAR, STATUS_EM_ROTA, STATUS_FILA, separaNaExpedicao } from '../lib/status'
import { addDias, hojeISO, fmtData } from '../lib/format'
import { chaveIdentidade } from '../lib/actions'

export function Dashboard() {
  const { demandas, tecnicos, carregando } = useData()
  const nav = useNavigate()
  const hoje = hojeISO()

  const m = useMemo(() => {
    const fila = demandas.filter(d => STATUS_FILA.includes(d.status))
    const aRoteirizar = demandas.filter(d => STATUS_A_ROTEIRIZAR.includes(d.status))
    const emRota = demandas.filter(d => STATUS_EM_ROTA.includes(d.status))
    const hojeRota = emRota.filter(d => d.data_planejada === hoje)
    const amanhaRota = emRota.filter(d => d.data_planejada === addDias(hoje, 1))
    const pendencias = demandas.filter(d => d.herdado_de_pendencia && STATUS_A_ROTEIRIZAR.includes(d.status))
    const atrasadas = demandas.filter(d => d.data_planejada && d.data_planejada < hoje && (STATUS_EM_ROTA.includes(d.status) || STATUS_A_ROTEIRIZAR.includes(d.status)))
    const semVeiculo = emRota.filter(d => !d.veiculo)
    const semData = aRoteirizar.filter(d => d.tecnico_id && !d.data_planejada)
    const porTec = tecnicos.filter(t => t.ativo).map(t => {
      const itens = hojeRota.filter(d => d.tecnico_id === t.id)
      const sep = itens.filter(d => separaNaExpedicao(d.tipo))
      return { t, total: itens.length, separados: sep.filter(d => d.status_separacao === 'SEPARADO').length, aSeparar: sep.length, emDesloc: itens.filter(d => d.status === 'EM_DESLOCAMENTO').length, veiculos: Array.from(new Set(itens.map(d => d.veiculo).filter(Boolean))) as string[] }
    }).filter(x => x.total > 0)
    const chaves = new Map<string, number>()
    for (const d of fila) chaves.set(chaveIdentidade(d), (chaves.get(chaveIdentidade(d)) ?? 0) + 1)
    const duplicatasFila = Array.from(chaves.values()).filter(n => n > 1).length
    return { fila, aRoteirizar, emRota, hojeRota, amanhaRota, pendencias, atrasadas, semVeiculo, semData, porTec, duplicatasFila }
  }, [demandas, tecnicos, hoje])

  return (
    <Pagina titulo="Dashboard" subtitulo={`Visão geral · ${fmtData(hoje)}${carregando ? ' · carregando…' : ''}`}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Contador rotulo="Na fila" valor={m.fila.length} onClick={() => nav('/fila')} />
        <Contador rotulo="A roteirizar" valor={m.aRoteirizar.length} tom="text-violet-700" onClick={() => nav('/planejamento')} />
        <Contador rotulo="Roteirizado hoje" valor={m.hojeRota.length} tom="text-blue-700" onClick={() => nav('/roteiro')} />
        <Contador rotulo="Roteirizado amanhã" valor={m.amanhaRota.length} tom="text-slate-700" onClick={() => nav('/pre-carga')} />
        <Contador rotulo="Pendências" valor={m.pendencias.length} tom="text-orange-700" onClick={() => nav('/pendencias')} />
        <Contador rotulo="Com data vencida" valor={m.atrasadas.length} tom={m.atrasadas.length ? 'text-red-700' : 'text-slate-700'} onClick={() => nav('/planejamento')} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Cartao titulo="Técnicos em rota hoje" className="lg:col-span-2">
          {m.porTec.length === 0 ? <p className="px-4 py-6 text-sm text-slate-500">Nenhum roteiro gerado para hoje.</p> : (
            <table className="tabela w-full">
              <thead><tr><th>Técnico</th><th>Veículo</th><th>Paradas</th><th>Separação</th><th>Em deslocamento</th></tr></thead>
              <tbody>
                {m.porTec.map(x => (
                  <tr key={x.t.id} className="cursor-pointer" onClick={() => nav('/roteiro')}>
                    <td><span className="inline-flex items-center gap-1.5 font-medium"><span className="h-2 w-2 rounded-full" style={{ background: x.t.cor ?? '#94a3b8' }} />{x.t.nome}</span></td>
                    <td className="text-xs">{x.veiculos.length === 0 ? <Badge tone="bg-red-50 text-red-700 ring-red-200">sem veículo</Badge> : x.veiculos.length > 1 ? <Badge tone="bg-amber-50 text-amber-800 ring-amber-200">{x.veiculos.length} veículos</Badge> : x.veiculos[0]}</td>
                    <td className="tabular-nums">{x.total}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded bg-slate-200"><div className="h-full bg-emerald-500" style={{ width: `${x.aSeparar ? (x.separados / x.aSeparar) * 100 : 100}%` }} /></div>
                        <span className="text-xs tabular-nums text-slate-600">{x.separados}/{x.aSeparar}</span>
                      </div>
                    </td>
                    <td className="tabular-nums">{x.emDesloc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Cartao>
        <Cartao titulo="Alertas">
          <ul className="divide-y divide-slate-100 text-sm">
            <Alerta n={m.semVeiculo.length} texto="roteirizada(s) sem veículo" onClick={() => nav('/planejamento')} />
            <Alerta n={m.semData.length} texto="com técnico mas sem data planejada" onClick={() => nav('/planejamento')} />
            <Alerta n={m.atrasadas.length} texto="com data planejada já vencida" onClick={() => nav('/planejamento')} />
            <Alerta n={m.duplicatasFila} texto="possível(is) duplicata(s) na fila" onClick={() => nav('/fila?auditar=1')} />
            <Alerta n={m.pendencias.length} texto="pendência(s) reagendada(s) aguardando roteirização" onClick={() => nav('/pendencias')} />
            {m.semVeiculo.length + m.semData.length + m.atrasadas.length + m.duplicatasFila + m.pendencias.length === 0 && <li className="px-4 py-3 text-slate-500">Nenhum alerta. Tudo em ordem.</li>}
          </ul>
        </Cartao>
      </div>
    </Pagina>
  )
}

function Alerta({ n, texto, onClick }: { n: number; texto: string; onClick(): void }) {
  if (!n) return null
  return <li className="flex cursor-pointer items-center gap-2 px-4 py-2.5 hover:bg-slate-50" onClick={onClick}><span className="rounded bg-amber-100 px-1.5 text-xs font-semibold text-amber-800">{n}</span><span className="text-slate-700">{texto}</span></li>
}
