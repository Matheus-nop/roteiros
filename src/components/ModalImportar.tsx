// Importação em lote: cola do Excel/Sheets (TSV) ou CSV. OM sempre texto.
import Papa from 'papaparse'
import { useMemo, useState } from 'react'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import type { NovaDemanda, Tipo } from '../lib/types'
import { TIPOS } from '../lib/status'
import { hojeISO, normalizar } from '../lib/format'
import { encontrarDuplicata } from '../lib/actions'
import { Botao, Modal } from './ui'

const ALIAS: Record<string, string[]> = {
  om: ['om', 'os', 'om/os', 'numero om', 'nº om', 'ordem', 'contrato'],
  cliente: ['cliente', 'empresa'],
  local: ['local', 'endereco', 'endereço', 'obra', 'bairro'],
  tipo: ['tipo', 'operacao', 'operação', 'movimento'],
  equipamento: ['equipamento', 'equip', 'descricao', 'descrição', 'item'],
  patrimonio: ['patrimonio', 'patrimônio', 'pat', 'tag'],
  quantidade: ['quantidade', 'qtd', 'qtde'],
  observacao: ['observacao', 'observação', 'obs'],
  data_abertura: ['data', 'data abertura', 'abertura'],
}

function mapearColuna(h: string): string | null {
  const n = normalizar(h).toLowerCase()
  for (const [k, al] of Object.entries(ALIAS)) if (al.includes(n)) return k
  return null
}

function tipoDe(v: string): Tipo {
  const n = normalizar(v)
  const t = TIPOS.find(t => normalizar(t) === n)
  if (t) return t
  if (n.startsWith('ENTREG')) return 'ENTREGA'
  if (n.startsWith('LOCA')) return 'LOCACAO'
  if (n.startsWith('TROC')) return 'TROCA'
  if (n.startsWith('RETORNO AO')) return 'RETORNO AO CLIENTE'
  if (n.startsWith('RETOR')) return 'RETORNO'
  if (n.startsWith('RETIR')) return 'RETIRADA'
  if (n.startsWith('DEVOL')) return 'DEVOLUÇÃO'
  if (n.startsWith('MANUT')) return 'MANUTENÇÃO'
  return 'ENTREGA'
}

function dataDe(v: string): string | null {
  const s = v.trim()
  if (!s) return null
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s)
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` }
  return null
}

export function ModalImportar({ aberto, onFechar }: { aberto: boolean; onFechar(): void }) {
  const { clientes, equipamentos, demandas, acoes } = useData()
  const { toast, erro } = useToast()
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)

  const parse = useMemo(() => {
    if (!texto.trim()) return null
    const r = Papa.parse<Record<string, string>>(texto.trim(), { header: true, skipEmptyLines: true, delimiter: texto.includes('\t') ? '\t' : '' })
    const cols = (r.meta.fields ?? []).map(h => ({ h, k: mapearColuna(h) }))
    const linhas: NovaDemanda[] = r.data.map(row => {
      const g = (k: string) => { const c = cols.find(c => c.k === k); return c ? (row[c.h] ?? '').toString().trim() : '' }
      const nCli = normalizar(g('cliente'))
      const cli = clientes.find(c => normalizar(c.nome) === nCli || c.apelidos.some(a => normalizar(a) === nCli))
      const nEq = normalizar(g('equipamento')); const pat = g('patrimonio')
      const eq = equipamentos.find(e => normalizar(e.nome) === nEq && (pat ? normalizar(e.patrimonio) === normalizar(pat) : true))
      const qtd = Number(g('quantidade').replace(',', '.')) || 1
      return {
        om: g('om') || null,
        cliente_id: cli?.id ?? null, cliente_nome: cli?.nome ?? (g('cliente').toUpperCase() || null),
        local: g('local').toUpperCase() || null,
        tipo: tipoDe(g('tipo')),
        equipamento_id: eq?.id ?? null, equipamento_nome: eq?.nome ?? (g('equipamento').toUpperCase() || null),
        patrimonio: pat || null,
        quantidade: pat ? 1 : qtd,
        unidade: eq?.unidade ?? null,
        tecnico_id: null, veiculo: null,
        data_abertura: dataDe(g('data_abertura')) ?? hojeISO(), data_planejada: null, data_reagendada: null,
        observacao: g('observacao') || null,
        origem: 'IMPORTACAO',
      }
    }).filter(l => l.equipamento_nome || l.om)
    const dup = linhas.filter(l => encontrarDuplicata(l as never, demandas)).length
    return { cols, linhas, dup, semCliente: linhas.filter(l => !l.cliente_nome).length }
  }, [texto, clientes, equipamentos, demandas])

  const importar = async () => {
    if (!parse) return
    setSalvando(true)
    try {
      const { criadas, duplicadas } = await acoes.lancar(parse.linhas, demandas)
      toast(`${criadas.length} importada(s)${duplicadas.length ? `, ${duplicadas.length} duplicada(s) ignorada(s)` : ''}.`)
      setTexto(''); onFechar()
    } catch (e) { erro(e) } finally { setSalvando(false) }
  }

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Importar OMs em lote" largura="max-w-4xl" rodape={<>
      <Botao onClick={onFechar}>Cancelar</Botao>
      <Botao variante="primario" disabled={!parse?.linhas.length || salvando} onClick={importar}>{salvando ? 'Importando…' : `Importar ${parse?.linhas.length ?? 0} linha(s)`}</Botao>
    </>}>
      <p className="mb-2 text-sm text-slate-600">Cole aqui as linhas copiadas da planilha (com cabeçalho) ou um CSV. Colunas reconhecidas: OM, Cliente, Local, Tipo, Equipamento, Patrimônio, Quantidade, Observação, Data.</p>
      <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={8} className="campo font-mono text-xs" placeholder={'OM\tCliente\tLocal\tTipo\tEquipamento\tPatrimônio\tQtd\n1268-03/26\tÁGUAS DO RIO\tPENHA - ZONA NORTE\tENTREGA\tGERADOR DE ENERGIA 3,5KVA\t1234\t1'} />
      {parse && (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <div className="mb-1 font-medium text-slate-800">Prévia: {parse.linhas.length} linha(s) · {parse.dup} duplicada(s) · {parse.semCliente} sem cliente</div>
          <div>Colunas: {parse.cols.map(c => <span key={c.h} className={'mr-1 inline-block rounded px-1.5 py-0.5 ring-1 ' + (c.k ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-slate-200 line-through')}>{c.h}{c.k ? ` → ${c.k}` : ''}</span>)}</div>
          <div className="mt-2 max-h-40 overflow-auto rounded border border-slate-200 bg-white">
            <table className="w-full text-[11px]">
              <thead><tr className="bg-slate-50 text-left"><th className="px-2 py-1">OM</th><th className="px-2 py-1">Cliente</th><th className="px-2 py-1">Tipo</th><th className="px-2 py-1">Equipamento</th><th className="px-2 py-1">Pat/Qtd</th></tr></thead>
              <tbody>{parse.linhas.slice(0, 30).map((l, i) => <tr key={i} className="border-t border-slate-100"><td className="px-2 py-1 font-mono">{l.om}</td><td className="px-2 py-1">{l.cliente_nome}</td><td className="px-2 py-1">{l.tipo}</td><td className="px-2 py-1">{l.equipamento_nome}</td><td className="px-2 py-1">{l.patrimonio ?? `Qtd: ${l.quantidade}`}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}
