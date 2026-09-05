// Importação de manutenções: cola a consulta de OMs do Sisloc e lança na fila.
//
// É o "Importar manutenções (OM)" do sistema antigo. A diferença para o importador de
// planilha é a origem: aqui não existe cabeçalho combinado nem colunas escolhidas — vem
// o recorte cru do Sisloc, com dezenas de colunas, e o trabalho é achar as quatro que
// importam. A leitura mora em `lib/om.ts`.

import { useMemo, useState } from 'react'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { useLocalidades } from '../hooks/useVocabulario'
import type { NovaDemanda, Tipo } from '../lib/types'
import { lerOM } from '../lib/om'
import { normalizar } from '../lib/format'
import { encontrarDuplicata } from '../lib/actions'
import { Botao, Campo, Input, Modal, Select } from './ui'

/** O Sisloc só alimenta estes dois: manutenção de oficina e retorno ao cliente. */
const TIPOS_OM: Tipo[] = ['MANUTENÇÃO', 'RETORNO']

export function ModalImportarOM({ aberto, onFechar }: { aberto: boolean; onFechar(): void }) {
  const { clientes, equipamentos, demandas, acoes } = useData()
  const { toast, erro } = useToast()
  const locais = useLocalidades()
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState<Tipo>('MANUTENÇÃO')
  const [data, setData] = useState('')
  const [salvando, setSalvando] = useState(false)

  const previa = useMemo(() => {
    if (!texto.trim()) return null
    const { linhas, ignoradas, comCabecalho } = lerOM(texto, locais)
    const novas: NovaDemanda[] = linhas.map(l => {
      const nCli = normalizar(l.cliente)
      const cli = clientes.find(c => normalizar(c.nome) === nCli || (c.apelidos ?? []).some(a => normalizar(a) === nCli))
      // O nome vem como está no Sisloc, sem a marca. Casamento por SEMELHANÇA aqui seria
      // perigoso: "MARTELO ROMPEDOR 30KG" divide duas palavras com "MARTELETE ROMPEDOR
      // 30KG" e viraria outro equipamento, calado. Só liga ao cadastro quando o nome é o
      // mesmo; nome novo vira cadastro novo, marcado, pelo `aprenderCadastros`.
      const eq = equipamentos.find(e => normalizar(e.nome) === normalizar(l.equipamento)
        && (l.patrimonio ? normalizar(e.patrimonio) === normalizar(l.patrimonio) : true))
      return {
        om: l.os || null,
        cliente_id: cli?.id ?? null,
        cliente_nome: cli?.nome ?? (l.cliente.toUpperCase() || null),
        local: l.local.toUpperCase() || null,
        tipo,
        equipamento_id: eq?.id ?? null,
        equipamento_nome: l.equipamento.toUpperCase() || null,
        patrimonio: l.patrimonio || null,
        quantidade: 1,
        unidade: eq?.unidade ?? null,
        tecnico_id: null, veiculo: null,
        data_abertura: new Date().toISOString().slice(0, 10),
        data_planejada: data || null,
        data_reagendada: null,
        observacao: null,
        origem: 'IMPORTACAO_OM',
      }
    })
    const dup = novas.filter(n => encontrarDuplicata(n as never, demandas)).length
    return { linhas, novas, ignoradas, comCabecalho, dup, semLocalConhecido: linhas.filter(l => l.localNovo).length }
  }, [texto, tipo, data, locais, clientes, equipamentos, demandas])

  const importar = async () => {
    if (!previa?.novas.length) return
    setSalvando(true)
    try {
      const { criadas, duplicadas } = await acoes.lancar(previa.novas, demandas)
      const novos = await acoes.aprenderCadastros(criadas, clientes, equipamentos)
      const aprendeu = novos.clientes.length + novos.equipamentos.length
      toast(`${criadas.length} manutenção(ões) na fila${duplicadas.length ? `, ${duplicadas.length} duplicada(s) ignorada(s)` : ''}${aprendeu ? `, ${aprendeu} cadastro(s) novo(s)` : ''}.`)
      setTexto(''); onFechar()
    } catch (e) { erro(e) } finally { setSalvando(false) }
  }

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Importar manutenções (OM)" largura="max-w-5xl" rodape={<>
      <Botao onClick={onFechar}>Cancelar</Botao>
      <Botao variante="primario" disabled={!previa?.novas.length || salvando} onClick={importar}>
        {salvando ? 'Lançando…' : `Lançar ${previa?.novas.length ?? 0} na fila`}
      </Botao>
    </>}>
      <p className="mb-2 text-sm text-slate-600">
        Cole o recorte da consulta de OMs do <b>Sisloc</b> (com ou sem a linha de títulos). São lidos
        <b> cliente, equipamento, patrimônio e OS</b>; a marca sai do nome do equipamento, e o local de entrega
        é casado com as localidades que a equipe já usa.
      </p>

      <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={7}
        className="campo font-mono text-xs" placeholder="Cole aqui os dados da OM (Ctrl+V)…" />

      <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-md">
        <Campo rotulo="Tipo"><Select value={tipo} onChange={e => setTipo(e.target.value as Tipo)}>{TIPOS_OM.map(t => <option key={t}>{t}</option>)}</Select></Campo>
        <Campo rotulo="Data desejada (opcional)"><Input type="date" value={data} onChange={e => setData(e.target.value)} /></Campo>
      </div>

      {previa && (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <div className="mb-1 font-medium text-slate-800">
            {previa.linhas.length} item(ns) lido(s)
            {previa.ignoradas > 0 && ` · ${previa.ignoradas} linha(s) ignorada(s)`}
            {previa.dup > 0 && ` · ${previa.dup} duplicada(s) (não serão gravadas)`}
          </div>
          {!previa.comCabecalho && previa.linhas.length > 0 && (
            <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-2.5 py-2 text-amber-900">
              <b>Não achei a linha de títulos.</b> Li pelas posições padrão do Sisloc — confira o cliente e o
              patrimônio na prévia antes de lançar. Copiar incluindo o cabeçalho evita esse risco.
            </div>
          )}
          {previa.semLocalConhecido > 0 && (
            <div className="mb-2 text-slate-500">
              {previa.semLocalConhecido} item(ns) com local que a equipe ainda não usa — entram com o local de entrega da OM.
            </div>
          )}
          <div className="max-h-64 overflow-auto rounded border border-slate-200 bg-white">
            <table className="w-full text-[11px]">
              <thead><tr className="bg-slate-50 text-left">
                <th className="px-2 py-1">OS</th><th className="px-2 py-1">Cliente</th><th className="px-2 py-1">Equipamento</th>
                <th className="px-2 py-1">Patrimônio</th><th className="px-2 py-1">Local</th>
              </tr></thead>
              <tbody>{previa.linhas.slice(0, 40).map((l, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-2 py-1 font-mono">{l.os || '—'}</td>
                  <td className="px-2 py-1">{l.cliente}</td>
                  <td className="px-2 py-1" title={l.marca ? `no Sisloc: ${l.equipamentoOriginal}` : undefined}>{l.equipamento}</td>
                  <td className="px-2 py-1 font-mono">{l.patrimonio || '—'}</td>
                  <td className={'px-2 py-1' + (l.localNovo ? ' text-amber-700' : '')} title={l.localNovo ? 'local da OM (nenhuma localidade conhecida casou)' : `da OM: ${l.localOriginal}`}>{l.local || '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {previa.linhas.length > 40 && <div className="mt-1 text-slate-400">…e mais {previa.linhas.length - 40}.</div>}
        </div>
      )}
    </Modal>
  )
}

