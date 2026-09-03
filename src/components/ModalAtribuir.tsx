// Atribuição de técnico / veículo / data. Regra: não puxa o veículo padrão automaticamente.
// Sugere o veículo já usado pelo técnico no mesmo dia; senão, oferece o padrão como sugestão explícita.
import { useEffect, useMemo, useState } from 'react'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import type { Demanda } from '../lib/types'
import { Botao, Campo, Input, Modal, Select } from './ui'

export function ModalAtribuir({ itens, onFechar }: { itens: Demanda[]; onFechar(): void }) {
  const { tecnicos, veiculos, demandas, acoes } = useData()
  const { toast, erro } = useToast()
  const unico = itens.length === 1 ? itens[0] : null
  const [tecnico, setTecnico] = useState<string>(unico?.tecnico_id ?? '')
  const [veiculo, setVeiculo] = useState<string>(unico?.veiculo ?? '')
  const [data, setData] = useState<string>(unico?.data_planejada ?? '')
  const [mudarTec, setMudarTec] = useState(!!unico)
  const [mudarVei, setMudarVei] = useState(!!unico)
  const [mudarData, setMudarData] = useState(!!unico)

  const tec = tecnicos.find(t => t.id === tecnico)
  const sugestaoDia = useMemo(() => {
    if (!tecnico || !data) return null
    const outra = demandas.find(d => d.tecnico_id === tecnico && d.data_planejada === data && d.veiculo && !itens.some(i => i.id === d.id))
    return outra?.veiculo ?? null
  }, [tecnico, data, demandas, itens])

  useEffect(() => {
    // Ao trocar técnico, NÃO preenche veículo. Apenas mostra sugestões.
  }, [tecnico])

  const salvar = async () => {
    const campos: Parameters<typeof acoes.atribuir>[1] = {}
    if (mudarTec) campos.tecnico_id = tecnico || null
    if (mudarVei) campos.veiculo = veiculo || null
    if (mudarData) campos.data_planejada = data || null
    if (!Object.keys(campos).length) { onFechar(); return }
    try {
      await acoes.atribuir(itens.map(i => i.id), campos)
      toast(`${itens.length} demanda(s) atualizada(s).`); onFechar()
    } catch (e) { erro(e) }
  }

  return (
    <Modal aberto onFechar={onFechar} titulo={unico ? `Atribuir · #${unico.numero} ${unico.equipamento_nome ?? ''}` : `Atribuir em massa · ${itens.length} demandas`}
      rodape={<><Botao onClick={onFechar}>Cancelar</Botao><Botao variante="primario" onClick={salvar}>Aplicar</Botao></>}>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          {!unico && <input type="checkbox" className="mt-6" checked={mudarTec} onChange={e => setMudarTec(e.target.checked)} />}
          <Campo rotulo="Técnico" className="flex-1">
            <Select value={tecnico} onChange={e => setTecnico(e.target.value)} disabled={!mudarTec}>
              <option value="">— Sem técnico —</option>
              {tecnicos.filter(t => t.ativo || t.id === tecnico).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </Select>
          </Campo>
        </div>
        <div className="flex items-start gap-3">
          {!unico && <input type="checkbox" className="mt-6" checked={mudarData} onChange={e => setMudarData(e.target.checked)} />}
          <Campo rotulo="Data planejada (execução)" className="flex-1"><Input type="date" value={data} onChange={e => setData(e.target.value)} disabled={!mudarData} /></Campo>
        </div>
        <div className="flex items-start gap-3">
          {!unico && <input type="checkbox" className="mt-6" checked={mudarVei} onChange={e => setMudarVei(e.target.checked)} />}
          <div className="flex-1">
            <Campo rotulo="Veículo desta demanda">
              <Select value={veiculo} onChange={e => setVeiculo(e.target.value)} disabled={!mudarVei}>
                <option value="">— Sem veículo —</option>
                {veiculos.filter(v => v.ativo || v.nome === veiculo).map(v => <option key={v.id} value={v.nome}>{v.nome}</option>)}
                {veiculo && !veiculos.some(v => v.nome === veiculo) && <option value={veiculo}>{veiculo}</option>}
              </Select>
            </Campo>
            {mudarVei && (sugestaoDia || tec?.veiculo_padrao) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                Sugestão:
                {sugestaoDia && <button className="rounded bg-brand-50 px-2 py-0.5 font-medium text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100" onClick={() => setVeiculo(sugestaoDia)}>{sugestaoDia} · mesmo dia</button>}
                {tec?.veiculo_padrao && tec.veiculo_padrao !== sugestaoDia && <button className="rounded bg-slate-100 px-2 py-0.5 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200" onClick={() => setVeiculo(tec.veiculo_padrao!)}>{tec.veiculo_padrao} · padrão do técnico</button>}
              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-500">O veículo é gravado nesta demanda (não copiado entre telas). Trocar o técnico não altera o veículo automaticamente.</p>
      </div>
    </Modal>
  )
}
