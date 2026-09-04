// Lançamento de demandas (uma ou várias de uma vez) e edição.
import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import type { Demanda, NovaDemanda, Tipo } from '../lib/types'
import { TIPOS } from '../lib/status'
import { fmtDataHora, hojeISO, normalizar } from '../lib/format'
import { encontrarDuplicata } from '../lib/actions'
import { Botao, Campo, Input, Modal, Select } from './ui'

type Linha = { om: string; cliente: string; local: string; tipo: Tipo; equipamento: string; patrimonio: string; quantidade: string; observacao: string }
const vazia = (): Linha => ({ om: '', cliente: '', local: '', tipo: 'ENTREGA', equipamento: '', patrimonio: '', quantidade: '1', observacao: '' })

export function ModalNovaDemanda({ aberto, onFechar }: { aberto: boolean; onFechar(): void }) {
  const { clientes, equipamentos, demandas, acoes } = useData()
  const { toast, erro } = useToast()
  const [linhas, setLinhas] = useState<Linha[]>([vazia()])
  const [salvando, setSalvando] = useState(false)

  const nomesEquip = useMemo(() => Array.from(new Set(equipamentos.map(e => e.nome))).sort(), [equipamentos])

  const resolverCliente = (nome: string) => {
    const n = normalizar(nome)
    return clientes.find(c => normalizar(c.nome) === n || c.apelidos.some(a => normalizar(a) === n))
  }
  const resolverEquip = (nome: string, pat: string) => {
    const n = normalizar(nome)
    const p = normalizar(pat)
    return equipamentos.find(e => normalizar(e.nome) === n && (p ? normalizar(e.patrimonio) === p : true))
  }

  const set = (i: number, k: keyof Linha, v: string) => setLinhas(ls => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)))

  const montar = (l: Linha): NovaDemanda => {
    const cli = resolverCliente(l.cliente)
    const eq = resolverEquip(l.equipamento, l.patrimonio)
    const porQtd = eq?.controlado_por_quantidade ?? !l.patrimonio.trim()
    return {
      om: l.om.trim() || null,
      cliente_id: cli?.id ?? null,
      cliente_nome: cli?.nome ?? (l.cliente.trim().toUpperCase() || null),
      local: l.local.trim().toUpperCase() || null,
      tipo: l.tipo,
      equipamento_id: eq?.id ?? null,
      equipamento_nome: (eq?.nome ?? l.equipamento.trim().toUpperCase()) || null,
      patrimonio: l.patrimonio.trim() || null,
      quantidade: porQtd ? Number(l.quantidade.replace(',', '.')) || 1 : 1,
      unidade: eq?.unidade ?? null,
      tecnico_id: null, veiculo: null,
      data_abertura: hojeISO(), data_planejada: null, data_reagendada: null,
      observacao: l.observacao.trim() || null,
      origem: 'COMERCIAL',
    }
  }

  const salvar = async () => {
    const validas = linhas.filter(l => l.equipamento.trim() || l.om.trim())
    if (!validas.length) { toast('Preencha ao menos equipamento ou OM.', 'erro'); return }
    const faltando = validas.find(l => !l.equipamento.trim() || !l.cliente.trim())
    if (faltando) { toast('Cada linha precisa de cliente e equipamento.', 'erro'); return }
    setSalvando(true)
    try {
      const { criadas, duplicadas } = await acoes.lancar(validas.map(montar), demandas)
      if (criadas.length) toast(`${criadas.length} demanda(s) lançada(s).`)
      if (duplicadas.length) toast(`${duplicadas.length} ignorada(s) por duplicidade (mesmo equipamento + patrimônio + OM + cliente ainda ativo).`, 'erro')
      if (criadas.length) { setLinhas([vazia()]); onFechar() }
    } catch (e) { erro(e) } finally { setSalvando(false) }
  }

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Nova demanda" largura="max-w-5xl" rodape={<>
      <Botao onClick={onFechar}>Cancelar</Botao>
      <Botao variante="primario" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : `Lançar ${linhas.length > 1 ? linhas.length + ' demandas' : 'demanda'}`}</Botao>
    </>}>
      <datalist id="dl-clientes">{clientes.map(c => <option key={c.id} value={c.nome} />)}</datalist>
      <datalist id="dl-equip">{nomesEquip.map(n => <option key={n} value={n} />)}</datalist>
      <div className="space-y-2">
        {linhas.map((l, i) => {
          const dup = l.equipamento && encontrarDuplicata(montar(l) as Demanda, demandas)
          return (
            <div key={i} className="rounded-md border border-slate-200 bg-slate-50/60 p-3">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
                <Campo rotulo="OM / OS"><Input value={l.om} onChange={e => set(i, 'om', e.target.value)} placeholder="1268-03/26" className="om" /></Campo>
                <Campo rotulo="Cliente" className="lg:col-span-2"><Input list="dl-clientes" value={l.cliente} onChange={e => set(i, 'cliente', e.target.value)} /></Campo>
                <Campo rotulo="Local" className="lg:col-span-2"><Input value={l.local} onChange={e => set(i, 'local', e.target.value)} placeholder="PENHA - ZONA NORTE" /></Campo>
                <Campo rotulo="Tipo"><Select value={l.tipo} onChange={e => set(i, 'tipo', e.target.value)}>{TIPOS.map(t => <option key={t}>{t}</option>)}</Select></Campo>
                <Campo rotulo="Equipamento" className="lg:col-span-2"><Input list="dl-equip" value={l.equipamento} onChange={e => set(i, 'equipamento', e.target.value)} /></Campo>
                <Campo rotulo="Patrimônio"><Input value={l.patrimonio} onChange={e => set(i, 'patrimonio', e.target.value)} placeholder="vazio = por qtd" /></Campo>
                <Campo rotulo="Qtd"><Input value={l.quantidade} onChange={e => set(i, 'quantidade', e.target.value)} disabled={!!l.patrimonio.trim()} /></Campo>
                <Campo rotulo="Observação" className="col-span-2 lg:col-span-5"><Input value={l.observacao} onChange={e => set(i, 'observacao', e.target.value)} /></Campo>
                <div className="flex items-end justify-end">
                  <Botao variante="fantasma" tamanho="sm" onClick={() => setLinhas(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : [vazia()])} title="Remover linha"><Trash2 size={14} /></Botao>
                </div>
              </div>
              {dup && <p className="mt-2 text-xs text-red-700">Duplicada: já existe uma demanda ativa idêntica (status {dup.status}). Será ignorada.</p>}
            </div>
          )
        })}
      </div>
      <Botao tamanho="sm" className="mt-3" onClick={() => setLinhas(ls => [...ls, { ...vazia(), cliente: ls[ls.length - 1].cliente, local: ls[ls.length - 1].local, om: ls[ls.length - 1].om }])}><Plus size={14} />Adicionar linha</Botao>
      <p className="mt-3 text-xs text-slate-500">A OM é gravada como texto (nunca vira data). Itens sem patrimônio são controlados por quantidade.</p>
    </Modal>
  )
}

export function ModalEditarDemanda({ d, onFechar }: { d: Demanda | null; onFechar(): void }) {
  const { acoes, clientes, nomeDoUsuario } = useData()
  const { toast, erro } = useToast()
  const [f, setF] = useState<Partial<Demanda>>({})
  const v = { ...d, ...f } as Demanda
  const set = (k: keyof Demanda, val: unknown) => setF(x => ({ ...x, [k]: val }))
  if (!d) return null
  const salvar = async () => {
    try {
      const n = normalizar(v.cliente_nome)
      const cli = clientes.find(c => normalizar(c.nome) === n || c.apelidos.some(a => normalizar(a) === n))
      await acoes.editar(d.id, { ...f, cliente_id: cli?.id ?? d.cliente_id, cliente_nome: cli?.nome ?? v.cliente_nome })
      toast('Demanda atualizada.'); onFechar()
    } catch (e) { erro(e) }
  }
  return (
    <Modal aberto onFechar={onFechar} titulo={`Editar demanda #${d.numero}`} largura="max-w-3xl" rodape={<><Botao onClick={onFechar}>Cancelar</Botao><Botao variante="primario" onClick={salvar}>Salvar</Botao></>}>
      <datalist id="dl-clientes-ed">{clientes.map(c => <option key={c.id} value={c.nome} />)}</datalist>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Campo rotulo="OM / OS"><Input value={v.om ?? ''} onChange={e => set('om', e.target.value)} className="om" /></Campo>
        <Campo rotulo="Cliente" className="md:col-span-2"><Input list="dl-clientes-ed" value={v.cliente_nome ?? ''} onChange={e => set('cliente_nome', e.target.value)} /></Campo>
        <Campo rotulo="Local" className="md:col-span-2"><Input value={v.local ?? ''} onChange={e => set('local', e.target.value)} /></Campo>
        <Campo rotulo="Tipo"><Select value={v.tipo} onChange={e => set('tipo', e.target.value)}>{TIPOS.map(t => <option key={t}>{t}</option>)}</Select></Campo>
        <Campo rotulo="Equipamento" className="md:col-span-2"><Input value={v.equipamento_nome ?? ''} onChange={e => set('equipamento_nome', e.target.value)} /></Campo>
        <Campo rotulo="Patrimônio"><Input value={v.patrimonio ?? ''} onChange={e => set('patrimonio', e.target.value || null)} /></Campo>
        <Campo rotulo="Quantidade"><Input type="number" value={v.quantidade} onChange={e => set('quantidade', Number(e.target.value))} /></Campo>
        <Campo rotulo="Unidade"><Input value={v.unidade ?? ''} onChange={e => set('unidade', e.target.value || null)} /></Campo>
        <Campo rotulo="Data de abertura"><Input type="date" value={v.data_abertura ?? ''} onChange={e => set('data_abertura', e.target.value || null)} /></Campo>
        <Campo rotulo="Observação" className="col-span-2 md:col-span-3"><Input value={v.observacao ?? ''} onChange={e => set('observacao', e.target.value || null)} /></Campo>
      </div>

      {/* Procedência: responde "quem lançou isso?" sem sair da tela. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-[11.5px] text-slate-500">
        <span>Lançada por <b className="text-slate-700">{nomeDoUsuario(d.created_by)}</b> em {fmtDataHora(d.created_at)}</span>
        {d.origem && <span>· origem <b className="text-slate-700">{d.origem}</b></span>}
        {d.updated_at !== d.created_at && <span>· última alteração em {fmtDataHora(d.updated_at)}</span>}
        <span className="text-slate-400">· nº {d.numero}</span>
      </div>
    </Modal>
  )
}
