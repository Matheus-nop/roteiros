// Importação em lote: cola do Excel/Sheets (TSV) ou CSV. OM sempre texto.
import Papa from 'papaparse'
import { useEffect, useMemo, useState } from 'react'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import type { Demanda, NovaDemanda, Status, Tecnico, Tipo } from '../lib/types'
import { TIPOS, TODOS_STATUS } from '../lib/status'
import { db } from '../lib'
import { hojeISO, normalizar } from '../lib/format'
import { chaveAproximada, chaveIdentidade, encontrarDuplicata } from '../lib/actions'
import { Botao, Modal } from './ui'

// `ordem` NÃO é apelido de OM. Na planilha do sistema antigo, ORDEM é a sequência da
// parada no roteiro e OS_CONTRATO é a ordem de serviço — trocar os dois embaralharia as
// duas colunas mais importantes da importação.
const ALIAS: Record<string, string[]> = {
  om: ['om', 'os', 'om/os', 'numero om', 'nº om', 'contrato', 'os_contrato', 'os contrato', 'ordem de manutencao', 'ordem de manutenção'],
  cliente: ['cliente', 'empresa'],
  local: ['local', 'endereco', 'endereço', 'obra', 'bairro'],
  tipo: ['tipo', 'operacao', 'operação', 'movimento'],
  equipamento: ['equipamento', 'equip', 'descricao', 'descrição', 'item'],
  patrimonio: ['patrimonio', 'patrimônio', 'pat', 'tag'],
  quantidade: ['quantidade', 'qtd', 'qtde'],
  observacao: ['observacao', 'observação', 'obs'],
  data_abertura: ['data', 'data abertura', 'abertura'],
  // Um planejamento inteiro não é só uma lista de itens: é quem vai, quando e em que
  // ordem. Sem estas colunas a importação joga tudo na fila e o trabalho de planejar
  // teria de ser refeito à mão.
  tecnico: ['tecnico', 'técnico', 'responsavel', 'responsável'],
  veiculo: ['veiculo', 'veículo', 'carro'],
  data_planejada: ['data execucao', 'data execução', 'data planejada', 'execucao', 'execução', 'data do roteiro'],
  ordem: ['ordem', 'ordem parada', 'ordem_parada', 'seq', 'sequencia', 'sequência', 'parada'],
  status: ['status', 'status plano', 'status_plano', 'situacao', 'situação'],
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

/** Status da planilha antiga → status daqui. Desconhecido devolve null e cai no padrão. */
function statusDe(v: string): Status | null {
  const n = normalizar(v).replace(/\s+/g, '_')
  if (!n) return null
  const direto = TODOS_STATUS.find(s => normalizar(s).replace(/\s+/g, '_') === n)
  if (direto) return direto
  if (n.startsWith('AGUARDANDO_ROTEIRIZAC')) return 'AGUARDANDO_ROTEIRIZACAO'
  if (n.startsWith('FINALIZAD') || n.startsWith('CONCLU')) return 'FINALIZADO'
  if (n.startsWith('PLANEJAD')) return 'PLANEJADO'
  if (n.startsWith('ROTEIRIZAD')) return 'ROTEIRIZADO'
  if (n.startsWith('PENDENT')) return 'PENDENTE'
  if (n.startsWith('REAGENDAD')) return 'REAGENDADO'
  if (n.startsWith('CANCELAD')) return 'CANCELADO'
  return null
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
  const { clientes, equipamentos, demandas, tecnicos, acoes } = useData()
  const { toast, erro } = useToast()
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  // Demandas parecidas que JÁ existem, incluindo as concluídas.
  //
  // Por que buscar em vez de usar as que estão em memória: o `useData` carrega só as
  // ativas. A duplicata mais provável, porém, é a que foi lançada e concluída ontem —
  // exatamente a que não está carregada. Sem esta busca, o aviso calaria bem na hora
  // em que ele mais importa.
  const [existentes, setExistentes] = useState<Demanda[]>([])

  const parse = useMemo(() => {
    if (!texto.trim()) return null
    const r = Papa.parse<Record<string, string>>(texto.trim(), { header: true, skipEmptyLines: true, delimiter: texto.includes('\t') ? '\t' : '' })
    const cols = (r.meta.fields ?? []).map(h => ({ h, k: mapearColuna(h) }))
    // O `_tecnicoNaoAchado` só existe para a prévia avisar; é retirado antes de gravar.
    type LinhaPrevia = NovaDemanda & { _tecnicoNaoAchado: string | null }
    const linhas: LinhaPrevia[] = r.data.map((row): LinhaPrevia => {
      const g = (k: string) => { const c = cols.find(c => c.k === k); return c ? (row[c.h] ?? '').toString().trim() : '' }
      const nCli = normalizar(g('cliente'))
      const cli = clientes.find(c => normalizar(c.nome) === nCli || (c.apelidos ?? []).some(a => normalizar(a) === nCli))
      const nEq = normalizar(g('equipamento')); const pat = g('patrimonio')
      const eq = equipamentos.find(e => normalizar(e.nome) === nEq && (pat ? normalizar(e.patrimonio) === normalizar(pat) : true))
      const qtd = Number(g('quantidade').replace(',', '.')) || 1
      // Nome de pessoa vira FK, sempre. O que não casar com técnico cadastrado é contado
      // e mostrado na prévia — importar em silêncio uma atribuição perdida seria pior do
      // que não importar.
      const nTec = normalizar(g('tecnico'))
      const tec: Tecnico | undefined = nTec ? tecnicos.find(t => normalizar(t.nome) === nTec) : undefined
      const dataPlan = dataDe(g('data_planejada'))
      const ordem = Number(g('ordem').replace(',', '.'))
      // Sem status explícito, o estado sai do que a linha traz: com técnico e data já
      // está planejada; só com data, espera roteirização; sem nada, é fila.
      const status = statusDe(g('status')) ?? (tec && dataPlan ? 'PLANEJADO' : dataPlan ? 'AGUARDANDO_ROTEIRIZACAO' : 'FILA')
      return {
        om: g('om') || null,
        cliente_id: cli?.id ?? null, cliente_nome: cli?.nome ?? (g('cliente').toUpperCase() || null),
        local: g('local').toUpperCase() || null,
        tipo: tipoDe(g('tipo')),
        equipamento_id: eq?.id ?? null, equipamento_nome: eq?.nome ?? (g('equipamento').toUpperCase() || null),
        patrimonio: pat || null,
        quantidade: pat ? 1 : qtd,
        unidade: eq?.unidade ?? null,
        tecnico_id: tec?.id ?? null,
        veiculo: g('veiculo') || tec?.veiculo_padrao || null,
        data_abertura: dataDe(g('data_abertura')) ?? hojeISO(),
        data_planejada: dataPlan,
        data_reagendada: null,
        ordem_parada: Number.isFinite(ordem) && ordem > 0 ? ordem : null,
        status,
        observacao: g('observacao') || null,
        origem: 'IMPORTACAO',
        // Nome digitado sem técnico correspondente: guardado só para a prévia contar.
        _tecnicoNaoAchado: nTec && !tec ? g('tecnico') : null,
      } as NovaDemanda & { _tecnicoNaoAchado: string | null }
    }).filter(l => l.equipamento_nome || l.om)
    // Duplicata é de dois tipos, e a prévia precisa contar os dois: contra o que já está
    // no sistema E contra o próprio lote colado. O `lancar` descarta as duas, então uma
    // prévia que só olhasse para fora prometeria mais linhas do que vai gravar.
    const vistas = new Set<string>()
    let dup = 0
    for (const l of linhas) {
      const k = chaveIdentidade(l as never)
      if (encontrarDuplicata(l as never, demandas) || vistas.has(k)) dup++
      else vistas.add(k)
    }
    const semTecnico = Array.from(new Set(linhas.map(l => l._tecnicoNaoAchado).filter(Boolean) as string[]))
    return { cols, linhas, dup, semTecnico, semCliente: linhas.filter(l => !l.cliente_nome).length }
  }, [texto, clientes, equipamentos, tecnicos, demandas])

  // Chaves da colagem atual, para a consulta abaixo. String estável: array novo a cada
  // render entraria em laço como dependência do efeito.
  const patrimonios = useMemo(() => {
    if (!texto.trim()) return ''
    return Array.from(new Set(
      texto.split('\n').flatMap(l => l.split(/[\t;,]/)).map(c => c.trim()).filter(c => /^[0-9]{4,}[-0-9]*$/.test(c)),
    )).slice(0, 300).sort().join('|')
  }, [texto])

  useEffect(() => {
    let vivo = true
    if (!patrimonios) { setExistentes([]); return }
    db.select<Demanda>('demandas', { in: { patrimonio: patrimonios.split('|') } })
      .then(r => { if (vivo) setExistentes(r) })
      .catch(() => { if (vivo) setExistentes([]) })
    return () => { vivo = false }
  }, [patrimonios])

  // Parecidas: mesma peça e mesmo equipamento, escritas de outro jeito. Não bloqueiam —
  // o `lancar` só descarta igualdade exata. Servem para quem colou conferir antes.
  const parecidas = useMemo(() => {
    if (!parse) return []
    const mapa = new Map<string, Demanda>()
    for (const d of [...existentes, ...demandas]) {
      const k = chaveAproximada(d)
      if (k && !mapa.has(k)) mapa.set(k, d)
    }
    return parse.linhas
      .filter(l => !encontrarDuplicata(l as never, demandas))
      .map(l => ({ nova: l, velha: mapa.get(chaveAproximada(l as never)) }))
      .filter((x): x is { nova: typeof parse.linhas[number]; velha: Demanda } => !!x.velha)
  }, [parse, existentes, demandas])

  const importar = async () => {
    if (!parse) return
    setSalvando(true)
    try {
      // `_tecnicoNaoAchado` é só da prévia: não pode ir para o banco.
      const paraGravar = parse.linhas.map(({ _tecnicoNaoAchado: _, ...l }) => l)
      const { criadas, duplicadas } = await acoes.lancar(paraGravar, demandas)
      // Importação é onde mais chega nome que ainda não existe no cadastro.
      const novos = await acoes.aprenderCadastros(criadas, clientes, equipamentos)
      const aprendeu = novos.clientes.length + novos.equipamentos.length
      toast(`${criadas.length} importada(s)${duplicadas.length ? `, ${duplicadas.length} duplicada(s) ignorada(s)` : ''}${aprendeu ? `, ${aprendeu} cadastro(s) novo(s)` : ''}.`)
      setTexto(''); onFechar()
    } catch (e) { erro(e) } finally { setSalvando(false) }
  }

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Importar OMs em lote" largura="max-w-4xl" rodape={<>
      <Botao onClick={onFechar}>Cancelar</Botao>
      <Botao variante="primario" disabled={!parse?.linhas.length || salvando} onClick={importar}>{salvando ? 'Importando…' : `Importar ${parse?.linhas.length ?? 0} linha(s)`}</Botao>
    </>}>
      <p className="mb-2 text-sm text-slate-600">
        Cole aqui as linhas copiadas da planilha (com cabeçalho) ou um CSV.<br />
        <b>Reconhecidas:</b> OM/OS, Cliente, Local, Tipo, Equipamento, Patrimônio, Quantidade, Observação, Data.<br />
        <b>Do planejamento também:</b> Técnico, Veículo, Data execução, Ordem e Status — com elas a demanda já entra atribuída, na data e na coluna certa, em vez de cair na fila.
      </p>
      <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={8} className="campo font-mono text-xs" placeholder={'OM\tCliente\tLocal\tTipo\tEquipamento\tPatrimônio\tQtd\n1268-03/26\tÁGUAS DO RIO\tPENHA - ZONA NORTE\tENTREGA\tGERADOR DE ENERGIA 3,5KVA\t1234\t1'} />
      {parse && (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <div className="mb-1 font-medium text-slate-800">Prévia: {parse.linhas.length} linha(s) · {parse.dup} duplicada(s) (não serão gravadas) · {parse.semCliente} sem cliente</div>
          {/* Já existe algo muito parecido: a regra de duplicidade exige igualdade exata
              e não vê "035635" contra "35635", nem enxerga o que já foi concluído. */}
          {parecidas.length > 0 && (
            <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-2.5 py-2 text-amber-900">
              <b>{parecidas.length} linha(s) parecem já existir no sistema</b> (mesma peça e equipamento, escritos de outro jeito).
              O sistema <b>não</b> vai barrar — só barra o que é idêntico. Confira antes:
              <ul className="mt-1 space-y-0.5">
                {parecidas.slice(0, 8).map(({ nova, velha }, i) => (
                  <li key={i}>
                    · <b>{nova.equipamento_nome}</b> pat. {nova.patrimonio ?? '—'} — já existe como demanda nº {velha.numero} ({velha.status}{velha.data_planejada ? `, ${velha.data_planejada}` : ''})
                  </li>
                ))}
                {parecidas.length > 8 && <li className="text-amber-700">…e mais {parecidas.length - 8}.</li>}
              </ul>
            </div>
          )}

          {/* Técnico que não casou com o cadastro: a demanda entra sem responsável. Isso
              precisa gritar, senão o planejamento chega pela metade sem ninguém notar. */}
          {parse.semTecnico.length > 0 && (
            <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-2.5 py-2 text-amber-900">
              <b>Técnico não encontrado no cadastro:</b> {parse.semTecnico.join(', ')}.
              Essas demandas entram <b>sem técnico</b>. Cadastre em Técnicos (com o nome exato) e cole de novo para elas já virem atribuídas.
            </div>
          )}
          <div>Colunas: {parse.cols.map(c => <span key={c.h} className={'mr-1 inline-block rounded px-1.5 py-0.5 ring-1 ' + (c.k ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-slate-200 line-through')}>{c.h}{c.k ? ` → ${c.k}` : ''}</span>)}</div>
          <div className="mt-2 max-h-40 overflow-auto rounded border border-slate-200 bg-white">
            <table className="w-full text-[11px]">
              <thead><tr className="bg-slate-50 text-left"><th className="px-2 py-1">OM</th><th className="px-2 py-1">Cliente</th><th className="px-2 py-1">Tipo</th><th className="px-2 py-1">Equipamento</th><th className="px-2 py-1">Pat/Qtd</th><th className="px-2 py-1">Técnico</th><th className="px-2 py-1">Data</th><th className="px-2 py-1">Status</th></tr></thead>
              <tbody>{parse.linhas.slice(0, 30).map((l, i) => <tr key={i} className="border-t border-slate-100"><td className="px-2 py-1 font-mono">{l.om}</td><td className="px-2 py-1">{l.cliente_nome}</td><td className="px-2 py-1">{l.tipo}</td><td className="px-2 py-1">{l.equipamento_nome}</td><td className="px-2 py-1">{l.patrimonio ?? `Qtd: ${l.quantidade}`}</td><td className={'px-2 py-1' + (l._tecnicoNaoAchado ? ' font-medium text-amber-700' : '')}>{l.tecnico_id ? (tecnicos.find(t => t.id === l.tecnico_id)?.nome ?? '—') : (l._tecnicoNaoAchado ? `${l._tecnicoNaoAchado} (?)` : '—')}</td><td className="px-2 py-1">{l.data_planejada ?? '—'}</td><td className="px-2 py-1">{l.status}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}
