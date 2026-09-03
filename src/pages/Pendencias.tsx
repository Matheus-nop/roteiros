// Pendências: itens reagendados (voltaram ao planejamento com data nova).
import { CalendarClock, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { BarraFiltros } from '../components/Filtros'
import { BarraSelecao, TabelaDemandas } from '../components/TabelaDemandas'
import { Botao, Campo, Confirmar, Input, Modal, Pagina } from '../components/ui'
import { STATUS_A_ROTEIRIZAR, STATUS_ARQUIVADOS } from '../lib/status'
import { normalizar, textoBusca, hojeISO } from '../lib/format'

export function Pendencias() {
  const { demandas, acoes } = useData()
  const { pode } = useAuth()
  const { toast, erro } = useToast()
  const [busca, setBusca] = useState('')
  const [tecnico, setTecnico] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [reagendar, setReagendar] = useState<string[] | null>(null)
  const [nova, setNova] = useState(hojeISO())
  const [cancelar, setCancelar] = useState<string[] | null>(null)
  const editar = pode('pendencias.reagendar')

  const itens = useMemo(() => {
    const b = normalizar(busca)
    return demandas
      .filter(d => d.herdado_de_pendencia && !STATUS_ARQUIVADOS.includes(d.status))
      .filter(d => !tecnico || (tecnico === '__sem' ? !d.tecnico_id : d.tecnico_id === tecnico))
      .filter(d => !b || textoBusca(d).includes(b))
      .sort((a, b) => (a.data_reagendada ?? '').localeCompare(b.data_reagendada ?? ''))
  }, [demandas, busca, tecnico])

  const aguardando = itens.filter(d => STATUS_A_ROTEIRIZAR.includes(d.status)).length
  const ids = Array.from(sel)
  const run = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast(msg); setSel(new Set()) } catch (e) { erro(e) } }

  return (
    <Pagina titulo="Pendências" subtitulo={`${itens.length} itens reagendados · ${aguardando} aguardando nova roteirização`}>
      <BarraFiltros busca={busca} setBusca={setBusca} tecnico={tecnico} setTecnico={setTecnico} />
      <TabelaDemandas itens={itens} colunas={['sel', 'om', 'cliente', 'tipo', 'equipamento', 'patrimonio', 'tecnico', 'abertura', 'reagendada', 'status', 'obs', 'acoes']}
        selecionados={sel} onSelecionar={setSel} vazio="Nenhuma pendência."
        acoes={d => <>
          {editar && <Botao tamanho="sm" variante="fantasma" title="Alterar data" onClick={() => { setNova(d.data_reagendada ?? hojeISO()); setReagendar([d.id]) }}><CalendarClock size={14} /></Botao>}
          {editar && <Botao tamanho="sm" variante="fantasma" title="Cancelar" onClick={() => setCancelar([d.id])}><XCircle size={14} className="text-red-600" /></Botao>}
        </>} />
      <BarraSelecao n={ids.length} onLimpar={() => setSel(new Set())}>
        {editar && <Botao tamanho="sm" variante="primario" onClick={() => setReagendar(ids)}><CalendarClock size={13} />Reagendar</Botao>}
        {editar && <Botao tamanho="sm" variante="perigo" onClick={() => setCancelar(ids)}>Cancelar</Botao>}
      </BarraSelecao>

      <Modal aberto={!!reagendar} onFechar={() => setReagendar(null)} titulo="Reagendar" rodape={<><Botao onClick={() => setReagendar(null)}>Cancelar</Botao><Botao variante="primario" onClick={() => { const r = reagendar!; setReagendar(null); run(() => acoes.reagendar(r, nova), 'Reagendado.') }}>Aplicar</Botao></>}>
        <Campo rotulo="Nova data planejada"><Input type="date" value={nova} onChange={e => setNova(e.target.value)} /></Campo>
        <p className="mt-2 text-xs text-slate-500">O item volta ao planejamento (aguardando roteirização) com esta data.</p>
      </Modal>
      <Confirmar aberto={!!cancelar} perigo titulo="Cancelar" texto={`Cancelar ${cancelar?.length} item(ns)? Ficam no histórico e podem ser restaurados.`} onFechar={() => setCancelar(null)}
        onConfirmar={() => { const c = cancelar!; setCancelar(null); run(() => acoes.cancelar(c, null), 'Cancelado(s).') }} />
    </Pagina>
  )
}
