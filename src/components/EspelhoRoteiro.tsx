// Espelho do roteiro para impressão: cabeçalho com técnico/veículo/data, paradas numeradas em cards,
// equipamentos agrupados por tipo com patrimônios e OS em chips. Compacto: cabe em uma página mesmo com muitas demandas.
import type { Demanda, Tecnico } from '../lib/types'
import { agrupar, chaveParada, fmtData, fmtNum, ordenarParadas } from '../lib/format'
import { veiculosDoGrupo } from './GrupoTecnico'

const CSS = `
.esp{font-family:'Segoe UI',Inter,Arial,sans-serif;color:#0f172a;font-size:10.5px;line-height:1.25}
.esp-head{display:flex;justify-content:space-between;align-items:stretch;background:linear-gradient(135deg,#134e4a,#0f766e);color:#fff;border-radius:10px;padding:10px 14px;margin-bottom:8px;break-inside:avoid}
.esp-head img{height:22px;margin-bottom:6px}
.esp-tec{font-size:22px;font-weight:900;letter-spacing:.01em;line-height:1;text-transform:uppercase}
.esp-sub{font-size:11px;opacity:.95;margin-top:4px}
.esp-box{background:rgba(255,255,255,.14);border-radius:8px;padding:6px 12px;text-align:center;min-width:88px;display:flex;flex-direction:column;justify-content:center}
.esp-box .n{font-size:24px;font-weight:900;line-height:1}
.esp-box .l{font-size:9px;text-transform:uppercase;letter-spacing:.08em;opacity:.9}
.esp-box .s{font-size:9.5px;margin-top:3px;opacity:.95}
.esp-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.esp-grid.uma{grid-template-columns:1fr}
.esp-par{border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;break-inside:avoid;page-break-inside:avoid;background:#fff}
.esp-par-h{display:flex;align-items:center;gap:7px;padding:5px 8px;background:#f1f5f9;border-bottom:1px solid #e2e8f0}
.esp-num{width:20px;height:20px;border-radius:50%;background:#0f766e;color:#fff;font-weight:900;font-size:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.esp-loc{font-weight:800;font-size:11px;text-transform:uppercase;flex:1;min-width:0}
.esp-loc small{display:block;font-weight:500;color:#475569;text-transform:none;font-size:9.5px}
.esp-tag{font-size:8px;font-weight:800;padding:1px 6px;border-radius:4px;border:1px solid;white-space:nowrap}
.esp-tag.ok{color:#065f46;border-color:#6ee7b7;background:#d1fae5}.esp-tag.no{color:#991b1b;border-color:#fca5a5;background:#fee2e2}.esp-tag.lib{color:#1e40af;border-color:#93c5fd;background:#dbeafe}
.esp-itens{display:flex;flex-wrap:wrap;gap:5px;padding:6px}
.esp-eq{border:1px solid #e2e8f0;border-radius:6px;padding:4px 6px;background:#f8fafc;min-width:120px;flex:1 1 140px;break-inside:avoid}
.esp-eq-h{display:flex;align-items:center;gap:5px;font-weight:800;font-size:10px}
.esp-tipo{background:#1e293b;color:#fff;font-size:7.5px;font-weight:800;padding:1px 5px;border-radius:3px;letter-spacing:.04em;white-space:nowrap}
.esp-qtd{background:#fef3c7;color:#92400e;font-size:8px;font-weight:800;padding:1px 5px;border-radius:3px}
.esp-chips{display:flex;flex-wrap:wrap;gap:3px;margin-top:3px}
.esp-pat{font-family:ui-monospace,Menlo,monospace;font-size:8.5px;background:#fff;border:1px solid #cbd5e1;border-radius:3px;padding:0 4px}
.esp-os{font-size:8.5px;background:#dbeafe;color:#1e40af;border-radius:3px;padding:0 4px;font-weight:700}
.esp-chk{width:10px;height:10px;border:1.5px solid #64748b;border-radius:2px;display:inline-block;margin-left:auto;flex-shrink:0}
.esp-foot{margin-top:8px;display:flex;justify-content:space-between;font-size:9px;color:#475569;border-top:1px solid #e2e8f0;padding-top:5px}
.esp-ass{display:flex;gap:18px}
@media print{@page{margin:7mm} .esp-head{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`

export function EspelhoRoteiro({ tecnico, data, itens }: { tecnico: Tecnico | undefined; data: string; itens: Demanda[] }) {
  const ordenados = [...itens].sort(ordenarParadas)
  const paradas = Array.from(agrupar(ordenados, chaveParada).values())
  const veic = veiculosDoGrupo(itens).join(' / ')
  const sep = itens.filter(d => d.status_separacao === 'SEPARADO').length
  const compacto = paradas.length > 6 || itens.length > 14
  return (
    <div className="esp">
      <style>{CSS}</style>
      <div className="esp-head">
        <div>
          <img src="/logo-branca.png" alt="Grupo Nova Opção" />
          <div className="esp-tec">{tecnico?.nome ?? 'Sem técnico'}</div>
          <div className="esp-sub">🚗 {veic || 'veículo não informado'} &nbsp;·&nbsp; 📅 Roteiro {fmtData(data)}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="esp-box"><div className="n">{paradas.length}</div><div className="l">paradas</div><div className="s">{itens.length} itens · {sep} sep.</div></div>
        </div>
      </div>
      <div className={'esp-grid' + (compacto ? '' : ' uma')}>
        {paradas.map((its, i) => {
          const p0 = its[0]
          const porTipoEq = Array.from(agrupar(its, d => `${d.tipo}|${d.equipamento_nome}`).values())
          const naoSep = its.some(d => d.status_separacao !== 'SEPARADO' && ['ENTREGA', 'TROCA', 'RETORNO', 'RETORNO AO CLIENTE', 'LOCACAO'].includes(d.tipo))
          const liberado = its.every(d => d.status === 'AGUARDANDO_SAIDA' || d.status === 'EM_DESLOCAMENTO')
          return (
            <div key={i} className="esp-par">
              <div className="esp-par-h">
                <div className="esp-num">{p0.ordem_parada ? p0.ordem_parada / 10 : i + 1}</div>
                <div className="esp-loc">📍 {p0.local ?? '—'}<small>{p0.cliente_nome ?? '—'}</small></div>
                {naoSep ? <span className="esp-tag no">Não separado</span> : liberado ? <span className="esp-tag lib">Liberado</span> : <span className="esp-tag ok">Separado</span>}
                <span className="esp-chk" title="Executado" />
              </div>
              <div className="esp-itens">
                {porTipoEq.map((g, j) => {
                  const porQtd = g.every(d => !d.patrimonio)
                  const qtd = g.reduce((s, d) => s + (Number(d.quantidade) || 1), 0)
                  return (
                    <div key={j} className="esp-eq">
                      <div className="esp-eq-h"><span className="esp-tipo">{g[0].tipo}</span><span>{g[0].equipamento_nome}</span>{(porQtd || g.length > 1) && <span className="esp-qtd">{porQtd ? `${fmtNum(qtd)} ${g[0].unidade?.toLowerCase() ?? 'un'}` : `${g.length} un`}</span>}</div>
                      <div className="esp-chips">
                        {g.filter(d => d.patrimonio).map(d => <span key={d.id} className="esp-pat">{d.patrimonio}</span>)}
                        {Array.from(new Set(g.map(d => d.om).filter(Boolean))).map(om => <span key={om!} className="esp-os">OS {om}</span>)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <div className="esp-foot">
        <div className="esp-ass"><span>Saída ____:____</span><span>Retorno ____:____</span><span>Técnico ______________________</span><span>Expedição ______________________</span></div>
        <div>Grupo Nova Opção · gerado em {new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    </div>
  )
}
