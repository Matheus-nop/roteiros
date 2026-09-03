// Geração individual de roteiro por técnico, para uma data.
import { Route, Printer, AlertTriangle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { SeletorData } from '../components/Filtros'
import { usePrint } from '../components/Print'
import { FolhaRoteiro } from '../components/Etiqueta'
import { CabecalhoTecnico, veiculosDoGrupo } from '../components/GrupoTecnico'
import { TabelaDemandas } from '../components/TabelaDemandas'
import { Botao, Confirmar, Pagina, Vazio } from '../components/ui'
import { STATUS_PLANEJAMENTO, STATUS_A_ROTEIRIZAR } from '../lib/status'
import { hojeISO, ordenarParadas, fmtData } from '../lib/format'
import type { Demanda } from '../lib/types'

export function PreRoteiro() {
  const { demandas, tecnicos, acoes } = useData()
  const { pode } = useAuth()
  const { toast, erro } = useToast()
  const { imprimir } = usePrint()
  const [data, setData] = useState(hojeISO())
  const [confirmar, setConfirmar] = useState<{ tec: string; itens: Demanda[] } | null>(null)

  const doDia = useMemo(() => demandas.filter(d => STATUS_PLANEJAMENTO.includes(d.status) && d.data_planejada === data), [demandas, data])
  const semData = useMemo(() => demandas.filter(d => STATUS_A_ROTEIRIZAR.includes(d.status) && d.tecnico_id && !d.data_planejada).length, [demandas])
  const cards = tecnicos.filter(t => t.ativo || doDia.some(d => d.tecnico_id === t.id)).map(t => ({ t, itens: doDia.filter(d => d.tecnico_id === t.id).sort(ordenarParadas) })).filter(c => c.itens.length)

  const gerar = async () => {
    if (!confirmar) return
    const c = confirmar; setConfirmar(null)
    try { await acoes.gerarRoteiro(c.itens); toast(`Roteiro gerado para ${c.tec}.`) } catch (e) { erro(e) }
  }

  return (
    <Pagina titulo="Pré-roteiro" subtitulo="Geração individual de roteiro por técnico" acoes={<SeletorData valor={data} onChange={setData} />}>
      {semData > 0 && <p className="mb-3 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200"><AlertTriangle size={14} />{semData} item(ns) com técnico mas sem data planejada não aparecem aqui. Defina a data no Planejamento.</p>}
      {cards.length === 0 && <Vazio titulo={`Nenhum item planejado para ${fmtData(data)}`} texto="Atribua técnico e data no Planejamento." />}
      <div className="space-y-4">
        {cards.map(({ t, itens }) => {
          const aRoteirizar = itens.filter(d => STATUS_A_ROTEIRIZAR.includes(d.status))
          const veics = veiculosDoGrupo(itens)
          return (
            <section key={t.id} className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
              <CabecalhoTecnico tecnico={t} total={itens.length} veiculos={veics} direita={<>
                {veics.length === 0 && <span className="text-xs text-amber-700">sem veículo definido</span>}
                <Botao tamanho="sm" onClick={() => imprimir(<FolhaRoteiro tecnico={t} data={data} itens={itens} />)}><Printer size={13} />Imprimir</Botao>
                {pode('planejamento.gerar_roteiro') && <Botao tamanho="sm" variante="primario" disabled={!aRoteirizar.length} onClick={() => setConfirmar({ tec: t.nome, itens })}><Route size={13} />Gerar roteiro{aRoteirizar.length ? ` (${aRoteirizar.length})` : ' · já gerado'}</Botao>}
              </>} />
              <TabelaDemandas itens={itens} prefixo="ROT" colunas={['ordem', 'numero', 'om', 'cliente', 'tipo', 'equipamento', 'patrimonio', 'veiculo', 'status']} />
            </section>
          )
        })}
      </div>
      <Confirmar aberto={!!confirmar} titulo="Gerar roteiro" onFechar={() => setConfirmar(null)} onConfirmar={gerar}
        texto={<>Gerar o roteiro de <b>{confirmar?.tec}</b> em {fmtData(data)} com {confirmar?.itens.length} parada(s)? Os itens passam a ROTEIRIZADO e aparecem na expedição.</>} />
    </Pagina>
  )
}
