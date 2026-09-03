// Cadastro de técnicos e veículos.
import { Plus, Pencil } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { db } from '../lib'
import { Badge, Botao, Campo, Cartao, Checkbox, Input, Modal, Pagina, Select } from '../components/ui'
import type { Tecnico, Veiculo } from '../lib/types'

export function Tecnicos() {
  const { tecnicos, veiculos, demandas } = useData()
  const { pode } = useAuth()
  const editar = pode('cadastros.editar')
  const [tec, setTec] = useState<Partial<Tecnico> | null>(null)
  const [vei, setVei] = useState<Partial<Veiculo> | null>(null)
  const { toast, erro } = useToast()

  const salvarTec = async () => {
    if (!tec?.nome?.trim()) { toast('Nome obrigatório.', 'erro'); return }
    const dados = { nome: tec.nome.trim(), veiculo_padrao: tec.veiculo_padrao || null, ativo: tec.ativo ?? true, cor: tec.cor || null }
    try { if (tec.id) await db.update('tecnicos', tec.id, dados); else await db.insert('tecnicos', [dados]); toast('Técnico salvo.'); setTec(null) } catch (e) { erro(e) }
  }
  const salvarVei = async () => {
    if (!vei?.nome?.trim()) { toast('Nome obrigatório.', 'erro'); return }
    const dados = { nome: vei.nome.trim().toUpperCase(), placa: vei.placa?.trim().toUpperCase() || null, ativo: vei.ativo ?? true }
    try { if (vei.id) await db.update('veiculos', vei.id, dados); else await db.insert('veiculos', [dados]); toast('Veículo salvo.'); setVei(null) } catch (e) { erro(e) }
  }

  return (
    <Pagina titulo="Técnicos" subtitulo="Cadastro de técnicos de campo e veículos">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Cartao className="lg:col-span-3" titulo="Técnicos" acoes={editar && <Botao tamanho="sm" variante="primario" onClick={() => setTec({ ativo: true, cor: '#2563eb' })}><Plus size={13} />Novo técnico</Botao>}>
          <table className="tabela w-full">
            <thead><tr><th>Técnico</th><th>Veículo padrão</th><th>Ativas</th><th>Status</th><th /></tr></thead>
            <tbody>
              {tecnicos.map(t => (
                <tr key={t.id}>
                  <td><span className="inline-flex items-center gap-2 font-medium"><span className="h-3 w-3 rounded-full" style={{ background: t.cor ?? '#94a3b8' }} />{t.nome}</span></td>
                  <td className="text-xs">{t.veiculo_padrao ?? '—'}</td>
                  <td className="tabular-nums">{demandas.filter(d => d.tecnico_id === t.id).length}</td>
                  <td>{t.ativo ? <Badge tone="bg-emerald-50 text-emerald-800 ring-emerald-200">ativo</Badge> : <Badge>inativo</Badge>}</td>
                  <td className="text-right">{editar && <Botao tamanho="sm" variante="fantasma" onClick={() => setTec(t)}><Pencil size={13} /></Botao>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Cartao>
        <Cartao className="lg:col-span-2" titulo="Veículos" acoes={editar && <Botao tamanho="sm" variante="primario" onClick={() => setVei({ ativo: true })}><Plus size={13} />Novo veículo</Botao>}>
          <table className="tabela w-full">
            <thead><tr><th>Veículo</th><th>Placa</th><th>Status</th><th /></tr></thead>
            <tbody>
              {veiculos.map(v => (
                <tr key={v.id}>
                  <td className="font-medium">{v.nome}</td>
                  <td className="font-mono text-xs">{v.placa ?? '—'}</td>
                  <td>{v.ativo ? <Badge tone="bg-emerald-50 text-emerald-800 ring-emerald-200">ativo</Badge> : <Badge>inativo</Badge>}</td>
                  <td className="text-right">{editar && <Botao tamanho="sm" variante="fantasma" onClick={() => setVei(v)}><Pencil size={13} /></Botao>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Cartao>
      </div>

      <Modal aberto={!!tec} onFechar={() => setTec(null)} titulo={tec?.id ? 'Editar técnico' : 'Novo técnico'} rodape={<><Botao onClick={() => setTec(null)}>Cancelar</Botao><Botao variante="primario" onClick={salvarTec}>Salvar</Botao></>}>
        {tec && <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Nome" className="col-span-2"><Input value={tec.nome ?? ''} onChange={e => setTec({ ...tec, nome: e.target.value })} /></Campo>
          <Campo rotulo="Veículo padrão"><Select value={tec.veiculo_padrao ?? ''} onChange={e => setTec({ ...tec, veiculo_padrao: e.target.value })}><option value="">— nenhum —</option>{veiculos.map(v => <option key={v.id} value={v.nome}>{v.nome}</option>)}</Select></Campo>
          <Campo rotulo="Cor"><Input type="color" value={tec.cor ?? '#2563eb'} onChange={e => setTec({ ...tec, cor: e.target.value })} className="h-9 p-1" /></Campo>
          <label className="col-span-2 flex items-center gap-2 text-sm"><Checkbox checked={tec.ativo ?? true} onChange={e => setTec({ ...tec, ativo: e.target.checked })} />Ativo</label>
          <p className="col-span-2 text-xs text-slate-500">O veículo padrão é só sugestão: ao atribuir uma demanda, o veículo é escolhido explicitamente.</p>
        </div>}
      </Modal>
      <Modal aberto={!!vei} onFechar={() => setVei(null)} titulo={vei?.id ? 'Editar veículo' : 'Novo veículo'} rodape={<><Botao onClick={() => setVei(null)}>Cancelar</Botao><Botao variante="primario" onClick={salvarVei}>Salvar</Botao></>}>
        {vei && <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Nome (ex.: KIA - TTB0J08)" className="col-span-2"><Input value={vei.nome ?? ''} onChange={e => setVei({ ...vei, nome: e.target.value })} /></Campo>
          <Campo rotulo="Placa"><Input value={vei.placa ?? ''} onChange={e => setVei({ ...vei, placa: e.target.value })} /></Campo>
          <label className="flex items-end gap-2 pb-2 text-sm"><Checkbox checked={vei.ativo ?? true} onChange={e => setVei({ ...vei, ativo: e.target.checked })} />Ativo</label>
        </div>}
      </Modal>
    </Pagina>
  )
}
