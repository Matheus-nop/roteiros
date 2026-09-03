/**
 * Fase 6 — Migração: consolida os CSVs exportados do Google Sheets em um único
 * arquivo JSON de demandas (de-duplicado), pronto para importar no Supabase.
 *
 * Uso:
 *   1. Exporte cada aba como CSV para ./migracao/ (FILA_OPERACIONAL.csv, PLANEJAMENTO_PCM.csv, ...).
 *   2. npx tsx scripts/importar-planilha.ts ./migracao > demandas.json
 *   3. Revise demandas.json e importe:
 *      SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npx tsx scripts/importar-planilha.ts ./migracao --enviar
 *
 * Regras:
 *   - A OM é SEMPRE texto. Se numa aba a OM virou data (ex.: "2026-03-10", "10/03/2026"), busca
 *     a versão texto na FILA_OPERACIONAL pela chave equipamento+patrimônio+cliente.
 *   - Duplicatas (equipamento + patrimônio + OM + cliente) são consolidadas: vence a aba
 *     mais "avançada" no fluxo (histórico > roteiro > expedição > planejamento > fila).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

type Linha = Record<string, string>

const ABAS_STATUS: Record<string, string> = {
  FILA_OPERACIONAL: 'FILA',
  PLANEJAMENTO_PCM: 'AGUARDANDO_ROTEIRIZACAO',
  ROTEIRO_DIÁRIO: 'ROTEIRIZADO', ROTEIRO_DIARIO: 'ROTEIRIZADO', ROTEIRO_PARADAS: 'ROTEIRIZADO',
  PAINEL_EXPEDIÇÃO: 'ROTEIRIZADO', PAINEL_EXPEDICAO: 'ROTEIRIZADO', PRÉ_CARGA: 'ROTEIRIZADO', PRE_CARGA: 'ROTEIRIZADO',
  PRÉ_CARGA_FECHADA: 'AGUARDANDO_SAIDA', PRE_CARGA_FECHADA: 'AGUARDANDO_SAIDA',
  CONTROLE_EXECUÇÃO: 'EM_DESLOCAMENTO', CONTROLE_EXECUCAO: 'EM_DESLOCAMENTO',
  RETORNO_PENDÊNCIAS: 'AGUARDANDO_ROTEIRIZACAO', RETORNO_PENDENCIAS: 'AGUARDANDO_ROTEIRIZACAO',
  ESPELHO_PENDÊNCIAS: 'AGUARDANDO_ROTEIRIZACAO', ESPELHO_PENDENCIAS: 'AGUARDANDO_ROTEIRIZACAO',
  HISTÓRICO_PCM: 'FINALIZADO', HISTORICO_PCM: 'FINALIZADO', HISTÓRICO_ROTEIROS: 'FINALIZADO', HISTORICO_ROTEIROS: 'FINALIZADO',
  HISTÓRICO_EXPEDIÇÃO: 'FINALIZADO', HISTORICO_EXPEDICAO: 'FINALIZADO',
}
const PRIORIDADE = ['FINALIZADO', 'EM_DESLOCAMENTO', 'AGUARDANDO_SAIDA', 'ROTEIRIZADO', 'AGUARDANDO_ROTEIRIZACAO', 'FILA']

const norm = (s: string | undefined) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, "").trim().toUpperCase().replace(/\s+/g, ' ')
const col = (l: Linha, ...nomes: string[]) => { for (const k of Object.keys(l)) if (nomes.includes(norm(k))) return (l[k] ?? '').trim(); return '' }
const pareceData = (om: string) => /^\d{4}-\d{2}-\d{2}/.test(om) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(om) || /^\d{1,2}\/\d{1,2}$/.test(om)
const dataISO = (s: string) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s); if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null }

function parseCSV(txt: string): Linha[] {
  const linhas: string[][] = []; let cur: string[] = []; let campo = ''; let aspas = false
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i]
    if (aspas) { if (c === '"') { if (txt[i + 1] === '"') { campo += '"'; i++ } else aspas = false } else campo += c }
    else if (c === '"') aspas = true
    else if (c === ',' || c === ';' || c === '\t') { cur.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; cur.push(campo); linhas.push(cur); cur = []; campo = '' }
    else campo += c
  }
  if (campo || cur.length) { cur.push(campo); linhas.push(cur) }
  const [cab, ...resto] = linhas.filter(l => l.some(x => x.trim()))
  return resto.map(r => Object.fromEntries(cab.map((h, i) => [h, r[i] ?? ''])))
}

const dir = process.argv[2]
if (!dir) { console.error('Informe a pasta com os CSVs.'); process.exit(1) }
const enviar = process.argv.includes('--enviar')

type Dem = Record<string, unknown> & { _chave: string; _prio: number; om: string | null; equipamento_nome: string | null; patrimonio: string | null; cliente_nome: string | null }
const consolidado = new Map<string, Dem>()
const omTextoPorChave = new Map<string, string>()
let lidas = 0, omsCorrigidas = 0

const arquivos = readdirSync(dir).filter(f => f.toLowerCase().endsWith('.csv'))
// FILA primeiro: é a fonte confiável da OM em texto
arquivos.sort((a, b) => (a.startsWith('FILA') ? -1 : b.startsWith('FILA') ? 1 : 0))

for (const arq of arquivos) {
  const aba = arq.replace(/\.csv$/i, '')
  const status = ABAS_STATUS[aba] ?? ABAS_STATUS[norm(aba)] ?? 'FILA'
  const prio = PRIORIDADE.indexOf(status)
  for (const l of parseCSV(readFileSync(join(dir, arq), 'utf8'))) {
    lidas++
    const equipamento = norm(col(l, 'EQUIPAMENTO', 'EQUIP', 'DESCRICAO', 'ITEM')) || null
    const patrimonio = col(l, 'PATRIMONIO', 'PAT', 'TAG') || null
    const cliente = norm(col(l, 'CLIENTE', 'EMPRESA')) || null
    let om = col(l, 'OM', 'OS', 'OM/OS', 'N OM', 'ORDEM', 'CONTRATO')
    const chaveSemOm = [equipamento, norm(patrimonio ?? ''), cliente].join('|')
    if (aba.startsWith('FILA') && om && !pareceData(om)) omTextoPorChave.set(chaveSemOm, om)
    if (pareceData(om)) { const fix = omTextoPorChave.get(chaveSemOm); if (fix) { om = fix; omsCorrigidas++ } }
    if (!equipamento && !om) continue
    const tipoRaw = norm(col(l, 'TIPO', 'OPERACAO', 'MOVIMENTO'))
    const tipo = ['ENTREGA', 'TROCA', 'RETORNO', 'RETORNO AO CLIENTE', 'LOCACAO', 'MANUTENÇÃO', 'RETIRADA', 'DEVOLUÇÃO'].find(t => norm(t) === tipoRaw) ?? (tipoRaw.startsWith('LOCA') ? 'LOCACAO' : 'ENTREGA')
    const chave = [om, equipamento, norm(patrimonio ?? ''), cliente].join('|')
    const d: Dem = {
      _chave: chave, _prio: prio,
      om: om || null, equipamento_nome: equipamento, patrimonio, cliente_nome: cliente,
      local: norm(col(l, 'LOCAL', 'ENDERECO', 'OBRA', 'BAIRRO')) || null,
      tipo,
      quantidade: Number(col(l, 'QUANTIDADE', 'QTD', 'QTDE').replace(',', '.')) || 1,
      veiculo: col(l, 'VEICULO', 'CARRO') || null,
      _tecnico: col(l, 'TECNICO', 'TÉCNICO') || null,
      data_abertura: dataISO(col(l, 'DATA', 'DATA ABERTURA', 'ABERTURA')),
      data_planejada: dataISO(col(l, 'DATA PLANEJADA', 'DATA ROTEIRO', 'DATA EXECUCAO', 'DATA REAGENDADA')),
      status,
      status_separacao: /SEPARAD|SIM|✓|OK/.test(norm(col(l, 'SEPARADO', 'SEPARACAO', 'STATUS SEPARACAO'))) ? 'SEPARADO' : 'NAO_SEPARADO',
      separado_por: col(l, 'SEPARADO POR', 'EXPEDIDOR') || null,
      ordem_parada: Number(col(l, 'ORDEM', 'PARADA', 'ORDEM PARADA')) * 10 || null,
      observacao: col(l, 'OBS', 'OBSERVACAO') || null,
      origem: `MIGRACAO:${aba}`,
      herdado_de_pendencia: /PENDENCIA/.test(norm(aba)),
    }
    const atual = consolidado.get(chave)
    if (!atual || prio < atual._prio) consolidado.set(chave, d)
  }
}

const saida = Array.from(consolidado.values()).map(({ _chave, _prio, ...d }) => d)
console.error(`Linhas lidas: ${lidas} · Demandas consolidadas: ${saida.length} · OMs corrigidas (estavam como data): ${omsCorrigidas}`)

if (!enviar) {
  console.log(JSON.stringify(saida, null, 2))
} else {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) { console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_KEY (service role, só para migração).'); process.exit(1) }
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(url, key)
  const { data: tecs } = await sb.from('tecnicos').select('id,nome')
  const { data: clis } = await sb.from('clientes').select('id,nome,apelidos')
  const tecId = (n: string | null) => tecs?.find(t => norm(t.nome) === norm(n ?? ''))?.id ?? null
  const cliId = (n: string | null) => clis?.find(c => norm(c.nome) === norm(n ?? '') || (c.apelidos as string[]).some(a => norm(a) === norm(n ?? '')))?.id ?? null
  for (let i = 0; i < saida.length; i += 200) {
    const lote = saida.slice(i, i + 200).map(({ _tecnico, ...d }) => ({ ...d, tecnico_id: tecId(_tecnico as string | null), cliente_id: cliId(d.cliente_nome as string | null) }))
    const { error } = await sb.from('demandas').insert(lote)
    if (error) { console.error('Erro no lote', i, error.message); process.exit(1) }
    console.error(`Importadas ${Math.min(i + 200, saida.length)}/${saida.length}`)
  }
}
