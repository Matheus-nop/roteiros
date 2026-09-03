// Expedição: separação dos itens roteirizados (tipos que separam). Mesma fonte da pré-carga.
import { Printer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { BarraFiltros, SeletorData } from '../components/Filtros'
import { usePrint } from '../components/Print'
import { FolhaEtiquetas } from '../components/Etiqueta'
import { BarraSelecao, TabelaDemandas } from '../components/TabelaDemandas'
import { Botao, Pagina, Select, Checkbox, Contador } from '../components/ui'
import { STATUS_EM_ROTA, separaNaExpedicao } from '../lib/status'
import { hojeISO, normalizar, textoBusca, ordenarParadas } from '../lib/format'
import type { Demanda } from '../lib/types'

export function Expedicao() {
  const { demandas, expedidores, acoes, tecnicoPorId } = useData()
  const { pode, usuario } = useAuth()
  const { toast, erro } = useToast()
  const { imprimir } = usePrint()
  const [data, setData] = useState(hojeISO())
  const [todasDatas, setTodasDatas] = useState(false)
  const [busca, setBusca] = useState('')
  const [tecnico, setTecnico] = useState('')
  const [apenasPendentes, setApenasPendentes] = useState(false)
  const [expedidor, setExpedidor] = useState<string>(() => localStorage.getItem('expedidor') ?? '')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const separar = pode('expedicao.separar')

  const base = useMemo(() => demandas.filter(d => STATUS_EM_ROTA.includes(d.status) && separaNaExpedicao(d.tipo) && (todasDatas || d.data_planejada === data)), [demandas, data, todasDatas])
  const itens = useMemo(() => {
    const b = normalizar(busca)
    return base
      .filter(d => !tecnico || (tecnico === '__sem' ? !d.tecnico_id : d.tecnico_id === tecnico))
      .filter(d => !apenasPendentes || d.status_separacao !== 'SEPARADO')
      .filter(d => !b || textoBusca(d).includes(b))
      .sort((a, b) => (a.data_planejada ?? '').localeCompare(b.data_planejada ?? '') || (tecnicoPorId(a.tecnico_id)?.nome ?? '').localeCompare(tecnicoPorId(b.tecnico_id)?.nome ?? '') || ordenarParadas(a, b))
  }, [base, busca, tecnico, apenasPendentes, tecnicoPorId])

  const separados = base.filter(d => d.status_separacao === 'SEPARADO').length
  const escolherExpedidor = (v: string) => { setExpedidor(v); localStorage.setItem('expedidor', v) }
  const quem = () => expedidor || usuario?.perfil.nome || null

  const marcar = async (d: Demanda, v: boolean) => {
    if (v && !quem()) { toast('Selecione quem está separando.', 'erro'); return }
    try { await acoes.marcarSeparado(d.id, v, v ? quem() : null) } catch (e) { erro(e) }
  }
  const marcarSel = async (v: boolean) => {
    if (v && !quem()) { toast('Selecione quem está separando.', 'erro'); return }
    try { await Promise.all(Array.from(sel).map(id => acoes.marcarSeparado(id, v, v ? quem() : null))); toast(v ? 'Marcados como separados.' : 'Separação desfeita.'); setSel(new Set()) } catch (e) { erro(e) }
  }

  return (
    <Pagina titulo="Expedição" subtitulo="Separação dos itens roteirizados (ENTREGA, TROCA, RETORNO, LOCAÇÃO)" acoes={<>
      <label className="flex items-center gap-1.5 text-sm text-slate-600"><Checkbox checked={todasDatas} onChange={e => setTodasDatas(e.target.checked)} />Todas as datas</label>
      <SeletorData valor={data} onChange={setData} />
    </>}>
      <div className="mb-3 grid grid-cols-3 gap-3 md:w-2/3 xl:w-1/2">
        <Contador rotulo="A separar" valor={base.length - separados} tom="text-amber-700" />
        <Contador rotulo="Separados" valor={separados} tom="text-emerald-700" />
        <Contador rotulo="Total do dia" valor={base.length} />
      </div>
      <BarraFiltros busca={busca} setBusca={setBusca} tecnico={tecnico} setTecnico={setTecnico}>
        <label className="flex items-center gap-1.5 text-sm text-slate-600"><Checkbox checked={apenasPendentes} onChange={e => setApenasPendentes(e.target.checked)} />Só não separados</label>
        {separar && (
          <Select value={expedidor} onChange={e => escolherExpedidor(e.target.value)} className="w-44" title="Quem está separando">
            <option value="">Quem separa…</option>
            {expedidores.filter(x => x.ativo).map(x => <option key={x.id} value={x.nome}>{x.nome}</option>)}
          </Select>
        )}
        <Botao onClick={() => imprimir(<FolhaEtiquetas itens={itens} prefixo="EXP" tecnicoPorId={id => tecnicoPorId(id)} />)} disabled={!itens.length}><Printer size={14} />Etiquetas ({itens.length})</Botao>
      </BarraFiltros>

      <TabelaDemandas itens={itens} colunas={['sel', 'numero', 'tecnico', 'veiculo', 'ordem', 'om', 'cliente', 'tipo', 'equipamento', 'patrimonio', 'separacao', 'status', 'acoes']}
        selecionados={sel} onSelecionar={setSel} vazio="Nenhum item para separar nesta data."
        acoes={d => <>
          {separar && (d.status_separacao === 'SEPARADO'
            ? <Botao tamanho="sm" onClick={() => marcar(d, false)}>↩ Estornar</Botao>
            : <Botao tamanho="sm" variante="sucesso" onClick={() => marcar(d, true)}>✓ Separado</Botao>)}
          <Botao tamanho="sm" variante="fantasma" title="Etiqueta" onClick={() => imprimir(<FolhaEtiquetas itens={[d]} prefixo="EXP" tecnicoPorId={id => tecnicoPorId(id)} />)}><Printer size={14} /></Botao>
        </>} />

      <BarraSelecao n={sel.size} onLimpar={() => setSel(new Set())}>
        {separar && <Botao tamanho="sm" variante="sucesso" onClick={() => marcarSel(true)}>✓ Marcar separados</Botao>}
        {separar && <Botao tamanho="sm" onClick={() => marcarSel(false)}>↩ Desfazer separação</Botao>}
        <Botao tamanho="sm" onClick={() => imprimir(<FolhaEtiquetas itens={itens.filter(d => sel.has(d.id))} prefixo="EXP" tecnicoPorId={id => tecnicoPorId(id)} />)}><Printer size={13} />Etiquetas</Botao>
      </BarraSelecao>
    </Pagina>
  )
}
