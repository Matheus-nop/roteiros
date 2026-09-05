// Cadastros: clientes (com apelidos), equipamentos, expedidores, usuários.
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { db } from '../lib'
import { Badge, Botao, Campo, Cartao, Checkbox, Confirmar, Input, Modal, Pagina, Select, cx } from '../components/ui'
import type { Cliente, Equipamento, Expedidor, Perfil, Papel } from '../lib/types'
import { PAPEL_LABEL } from '../lib/status'

type Aba = 'clientes' | 'equipamentos' | 'expedidores' | 'usuarios'

/**
 * Marca a linha que o próprio sistema criou a partir de um nome digitado no lançamento.
 * Cadastro que nasce sozinho precisa aparecer: é assim que erro de digitação vira algo
 * que alguém conserta, em vez de virar um segundo nome do mesmo equipamento no relatório.
 */
function BadgeAuto({ de }: { de: { criado_automaticamente?: boolean } }) {
  if (!de.criado_automaticamente) return null
  return <Badge tone="bg-violet-50 text-violet-800 ring-violet-200" className="ml-1.5" >do lançamento</Badge>
}

/** Quantos cadastros nasceram de um lançamento — vira o aviso de "confira estes". */
const contarAuto = (linhas: { criado_automaticamente?: boolean }[]) => linhas.filter(l => l.criado_automaticamente).length

export function Cadastros() {
  const { pode, usuario } = useAuth()
  const [aba, setAba] = useState<Aba>('clientes')
  const abas: { k: Aba; r: string }[] = [{ k: 'clientes', r: 'Clientes' }, { k: 'equipamentos', r: 'Equipamentos' }, { k: 'expedidores', r: 'Expedidores' }, ...(usuario?.perfil.papel === 'ADMIN' ? [{ k: 'usuarios' as Aba, r: 'Usuários' }] : [])]
  const editar = pode('cadastros.editar')
  return (
    <Pagina titulo="Cadastros" subtitulo="Clientes, equipamentos, expedidores e usuários">
      {/* Quatro abas não cabem em 390px: a faixa rola em vez de empurrar a página. */}
      <div className="rolagem-fina mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {abas.map(a => <button key={a.k} onClick={() => setAba(a.k)} className={cx('-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium', aba === a.k ? 'border-brand-700 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700')}>{a.r}</button>)}
      </div>
      {aba === 'clientes' && <Clientes editar={editar} />}
      {aba === 'equipamentos' && <Equipamentos editar={editar} />}
      {aba === 'expedidores' && <Expedidores editar={editar} />}
      {aba === 'usuarios' && <Usuarios />}
    </Pagina>
  )
}

function Clientes({ editar }: { editar: boolean }) {
  const { clientes, demandas, acoes } = useData()
  const { toast, erro } = useToast()
  const [f, setF] = useState<{ id?: string; nome: string; apelidos: string } | null>(null)
  const [busca, setBusca] = useState('')
  const lista = clientes.filter(c => !busca || (c.nome + ' ' + (c.apelidos ?? []).join(' ')).toLowerCase().includes(busca.toLowerCase()))
  const salvar = async () => {
    if (!f?.nome.trim()) return
    const dados = { nome: f.nome.trim().toUpperCase(), apelidos: f.apelidos.split(/[,;\n]/).map(s => s.trim().toUpperCase()).filter(Boolean) }
    try {
      if (!f.id) { await db.insert('clientes', [dados]); toast('Cliente salvo.'); setF(null); return }
      const antes = clientes.find(c => c.id === f.id)?.nome ?? ''
      await db.update('clientes', f.id, dados)
      // O nome fica gravado também em cada demanda (é o que as telas mostram). Renomear
      // só o cadastro deixaria o quadro exibindo o nome antigo.
      const n = dados.nome !== antes ? await acoes.renomearCliente(f.id, dados.nome) : 0
      toast(n ? `Cliente salvo. ${n} demanda(s) passaram a mostrar "${dados.nome}".` : 'Cliente salvo.')
      setF(null)
    } catch (e) { erro(e) }
  }
  return (
    <Cartao titulo={<span>Clientes <span className="font-normal text-slate-500">· apelido é variação de escrita do mesmo cliente — não use para juntar empresas do mesmo grupo{contarAuto(clientes) ? ` · ${contarAuto(clientes)} veio do lançamento` : ''}</span></span>} acoes={<>
      <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar…" className="w-48" />
      {editar && <Botao tamanho="sm" variante="primario" onClick={() => setF({ nome: '', apelidos: '' })}><Plus size={13} />Novo cliente</Botao>}
    </>}>
      <div className="overflow-x-auto"><table className="tabela w-full min-w-[560px]">
        <thead><tr><th>Cliente</th><th>Apelidos</th><th>Demandas ativas</th><th /></tr></thead>
        <tbody>{lista.map(c => (
          <tr key={c.id}>
            <td className="font-medium">{c.nome}<BadgeAuto de={c} /></td>
            <td className="text-xs text-slate-600">{(c.apelidos ?? []).length ? (c.apelidos ?? []).map(a => <Badge key={a} className="mr-1">{a}</Badge>) : '—'}</td>
            <td className="tabular-nums">{demandas.filter(d => d.cliente_id === c.id).length}</td>
            <td className="text-right">{editar && <Botao tamanho="sm" variante="fantasma" onClick={() => setF({ id: c.id, nome: c.nome, apelidos: (c.apelidos ?? []).join(', ') })}><Pencil size={13} /></Botao>}</td>
          </tr>))}</tbody>
      </table></div>
      <Modal aberto={!!f} onFechar={() => setF(null)} titulo={f?.id ? 'Editar cliente' : 'Novo cliente'} rodape={<><Botao onClick={() => setF(null)}>Cancelar</Botao><Botao variante="primario" onClick={salvar}>Salvar</Botao></>}>
        {f && <div className="space-y-3">
          <Campo rotulo="Nome oficial"><Input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} /></Campo>
          <Campo rotulo="Apelidos — variações de escrita do MESMO cliente (separadas por vírgula)"><Input value={f.apelidos} onChange={e => setF({ ...f, apelidos: e.target.value })} placeholder="AGUAS DO RIO, AGUAS RIO" /></Campo>
        </div>}
      </Modal>
    </Cartao>
  )
}

function Equipamentos({ editar }: { editar: boolean }) {
  const { equipamentos } = useData()
  const { toast, erro } = useToast()
  const [f, setF] = useState<Partial<Equipamento> | null>(null)
  const [busca, setBusca] = useState('')
  const [excluir, setExcluir] = useState<Equipamento | null>(null)
  const lista = equipamentos.filter(e => !busca || (e.nome + ' ' + (e.patrimonio ?? '')).toLowerCase().includes(busca.toLowerCase()))
  const salvar = async () => {
    if (!f?.nome?.trim()) return
    const dados = { nome: f.nome.trim().toUpperCase(), patrimonio: f.controlado_por_quantidade ? null : (f.patrimonio?.trim() || null), controlado_por_quantidade: !!f.controlado_por_quantidade, unidade: f.unidade?.trim().toUpperCase() || (f.controlado_por_quantidade ? 'UNIDADE' : null) }
    try { if (f.id) await db.update('equipamentos', f.id, dados); else await db.insert('equipamentos', [dados]); toast('Equipamento salvo.'); setF(null) } catch (e) { erro(e) }
  }
  return (
    <Cartao titulo={<span>Equipamentos <span className="font-normal text-slate-500">· {equipamentos.length} cadastrados{contarAuto(equipamentos) ? ` · ${contarAuto(equipamentos)} veio do lançamento` : ''}</span></span>} acoes={<>
      <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome ou patrimônio…" className="w-56" />
      {editar && <Botao tamanho="sm" variante="primario" onClick={() => setF({ controlado_por_quantidade: false })}><Plus size={13} />Novo equipamento</Botao>}
    </>}>
      <div className="max-h-[70vh] overflow-auto">
        <div className="overflow-x-auto"><table className="tabela w-full min-w-[560px]">
          <thead><tr><th>Equipamento</th><th>Patrimônio</th><th>Controle</th><th>Unidade</th><th /></tr></thead>
          <tbody>{lista.map(e => (
            <tr key={e.id}>
              <td className="font-medium">{e.nome}<BadgeAuto de={e} /></td>
              <td className="font-mono text-xs">{e.patrimonio ?? '—'}</td>
              <td>{e.controlado_por_quantidade ? <Badge tone="bg-sky-50 text-sky-800 ring-sky-200">por quantidade</Badge> : <Badge>patrimônio</Badge>}</td>
              <td className="text-xs">{e.unidade ?? '—'}</td>
              <td className="text-right">{editar && <><Botao tamanho="sm" variante="fantasma" onClick={() => setF(e)}><Pencil size={13} /></Botao><Botao tamanho="sm" variante="fantasma" onClick={() => setExcluir(e)}><Trash2 size={13} className="text-red-600" /></Botao></>}</td>
            </tr>))}</tbody>
        </table></div>
      </div>
      <Modal aberto={!!f} onFechar={() => setF(null)} titulo={f?.id ? 'Editar equipamento' : 'Novo equipamento'} rodape={<><Botao onClick={() => setF(null)}>Cancelar</Botao><Botao variante="primario" onClick={salvar}>Salvar</Botao></>}>
        {f && <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Nome" className="col-span-2"><Input value={f.nome ?? ''} onChange={e => setF({ ...f, nome: e.target.value })} /></Campo>
          <label className="col-span-2 flex items-center gap-2 text-sm"><Checkbox checked={!!f.controlado_por_quantidade} onChange={e => setF({ ...f, controlado_por_quantidade: e.target.checked })} />Controlado por quantidade (peça/metro, sem patrimônio)</label>
          {!f.controlado_por_quantidade && <Campo rotulo="Patrimônio"><Input value={f.patrimonio ?? ''} onChange={e => setF({ ...f, patrimonio: e.target.value })} /></Campo>}
          <Campo rotulo="Unidade"><Input value={f.unidade ?? ''} onChange={e => setF({ ...f, unidade: e.target.value })} placeholder="UNIDADE, METRO…" /></Campo>
        </div>}
      </Modal>
      <Confirmar aberto={!!excluir} perigo titulo="Excluir equipamento" texto={`Excluir ${excluir?.nome} ${excluir?.patrimonio ?? ''} do cadastro? Demandas existentes mantêm o nome gravado.`} onFechar={() => setExcluir(null)}
        onConfirmar={async () => { const e = excluir!; setExcluir(null); try { await db.remove('equipamentos', e.id); toast('Excluído.') } catch (er) { erro(er) } }} />
    </Cartao>
  )
}

function Expedidores({ editar }: { editar: boolean }) {
  const { expedidores } = useData()
  const { toast, erro } = useToast()
  const [nome, setNome] = useState('')
  const add = async () => { if (!nome.trim()) return; try { await db.insert('expedidores', [{ nome: nome.trim(), ativo: true }]); setNome(''); toast('Expedidor adicionado.') } catch (e) { erro(e) } }
  const toggle = async (x: Expedidor) => { try { await db.update('expedidores', x.id, { ativo: !x.ativo }) } catch (e) { erro(e) } }
  return (
    <Cartao titulo="Expedidores (quem separa)" acoes={editar && <div className="flex gap-2"><Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome" className="w-40" onKeyDown={e => e.key === 'Enter' && add()} /><Botao tamanho="sm" variante="primario" onClick={add}><Plus size={13} />Adicionar</Botao></div>}>
      <ul className="divide-y divide-slate-100">
        {expedidores.map(x => <li key={x.id} className="flex items-center justify-between px-4 py-2 text-sm"><span className={x.ativo ? '' : 'text-slate-400 line-through'}>{x.nome}</span>{editar && <Botao tamanho="sm" variante="fantasma" onClick={() => toggle(x)}>{x.ativo ? 'Desativar' : 'Ativar'}</Botao>}</li>)}
      </ul>
    </Cartao>
  )
}

function Usuarios() {
  const { tecnicos } = useData()
  const { modoDemo } = useAuth()
  const { toast, erro } = useToast()
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const carregar = () => db.select<Perfil>('perfis', { order: [{ col: 'nome' }] }).then(setPerfis).catch(erro)
  useEffect(() => { carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const mudar = async (p: Perfil, patch: Partial<Perfil>) => { try { await db.update('perfis', p.id, patch); toast('Perfil atualizado.'); carregar() } catch (e) { erro(e) } }
  return (
    <Cartao titulo="Usuários e papéis">
      <p className="px-4 pt-3 text-xs text-slate-500">Usuários são criados no painel do Supabase (Authentication → Users). O primeiro vira ADMIN; os demais entram como PCM e podem ser ajustados aqui.{modoDemo && ' No modo demonstração não há usuários reais.'}</p>
      <div className="overflow-x-auto"><table className="tabela w-full min-w-[560px]">
        <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Técnico vinculado</th></tr></thead>
        <tbody>
          {perfis.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-slate-500">Nenhum perfil.</td></tr>}
          {perfis.map(p => (
            <tr key={p.id}>
              <td className="font-medium">{p.nome ?? '—'}</td>
              <td className="text-xs">{p.email}</td>
              <td><Select value={p.papel} onChange={e => mudar(p, { papel: e.target.value as Papel })} className="w-40">{(Object.keys(PAPEL_LABEL) as Papel[]).map(k => <option key={k} value={k}>{PAPEL_LABEL[k]}</option>)}</Select></td>
              <td><Select value={p.tecnico_id ?? ''} onChange={e => mudar(p, { tecnico_id: e.target.value || null })} className="w-44" disabled={p.papel !== 'TECNICO'}><option value="">—</option>{tecnicos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</Select></td>
            </tr>))}
        </tbody>
      </table></div>
    </Cartao>
  )
}

export type { Cliente }
