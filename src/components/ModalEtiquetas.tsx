// Etiquetas da expedição: automáticas (todas/filtradas), por item específico, e avulsa (manual).
import { Printer, Search, PenLine } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { usePrint } from './Print'
import { FolhaAvulsa, FolhaEtiquetas, type ModoImpressora, type TipoEtiqueta } from './Etiqueta'
import { Botao, Campo, Input, Modal, Select, cx } from './ui'
import type { Demanda, EtiquetaAvulsa, StatusSeparacao } from '../lib/types'
import { SEPARACAO_LABEL, TIPOS } from '../lib/status'
import { normalizar, textoBusca, fmtPatrimonio } from '../lib/format'

export function ModalEtiquetas({ aberto, onFechar, itens, tipo = 'EXPEDICAO' }: { aberto: boolean; onFechar(): void; itens: Demanda[]; tipo?: TipoEtiqueta }) {
  const { tecnicos, tecnicoPorId, acoes } = useData()
  const { usuario } = useAuth()
  const { imprimir } = usePrint()
  const { toast, erro } = useToast()
  const [modo, setModo] = useState<ModoImpressora>(() => (localStorage.getItem('et-modo') as ModoImpressora) || 'normal')
  const [fStatus, setFStatus] = useState<'' | StatusSeparacao>('')
  const [fTec, setFTec] = useState('')
  const [busca, setBusca] = useState('')
  const [avulsa, setAvulsa] = useState(false)
  const [av, setAv] = useState<EtiquetaAvulsa>({ tecnico: null, veiculo: null, cliente: null, local: null, tipo: 'ENTREGA', equipamento: null, patrimonio: null, os: null, observacao: null })

  const escolherModo = (m: ModoImpressora) => { setModo(m); localStorage.setItem('et-modo', m) }
  const filtrados = useMemo(() => itens.filter(d => (!fStatus || d.status_separacao === fStatus) && (!fTec || d.tecnico_id === fTec)), [itens, fStatus, fTec])
  const encontrados = useMemo(() => { const b = normalizar(busca); return b.length >= 2 ? itens.filter(d => textoBusca(d).includes(b)).slice(0, 8) : [] }, [itens, busca])

  const imprimirLote = (lista: Demanda[]) => {
    if (!lista.length) { toast('Nenhuma etiqueta para imprimir com esse filtro.', 'info'); return }
    imprimir(<FolhaEtiquetas itens={lista} tipo={tipo} modo={modo} tecnicoPorId={id => tecnicoPorId(id)} />)
    toast(`${lista.length} etiqueta(s) enviada(s) para impressão.`)
  }
  const imprimirAvulsa = async () => {
    if (!av.equipamento?.trim() && !av.os?.trim()) { toast('Informe ao menos equipamento ou OS.', 'erro'); return }
    try {
      const limpa = Object.fromEntries(Object.entries(av).map(([k, v]) => [k, typeof v === 'string' ? (v.trim().toUpperCase() || null) : v])) as EtiquetaAvulsa
      limpa.tecnico = av.tecnico?.trim() || null
      const salva = await acoes.registrarEtiquetaAvulsa(limpa, usuario?.id ?? null).catch(() => ({ ...limpa, numero: 0 }))
      imprimir(<FolhaAvulsa etiquetas={[salva]} modo={modo} />)
      toast('Etiqueta avulsa enviada para impressão.')
    } catch (e) { erro(e) }
  }

  const setA = (k: keyof EtiquetaAvulsa, v: string) => setAv(a => ({ ...a, [k]: v }))
  const tec = tecnicos.find(t => t.nome === av.tecnico)

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="🖨 Etiquetas" largura="max-w-2xl" rodape={<Botao onClick={onFechar}>Fechar</Botao>}>
      <div className="space-y-4">
        <div>
          <div className="rotulo">Impressora</div>
          <div className="grid grid-cols-3 gap-2">
            {([['normal', '🖨 Normal (A4)'], ['58', '🧾 Térmica 58 mm'], ['80', '🧾 Térmica 80 mm']] as [ModoImpressora, string][]).map(([m, r]) => (
              <button key={m} onClick={() => escolherModo(m)} className={cx('rounded-lg px-3 py-2 text-sm font-medium ring-1 transition', modo === m ? 'bg-[#1a56db] text-white ring-[#1a56db]' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>{r}</button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Automática · com as demandas da tela</div>
          <div className="grid grid-cols-2 gap-2">
            <Campo rotulo="Filtrar por separação"><Select value={fStatus} onChange={e => setFStatus(e.target.value as '' | StatusSeparacao)}><option value="">Todas</option>{(Object.keys(SEPARACAO_LABEL) as StatusSeparacao[]).map(s => <option key={s} value={s}>{SEPARACAO_LABEL[s]}</option>)}</Select></Campo>
            <Campo rotulo="Filtrar por técnico"><Select value={fTec} onChange={e => setFTec(e.target.value)}><option value="">Todos os técnicos</option>{tecnicos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</Select></Campo>
          </div>
          <div className="mt-2 flex gap-2">
            <Botao variante="primario" className="flex-1 justify-center" onClick={() => imprimirLote(filtrados)}><Printer size={14} />Imprimir {filtrados.length} etiqueta(s)</Botao>
            <Botao variante={avulsa ? 'sucesso' : 'secundario'} className="flex-1 justify-center" onClick={() => setAvulsa(a => !a)}><PenLine size={14} />Etiqueta avulsa (manual)</Botao>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Item específico</div>
          <div className="relative"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="OS, patrimônio, cliente ou equipamento…" className="pl-8" /></div>
          {encontrados.length > 0 && (
            <ul className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200">
              {encontrados.map(d => (
                <li key={d.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                  <div className="min-w-0 flex-1"><b>{d.equipamento_nome}</b> · {fmtPatrimonio(d)} · OS {d.om ?? '—'} <span className="text-slate-500">· {d.cliente_nome} · {tecnicoPorId(d.tecnico_id)?.nome ?? 'sem técnico'}</span></div>
                  <Botao tamanho="sm" onClick={() => imprimirLote([d])}><Printer size={12} />Imprimir</Botao>
                </li>
              ))}
            </ul>
          )}
        </div>

        {avulsa && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-800">Etiqueta avulsa · preenchimento manual</div>
            <datalist id="dl-tec-av">{tecnicos.map(t => <option key={t.id} value={t.nome} />)}</datalist>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Campo rotulo="Técnico"><Input list="dl-tec-av" value={av.tecnico ?? ''} onChange={e => { setA('tecnico', e.target.value); const t = tecnicos.find(x => x.nome === e.target.value); if (t?.veiculo_padrao && !av.veiculo) setA('veiculo', t.veiculo_padrao) }} /></Campo>
              <Campo rotulo="Veículo"><Input value={av.veiculo ?? ''} onChange={e => setA('veiculo', e.target.value)} placeholder={tec?.veiculo_padrao ?? ''} /></Campo>
              <Campo rotulo="Cliente" className="col-span-2"><Input value={av.cliente ?? ''} onChange={e => setA('cliente', e.target.value)} /></Campo>
              <Campo rotulo="Local" className="col-span-2"><Input value={av.local ?? ''} onChange={e => setA('local', e.target.value)} /></Campo>
              <Campo rotulo="Tipo"><Select value={av.tipo ?? ''} onChange={e => setA('tipo', e.target.value)}>{TIPOS.map(t => <option key={t}>{t}</option>)}</Select></Campo>
              <Campo rotulo="OS"><Input value={av.os ?? ''} onChange={e => setA('os', e.target.value)} className="om" /></Campo>
              <Campo rotulo="Equipamento" className="col-span-2"><Input value={av.equipamento ?? ''} onChange={e => setA('equipamento', e.target.value)} /></Campo>
              <Campo rotulo="Patrimônio"><Input value={av.patrimonio ?? ''} onChange={e => setA('patrimonio', e.target.value)} /></Campo>
              <Campo rotulo="Observação"><Input value={av.observacao ?? ''} onChange={e => setA('observacao', e.target.value)} /></Campo>
            </div>
            <Botao variante="primario" className="mt-3 w-full justify-center" onClick={imprimirAvulsa}><Printer size={14} />Imprimir etiqueta avulsa</Botao>
          </div>
        )}
      </div>
    </Modal>
  )
}
