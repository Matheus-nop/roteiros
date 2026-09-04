// Arquivo digital dos roteiros: como cada roteiro foi montado e o que aconteceu com
// cada item. É a única tela que não lê `demandas` — lê o retrato guardado no fechamento,
// porque o roteiro se desfaz depois de executado e não é reconstruível a partir do hoje.
import { Archive, CalendarDays, ChevronDown, Download, Printer, Search, Truck, User } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { usePrint } from '../components/Print'
import { FolhaArquivo } from '../components/FolhaArquivo'
import { Badge, Botao, Carregando, Input, Pagina, Select, Vazio, cx } from '../components/ui'
import { addDias, fmtData, fmtDataHora, hojeISO, normalizar } from '../lib/format'
import { DESFECHO_LABEL, DESFECHO_TONE, type RoteiroArquivado } from '../lib/arquivo'

export function Arquivo() {
  const { tecnicos } = useData()
  const { erro } = useToast()
  const { imprimir } = usePrint()
  const [lista, setLista] = useState<RoteiroArquivado[]>([])
  const [carregando, setCarregando] = useState(true)
  const [faltaTabela, setFaltaTabela] = useState(false)
  const [de, setDe] = useState(() => addDias(hojeISO(), -30))
  // Sem limite superior por padrão: o roteiro fechado para amanhã (o PCM adianta o
  // fechamento, ou o técnico conclui antes) ficaria escondido atrás de um 'até hoje'.
  const [ate, setAte] = useState('')
  const [tecnico, setTecnico] = useState('')
  const [busca, setBusca] = useState('')

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    db.select<RoteiroArquivado>('roteiros_arquivo', { order: [{ col: 'data', asc: false }], limit: 500 })
      .then(r => { if (vivo) { setLista(r); setFaltaTabela(false) } })
      // A migração 0003 pode não ter rodado ainda: a tela avisa em vez de estourar.
      .catch(e => { if (vivo) { setFaltaTabela(true); erro(e) } })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtrados = useMemo(() => {
    const b = normalizar(busca)
    return lista.filter(r =>
      (!de || r.data >= de) && (!ate || r.data <= ate) &&
      (!tecnico || r.tecnico_id === tecnico) &&
      (!b || normalizar([r.tecnico_nome, r.veiculo, ...r.paradas.flatMap(p => [p.cliente, p.local, ...p.itens.map(i => `${i.equipamento} ${i.patrimonio} ${i.om}`)])].join(' ')).includes(b)))
  }, [lista, de, ate, tecnico, busca])

  const somas = useMemo(() => filtrados.reduce((a, r) => ({
    roteiros: a.roteiros + 1, total: a.total + r.total, concluidos: a.concluidos + r.concluidos, reagendados: a.reagendados + r.reagendados,
  }), { roteiros: 0, total: 0, concluidos: 0, reagendados: 0 }), [filtrados])

  const baixarCSV = () => {
    const linhas = [['data', 'tecnico', 'veiculo', 'parada', 'cliente', 'local', 'tipo', 'equipamento', 'patrimonio', 'os', 'desfecho', 'reagendado_para'].join(';')]
    for (const r of filtrados) for (const p of r.paradas) for (const i of p.itens) {
      linhas.push([r.data, r.tecnico_nome, r.veiculo ?? '', p.ordem, p.cliente ?? '', p.local ?? '', i.tipo, i.equipamento ?? '', i.patrimonio ?? '', i.om ?? '', DESFECHO_LABEL[i.desfecho], i.reagendado_para ?? '']
        .map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    }
    const url = URL.createObjectURL(new Blob(['﻿' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `roteiros-${de}-a-${ate}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Pagina titulo="Arquivo de roteiros" subtitulo="Como cada roteiro foi montado e o que aconteceu com cada item · o registro entra sozinho quando o roteiro do dia termina" acoes={
      filtrados.length > 0 ? <Botao onClick={baixarCSV}><Download size={14} />Baixar CSV</Botao> : undefined
    }>
      {faltaTabela && (
        <div className="mb-3 rounded-lg bg-amber-50 px-4 py-3 text-[13px] text-amber-900 ring-1 ring-amber-200">
          <b>A tabela do arquivo ainda não existe no banco.</b> Rode <code>supabase/migrations/0003_roteiros_arquivo.sql</code> no
          SQL Editor do Supabase. Até lá os roteiros continuam sendo executados normalmente — só não ficam arquivados.
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="relative min-w-[220px] flex-1"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar técnico, cliente, local, equipamento, patrimônio, OS…" className="pl-8" /></div>
        <Select value={tecnico} onChange={e => setTecnico(e.target.value)} className="w-44"><option value="">Todos os técnicos</option>{tecnicos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</Select>
        <Input type="date" value={de} onChange={e => setDe(e.target.value)} className="w-40" title="De" />
        <Input type="date" value={ate} onChange={e => setAte(e.target.value)} className="w-40" title="Até (em branco = sem limite)" />
      </div>

      {filtrados.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-slate-50 px-4 py-2.5 text-[12.5px] ring-1 ring-slate-200">
          <span className="font-bold text-slate-800">{somas.roteiros} roteiro(s) arquivado(s)</span>
          <span className="text-slate-600">{somas.total} demanda(s)</span>
          <span className="font-semibold text-emerald-700">{somas.concluidos} concluída(s)</span>
          {somas.reagendados > 0 && <span className="font-semibold text-orange-700">{somas.reagendados} reagendada(s)</span>}
          <span className="text-slate-500">{somas.total ? Math.round((somas.concluidos / somas.total) * 100) : 0}% de execução no período</span>
        </div>
      )}

      {carregando && <Carregando texto="Abrindo o arquivo…" />}
      {!carregando && filtrados.length === 0 && !faltaTabela && (
        <Vazio titulo="Nenhum roteiro arquivado no período" texto="Um roteiro entra aqui quando o último item dele é concluído, cancelado ou reagendado — ou quando o PCM fecha o dia." />
      )}

      <div className="space-y-2.5">
        {filtrados.map(r => <CardArquivo key={r.id} r={r} onImprimir={() => imprimir(<FolhaArquivo r={r} />)} />)}
      </div>
    </Pagina>
  )
}

function CardArquivo({ r, onImprimir }: { r: RoteiroArquivado; onImprimir(): void }) {
  const [aberto, setAberto] = useState(false)
  const pct = r.total ? Math.round((r.concluidos / r.total) * 100) : 0
  const completo = r.concluidos === r.total && r.total > 0

  return (
    <section className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <header className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', completo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
          <Archive size={17} />
        </span>
        <button onClick={() => setAberto(a => !a)} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className="text-[15px] font-bold text-slate-900"><User size={13} className="mr-1 inline text-slate-400" />{r.tecnico_nome}</span>
            <span className="text-[13px] text-slate-600"><CalendarDays size={12} className="mr-1 inline text-slate-400" />{fmtData(r.data)}</span>
            {r.veiculo && <span className="text-[12.5px] text-slate-500"><Truck size={12} className="mr-1 inline text-slate-400" />{r.veiculo}</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-slate-500">
            <span>{r.paradas.length} parada(s) · {r.total} item(ns)</span>
            <span className={cx('font-semibold', completo ? 'text-emerald-700' : 'text-slate-600')}>{r.concluidos} concluído(s)</span>
            {r.reagendados > 0 && <span className="font-semibold text-orange-700">{r.reagendados} reagendado(s)</span>}
            {r.cancelados > 0 && <span className="font-semibold text-red-700">{r.cancelados} cancelado(s)</span>}
            <span className="text-slate-400">· arquivado {fmtDataHora(r.arquivado_em)}{r.automatico ? ' (automático)' : ' (no fechamento)'}</span>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden w-24 sm:block">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={cx('h-full rounded-full', completo ? 'bg-emerald-500' : 'bg-acao-500')} style={{ width: `${pct}%` }} /></div>
            <div className="mt-0.5 text-right text-[10.5px] font-semibold tabular-nums text-slate-500">{pct}%</div>
          </div>
          <Botao tamanho="sm" variante="fantasma" title="Imprimir este roteiro como foi executado" onClick={onImprimir}><Printer size={14} /></Botao>
          <button onClick={() => setAberto(a => !a)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><ChevronDown size={17} className={cx('transition', !aberto && '-rotate-90')} /></button>
        </div>
      </header>

      {aberto && (
        <div className="border-t border-slate-100">
          {r.paradas.map((p, i) => (
            <div key={i} className="border-b border-slate-100 last:border-b-0">
              <div className="flex items-center gap-2 bg-slate-50/80 px-4 py-1.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-acao-500 text-[11px] font-bold text-white">{p.ordem}</span>
                <span className="text-[13px] font-bold text-slate-800">{p.cliente ?? '—'}</span>
                <span className="text-[12px] text-slate-500">📍 {p.local ?? '—'}</span>
              </div>
              <ul className="divide-y divide-slate-50">
                {p.itens.map((it, j) => (
                  <li key={j} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 pl-12 text-[12.5px]">
                    <Badge tone="bg-slate-100 text-slate-600 ring-slate-200">{it.tipo}</Badge>
                    <span className="font-medium text-slate-800">{it.equipamento ?? '—'}</span>
                    <span className={it.patrimonio ? 'font-mono text-[11.5px] text-slate-600' : 'text-[11.5px] text-slate-500'}>
                      {it.patrimonio ?? `Qtd: ${it.quantidade}${it.unidade ? ' ' + it.unidade.toLowerCase() : ''}`}
                    </span>
                    <span className="om text-[11.5px] text-slate-500">OS {it.om ?? '—'}</span>
                    <Badge tone={DESFECHO_TONE[it.desfecho]}>{DESFECHO_LABEL[it.desfecho]}</Badge>
                    {it.reagendado_para && <span className="text-[11.5px] text-orange-700">→ {fmtData(it.reagendado_para)}</span>}
                    {it.observacao && <span className="text-[11.5px] text-slate-400">· {it.observacao}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
