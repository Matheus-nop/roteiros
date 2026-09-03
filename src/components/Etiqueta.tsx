// Etiquetas de expedição/roteiro para impressão.
import type { Demanda, Tecnico } from '../lib/types'
import { codigo, fmtData, fmtPatrimonio } from '../lib/format'

export function Etiqueta({ d, prefixo, tecnico }: { d: Demanda; prefixo: 'EXP' | 'ROT'; tecnico?: Tecnico }) {
  return (
    <div style={{ width: '96mm', border: '1px solid #cbd5e1', borderRadius: 6, overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif', color: '#0f172a', breakInside: 'avoid', pageBreakInside: 'avoid', background: '#fff' }}>
      <div style={{ background: '#12365a', color: '#fff', padding: '7px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 20, height: 20, borderRadius: 4, background: '#fff', color: '#12365a', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>N</div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em' }}>GRUPO NOVA OPÇÃO</div>
        </div>
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 14, fontWeight: 700, letterSpacing: '0.05em' }}>{codigo(prefixo, d.numero)}</div>
      </div>
      <div style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b' }}>{d.patrimonio ? 'Patrimônio' : 'Quantidade'}</div>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{fmtPatrimonio(d).replace('Qtd: ', '')}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b' }}>OM / OS</div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'ui-monospace, monospace', lineHeight: 1.1 }}>{d.om ?? '—'}</div>
        </div>
      </div>
      <div style={{ padding: '6px 10px', fontSize: 12, fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>{d.equipamento_nome}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', fontSize: 10.5 }}>
        <Cel r="Cliente" v={d.cliente_nome} />
        <Cel r="Tipo" v={d.tipo} />
        <Cel r="Local" v={d.local} />
        <Cel r="Técnico / Veículo" v={[tecnico?.nome, d.veiculo].filter(Boolean).join(' · ') || '—'} />
      </div>
      <div style={{ background: '#f1f5f9', padding: '5px 10px', fontSize: 9.5, color: '#475569', display: 'flex', justifyContent: 'space-between' }}>
        <span>Data: {fmtData(d.data_planejada)}{d.ordem_parada ? ` · Parada ${d.ordem_parada / 10}` : ''}</span>
        <span>{d.separado_por ? `Separado por ${d.separado_por}` : 'Separação: ______'}</span>
      </div>
    </div>
  )
}

function Cel({ r, v }: { r: string; v: string | null | undefined }) {
  return (
    <div style={{ padding: '5px 10px', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 8.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b' }}>{r}</div>
      <div style={{ fontWeight: 600 }}>{v || '—'}</div>
    </div>
  )
}

export function FolhaEtiquetas({ itens, prefixo, tecnicoPorId }: { itens: Demanda[]; prefixo: 'EXP' | 'ROT'; tecnicoPorId(id: string | null): Tecnico | undefined }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6mm' }}>
      {itens.map(d => <Etiqueta key={d.id} d={d} prefixo={prefixo} tecnico={tecnicoPorId(d.tecnico_id)} />)}
    </div>
  )
}

/** Folha do roteiro (lista de paradas) para impressão. */
export function FolhaRoteiro({ tecnico, data, itens }: { tecnico: Tecnico | undefined; data: string; itens: Demanda[] }) {
  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', color: '#0f172a', fontSize: 12 }}>
      <div style={{ background: '#12365a', color: '#fff', padding: '10px 14px', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: '0.1em', fontWeight: 700 }}>GRUPO NOVA OPÇÃO · ROTEIRO DO DIA</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{tecnico?.nome ?? 'Sem técnico'} · {fmtData(data)}</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 11 }}>
          <div>Veículo: <b>{itens.find(i => i.veiculo)?.veiculo ?? '—'}</b></div>
          <div>{itens.length} item(ns)</div>
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            {['#', 'Código', 'Cliente / Local', 'Tipo', 'Equipamento', 'Pat. / Qtd', 'OM', 'Sep.', 'Exec.'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '6px 6px', borderBottom: '1px solid #cbd5e1', fontSize: 10, textTransform: 'uppercase', color: '#475569' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {itens.map(d => (
            <tr key={d.id}>
              <td style={{ padding: '6px', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>{d.ordem_parada ? d.ordem_parada / 10 : '—'}</td>
              <td style={{ padding: '6px', borderBottom: '1px solid #e2e8f0', fontFamily: 'ui-monospace, monospace' }}>{codigo('ROT', d.numero)}</td>
              <td style={{ padding: '6px', borderBottom: '1px solid #e2e8f0' }}><b>{d.cliente_nome}</b><br /><span style={{ color: '#475569' }}>{d.local}</span></td>
              <td style={{ padding: '6px', borderBottom: '1px solid #e2e8f0' }}>{d.tipo}</td>
              <td style={{ padding: '6px', borderBottom: '1px solid #e2e8f0' }}>{d.equipamento_nome}</td>
              <td style={{ padding: '6px', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>{fmtPatrimonio(d)}</td>
              <td style={{ padding: '6px', borderBottom: '1px solid #e2e8f0', fontFamily: 'ui-monospace, monospace' }}>{d.om ?? '—'}</td>
              <td style={{ padding: '6px', borderBottom: '1px solid #e2e8f0' }}>{d.status_separacao === 'SEPARADO' ? '✓' : '☐'}</td>
              <td style={{ padding: '6px', borderBottom: '1px solid #e2e8f0' }}>☐</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 18, display: 'flex', gap: 40, fontSize: 11, color: '#475569' }}>
        <div>Saída: ____:____ &nbsp; Retorno: ____:____</div>
        <div>Assinatura técnico: ______________________</div>
        <div>Expedição: ______________________</div>
      </div>
    </div>
  )
}
