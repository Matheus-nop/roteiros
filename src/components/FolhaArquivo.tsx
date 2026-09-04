// Impressão de um roteiro arquivado: o roteiro como foi montado, com o desfecho de
// cada item. Diferente do espelho (que vai para a rota, com campos a preencher), esta
// folha é um comprovante do que aconteceu — por isso não tem caixa de marcação.
import { DESFECHO_LABEL, type RoteiroArquivado } from '../lib/arquivo'
import { fmtData, fmtDataHora, fmtNum } from '../lib/format'

const CSS = `
.arq{font-family:'Segoe UI',Inter,Arial,sans-serif;color:#0f172a;font-size:10.5px;line-height:1.3}
.arq-head{display:flex;justify-content:space-between;align-items:stretch;background:linear-gradient(135deg,#0d2a47,#1f4f7f);color:#fff;border-radius:10px;padding:10px 14px;margin-bottom:8px}
.arq-tec{font-size:21px;font-weight:900;text-transform:uppercase;line-height:1}
.arq-sub{font-size:11px;opacity:.95;margin-top:4px}
.arq-box{background:rgba(255,255,255,.14);border-radius:8px;padding:6px 12px;text-align:center;min-width:86px;display:flex;flex-direction:column;justify-content:center}
.arq-box .n{font-size:23px;font-weight:900;line-height:1}
.arq-box .l{font-size:9px;text-transform:uppercase;letter-spacing:.08em;opacity:.9}
.arq-par{border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;break-inside:avoid;page-break-inside:avoid;margin-bottom:6px}
.arq-par-h{display:flex;align-items:center;gap:7px;padding:5px 8px;background:#f1f5f9;border-bottom:1px solid #e2e8f0}
.arq-num{width:19px;height:19px;border-radius:50%;background:#1f4f7f;color:#fff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.arq-loc{font-weight:800;font-size:11.5px}
.arq-loc small{display:block;font-weight:600;font-size:10px;color:#475569}
.arq-t{width:100%;border-collapse:collapse}
.arq-t th{background:#f8fafc;text-align:left;font-size:8.5px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;padding:3px 8px;border-bottom:1px solid #e2e8f0}
.arq-t td{padding:3px 8px;border-bottom:1px solid #f1f5f9;font-size:10px}
.arq-pat{font-family:ui-monospace,monospace;font-weight:700}
.arq-d{font-weight:800;font-size:9px;text-transform:uppercase;letter-spacing:.03em;padding:1px 6px;border-radius:4px;white-space:nowrap}
.d-CONCLUIDO{background:#d1fae5;color:#065f46}
.d-REAGENDADO{background:#ffedd5;color:#9a3412}
.d-CANCELADO{background:#fee2e2;color:#991b1b}
.d-EM_ABERTO{background:#e2e8f0;color:#475569}
.arq-foot{margin-top:8px;padding-top:5px;border-top:1px solid #e2e8f0;font-size:9px;color:#64748b;display:flex;justify-content:space-between}
`

export function FolhaArquivo({ r }: { r: RoteiroArquivado }) {
  const pct = r.total ? Math.round((r.concluidos / r.total) * 100) : 0
  return (
    <div className="arq">
      <style>{CSS}</style>
      <div className="arq-head">
        <div>
          <img src="/logo-branca.png" alt="" style={{ height: 22, marginBottom: 6 }} />
          <div className="arq-tec">{r.tecnico_nome}</div>
          <div className="arq-sub">
            {fmtData(r.data)} · {r.veiculo ?? 'sem veículo'} · {r.paradas.length} parada(s)
          </div>
        </div>
        <div className="arq-box">
          <div className="n">{pct}%</div>
          <div className="l">executado</div>
          <div style={{ fontSize: 9.5, marginTop: 3, opacity: .95 }}>{r.concluidos} de {r.total}</div>
        </div>
      </div>

      {r.paradas.map((p, i) => (
        <div key={i} className="arq-par">
          <div className="arq-par-h">
            <div className="arq-num">{p.ordem}</div>
            <div className="arq-loc">📍 {p.local ?? '—'}<small>{p.cliente ?? '—'}</small></div>
          </div>
          <table className="arq-t">
            <thead><tr><th>Tipo</th><th>Equipamento</th><th>Patrimônio / qtd</th><th>OS</th><th>Desfecho</th></tr></thead>
            <tbody>
              {p.itens.map((it, j) => (
                <tr key={j}>
                  <td>{it.tipo}</td>
                  <td>{it.equipamento ?? '—'}</td>
                  <td className={it.patrimonio ? 'arq-pat' : ''}>{it.patrimonio ?? `${fmtNum(it.quantidade)} ${it.unidade?.toLowerCase() ?? 'un'}`}</td>
                  <td>{it.om ?? '—'}</td>
                  <td>
                    <span className={`arq-d d-${it.desfecho}`}>{DESFECHO_LABEL[it.desfecho]}</span>
                    {it.reagendado_para && <span style={{ marginLeft: 4, color: '#9a3412' }}>→ {fmtData(it.reagendado_para)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="arq-foot">
        <span>Arquivado em {fmtDataHora(r.arquivado_em)}{r.automatico ? ' (automático)' : ' (no fechamento do roteiro)'}</span>
        <span>Grupo Nova Opção · Roteiros</span>
      </div>
    </div>
  )
}
