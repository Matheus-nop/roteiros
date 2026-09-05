// Etiquetas no padrão do sistema anterior: topo escuro com logo + número, faixa do responsável,
// bloco do equipamento com patrimônio em destaque, grade cliente/tipo/OS/local e rodapé.
// Modos: A4 (400px), térmica 58mm (52mm) e térmica 80mm (74mm).
import type { Demanda, Tecnico, EtiquetaAvulsa } from '../lib/types'
import { agrupar, chaveParada, codigo, fmtData, fmtNum, hojeISO, normalizar, ordenarParadas } from '../lib/format'

export type ModoImpressora = 'normal' | '58' | '80'
export type TipoEtiqueta = 'ROTEIRO' | 'EXPEDICAO' | 'AVULSA'

export interface DadosEtiqueta {
  numero: string; tecnico: string | null; veiculo: string | null; cliente: string | null; local: string | null
  tipo: string | null; equipamento: string | null; patrimonio: string | null; quantidade?: number | null; os: string | null
  data: string | null; observacao?: string | null
}

export function dadosDeDemanda(d: Demanda, tipo: TipoEtiqueta, tecnico?: Tecnico): DadosEtiqueta {
  return {
    numero: codigo(tipo === 'ROTEIRO' ? 'ROT' : 'EXP', d.numero), tecnico: tecnico?.nome ?? null, veiculo: d.veiculo,
    cliente: d.cliente_nome, local: d.local, tipo: d.tipo, equipamento: d.equipamento_nome, patrimonio: d.patrimonio,
    quantidade: d.quantidade, os: d.om, data: d.data_planejada, observacao: null,
  }
}
export function dadosDeAvulsa(a: EtiquetaAvulsa): DadosEtiqueta {
  return { numero: `AV-${String(a.numero ?? 0).padStart(3, '0')}`, tecnico: a.tecnico, veiculo: a.veiculo, cliente: a.cliente, local: a.local, tipo: a.tipo, equipamento: a.equipamento, patrimonio: a.patrimonio, os: a.os, data: hojeISO(), observacao: a.observacao }
}

const PALETA = {
  ROTEIRO: { topo1: '#0f766e', topo2: '#134e4a', acento: '#0f766e', faixa: '#f0fdfa', faixaBorda: '#99f6e4', escuro: '#134e4a', rotulo: 'Etiqueta de Roteiro' },
  EXPEDICAO: { topo1: '#334155', topo2: '#1e293b', acento: '#b45309', faixa: '#fef3c7', faixaBorda: '#fde68a', escuro: '#1e293b', rotulo: 'Etiqueta de Expedição' },
  AVULSA: { topo1: '#334155', topo2: '#1e293b', acento: '#b45309', faixa: '#fef3c7', faixaBorda: '#fde68a', escuro: '#1e293b', rotulo: 'Etiqueta Avulsa' },
}

export function estilosEtiqueta(modo: ModoImpressora): string {
  const is58 = modo === '58', is80 = modo === '80', t = is58 || is80
  const W = is58 ? '52mm' : is80 ? '74mm' : '400px'
  const f = (a: string, b: string, c: string) => (is58 ? a : is80 ? b : c)
  return `
  .et-folha{display:flex;flex-wrap:wrap;gap:${t ? '0' : '12px'};padding:${t ? '0' : '6px'};font-family:'Segoe UI',Inter,Arial,sans-serif}
  .et{width:${W};border-radius:${t ? '0' : '14px'};overflow:hidden;page-break-inside:avoid;break-inside:avoid;background:#fff;${t ? 'border-bottom:2px dashed #000;padding-bottom:2mm;margin-bottom:2mm' : 'box-shadow:0 4px 16px rgba(0,0,0,.14);border:1px solid #e2e8f0'}}
  .et-head{color:${t ? '#000' : '#fff'};padding:${t ? '2mm 0' : '14px 16px'};display:flex;justify-content:space-between;align-items:center;${t ? 'border-bottom:1px solid #000;background:#fff' : ''}}
  .et-logo{height:${t ? '7mm' : '28px'}}
  .et-badge{text-align:right}
  .et-badge .lbl{font-size:${f('6pt', '7pt', '10px')};font-weight:700;letter-spacing:.08em;opacity:.9;text-transform:uppercase}
  .et-badge .num{font-size:${f('13pt', '15pt', '26px')};font-weight:900;line-height:1}
  .et-tec{padding:${t ? '2mm 0' : '11px 16px'};${t ? 'border-bottom:1px dashed #000;background:#fff;color:#000' : ''}}
  .et-tec-lbl{font-size:${f('6pt', '7pt', '10px')};letter-spacing:.1em;text-transform:uppercase;font-weight:700}
  .et-tec-nome{font-size:${f('13pt', '15pt', '22px')};font-weight:900;line-height:1.05;text-transform:uppercase;margin-top:2px}
  .et-tec-vei{font-size:${f('8pt', '9pt', '13px')};font-weight:600;margin-top:3px;opacity:.9}
  .et-eq{text-align:center;padding:${t ? '2mm 0' : '18px 14px'};${t ? 'border-bottom:1px dashed #000' : 'border-bottom:1px solid #e2e8f0'}}
  .et-eq-lbl{font-size:${f('6pt', '7pt', '10px')};color:#94a3b8;letter-spacing:.1em;text-transform:uppercase;font-weight:700}
  .et-eq-nome{font-size:${f('11pt', '12pt', '18px')};font-weight:800;line-height:1.15;margin:3px 0}
  .et-eq-pat{font-size:${f('15pt', '18pt', '32px')};font-weight:900;letter-spacing:.02em;line-height:1}
  .et-eq-patlbl{font-size:${f('6pt', '7pt', '10px')};color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin-top:2px}
  .et-grid{display:grid;grid-template-columns:1fr 1fr}
  .et-cel{padding:${t ? '1.5mm 0' : '10px 14px'};${t ? '' : 'border-top:1px solid #f1f5f9'}}
  .et-cel:nth-child(even){${t ? '' : 'border-left:1px solid #f1f5f9'}}
  .et-cel .k{font-size:${f('5.5pt', '6.5pt', '9px')};color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;font-weight:700}
  .et-cel .v{font-size:${f('8pt', '9pt', '13px')};color:#1e293b;font-weight:700;margin-top:1px;word-break:break-word}
  .et-tipo{display:inline-block;color:#fff;padding:2px 9px;border-radius:5px;font-size:${f('7pt', '8pt', '11px')};font-weight:800;${t ? 'background:#000' : ''}}
  .et-obs{padding:${t ? '1.5mm 0' : '8px 14px'};font-size:${f('7pt', '8pt', '11px')};color:#b45309;background:#fffbeb;font-weight:600}
  .et-foot{padding:${t ? '2mm 0' : '9px 14px'};display:flex;justify-content:space-between;align-items:center;font-size:${f('6pt', '7pt', '10px')};color:#64748b;${t ? 'border-top:1px dashed #000;background:#fff' : 'background:#f8fafc'}}
  .et-foot strong{font-weight:800}
  .et-selo{display:inline-block;color:#fff;font-size:${f('6pt', '7pt', '9px')};font-weight:800;padding:2px 8px;border-radius:4px;letter-spacing:.05em;${t ? 'background:#000' : ''}}
  @media print{ @page{margin:${t ? '2mm' : '8mm'}} .et-folha{padding:0} .et{margin:0 ${t ? '0' : '4px'} ${t ? '0' : '8px'} 0;box-shadow:none} }
  `
}

export function Etiqueta({ dados, tipo, modo = 'normal', empresa = 'GRUPO NOVA OPÇÃO' }: { dados: DadosEtiqueta; tipo: TipoEtiqueta; modo?: ModoImpressora; empresa?: string }) {
  const p = PALETA[tipo]; const t = modo !== 'normal'
  const porQtd = !dados.patrimonio || !dados.patrimonio.trim()
  return (
    <div className="et">
      <div className="et-head" style={t ? undefined : { background: `linear-gradient(135deg, ${p.topo1}, ${p.topo2})`, borderBottom: `3px solid ${p.acento}` }}>
        <img className="et-logo" src={t ? '/logo.png' : '/logo-branca.png'} alt="Grupo Nova Opção" />
        <div className="et-badge"><div className="lbl">{p.rotulo}</div><div className="num">{dados.numero}</div></div>
      </div>
      {(dados.tecnico || dados.veiculo) && (
        <div className="et-tec" style={t ? undefined : { background: p.faixa, borderBottom: `1px solid ${p.faixaBorda}`, color: p.escuro }}>
          <div className="et-tec-lbl" style={t ? undefined : { color: p.acento }}>👷 Técnico responsável</div>
          <div className="et-tec-nome">{dados.tecnico ?? '—'}</div>
          {dados.veiculo && <div className="et-tec-vei">🚗 Veículo: {dados.veiculo}</div>}
        </div>
      )}
      <div className="et-eq">
        <div className="et-eq-lbl">Equipamento</div>
        <div className="et-eq-nome" style={{ color: p.escuro }}>{dados.equipamento ?? '—'}</div>
        <div className="et-eq-pat" style={t ? undefined : { color: p.acento }}>{porQtd ? fmtNum(dados.quantidade ?? 1) : dados.patrimonio}</div>
        <div className="et-eq-patlbl">{porQtd ? 'Quantidade' : 'Patrimônio'}</div>
      </div>
      <div className="et-grid">
        <div className="et-cel"><div className="k">Cliente</div><div className="v">{dados.cliente ?? '—'}</div></div>
        <div className="et-cel"><div className="k">Tipo</div><div className="v"><span className="et-tipo" style={t ? undefined : { background: p.acento }}>{dados.tipo ?? '—'}</span></div></div>
        <div className="et-cel"><div className="k">OS</div><div className="v">{dados.os ?? '—'}</div></div>
        <div className="et-cel"><div className="k">Local</div><div className="v">📍 {dados.local ?? '—'}</div></div>
      </div>
      {dados.observacao && <div className="et-obs">⚠ {dados.observacao}</div>}
      <div className="et-foot">
        {tipo === 'AVULSA' ? <span className="et-selo" style={t ? undefined : { background: p.acento }}>✏ AVULSA</span> : <span>📅 <strong style={{ color: p.escuro }}>{fmtData(dados.data)}</strong></span>}
        <span>{tipo === 'AVULSA' ? <>📅 <strong style={{ color: p.escuro }}>{fmtData(dados.data)}</strong> · </> : null}{empresa}</span>
      </div>
    </div>
  )
}

export function FolhaEtiquetas({ itens, tipo, modo = 'normal', tecnicoPorId }: { itens: Demanda[]; tipo: TipoEtiqueta; modo?: ModoImpressora; tecnicoPorId(id: string | null): Tecnico | undefined }) {
  return (
    <>
      <style>{estilosEtiqueta(modo)}</style>
      <div className="et-folha">{itens.map(d => <Etiqueta key={d.id} dados={dadosDeDemanda(d, tipo, tecnicoPorId(d.tecnico_id))} tipo={tipo} modo={modo} />)}</div>
    </>
  )
}

export function FolhaAvulsa({ etiquetas, modo = 'normal' }: { etiquetas: EtiquetaAvulsa[]; modo?: ModoImpressora }) {
  return (
    <>
      <style>{estilosEtiqueta(modo)}</style>
      <div className="et-folha">{etiquetas.map((a, i) => <Etiqueta key={i} dados={dadosDeAvulsa(a)} tipo="AVULSA" modo={modo} />)}</div>
    </>
  )
}

/** Folha do roteiro (lista de paradas) para impressão. */
export function FolhaRoteiro({ tecnico, data, itens }: { tecnico: Tecnico | undefined; data: string; itens: Demanda[] }) {
  // A folha conta PARADAS, não itens: três equipamentos no mesmo endereço são a parada 1,
  // e o próximo cliente é a parada 2 — não a 4. Por isso o número sai do agrupamento, e
  // nunca de `ordem_parada / 10`, que numera item (ver lib/format.ts).
  const ordenados = [...itens].sort(ordenarParadas)
  const paradas = Array.from(agrupar(ordenados, chaveParada).values())
  return (
    <div style={{ fontFamily: 'Inter, Segoe UI, system-ui, sans-serif', color: '#0f172a', fontSize: 12 }}>
      <div style={{ background: 'linear-gradient(135deg,#0f766e,#134e4a)', color: '#fff', padding: '10px 14px', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src="/logo-branca.png" alt="" style={{ height: 26 }} />
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.1em', fontWeight: 700, opacity: .9 }}>ROTEIRO DO DIA</div>
            <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{tecnico?.nome ?? 'Sem técnico'} · {fmtData(data)}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 11 }}>
          <div>Veículo: <b>{itens.find(i => i.veiculo)?.veiculo ?? '—'}</b></div>
          <div>{paradas.length} parada(s) · {itens.length} item(ns)</div>
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            {['Código', 'Tipo', 'Equipamento', 'Pat. / Qtd', 'OS', 'Sep.', 'Exec.'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '6px 6px', borderBottom: '1px solid #cbd5e1', fontSize: 10, textTransform: 'uppercase', color: '#475569' }}>{h}</th>
            ))}
          </tr>
        </thead>
        {paradas.map((its, i) => (
          <tbody key={chaveParada(its[0])} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
            <tr>
              <td colSpan={7} style={{ padding: '8px 6px 4px', borderBottom: '1px solid #cbd5e1' }}>
                <span style={{ display: 'inline-block', minWidth: 20, height: 20, borderRadius: 10, background: '#0f766e', color: '#fff', fontWeight: 800, fontSize: 11, textAlign: 'center', lineHeight: '20px', padding: '0 6px', marginRight: 8 }}>{i + 1}</span>
                <b style={{ fontSize: 13 }}>{its[0].cliente_nome ?? '—'}</b>
                <span style={{ color: '#475569' }}> · {its[0].local ?? '—'}</span>
                <span style={{ color: '#94a3b8' }}> · {its.length} item(ns)</span>
              </td>
            </tr>
            {its.map(d => (
              <tr key={d.id}>
                <td style={{ padding: '6px', borderBottom: '1px solid #e2e8f0', fontFamily: 'ui-monospace, monospace' }}>{codigo('ROT', d.numero)}</td>
                <td style={{ padding: '6px', borderBottom: '1px solid #e2e8f0' }}>{d.tipo}</td>
                <td style={{ padding: '6px', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>{d.equipamento_nome ?? '—'}</td>
                <td style={{ padding: '6px', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>{d.patrimonio ?? `Qtd: ${fmtNum(d.quantidade)}`}</td>
                <td style={{ padding: '6px', borderBottom: '1px solid #e2e8f0', fontFamily: 'ui-monospace, monospace' }}>{d.om ?? '—'}</td>
                <td style={{ padding: '6px', borderBottom: '1px solid #e2e8f0' }}>{d.status_separacao === 'SEPARADO' ? '✓' : '☐'}</td>
                <td style={{ padding: '6px', borderBottom: '1px solid #e2e8f0' }}>☐</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}

// ----------------------------------------------------------------------------------
// Folha de PRÉ-CARGA — o papel da expedição, não o do técnico.
//
// Até aqui a pré-carga imprimia a mesma folha do roteiro, e por isso não servia: o
// roteiro é uma lista de PARADAS, na ordem da rua; a separação é uma volta pelo GALPÃO,
// e quem separa procura equipamento e patrimônio, não cliente. Então aqui a lista
// principal é agrupada por equipamento, com a caixa de conferência na frente de cada
// linha e o patrimônio em corpo grande — é o que a pessoa compara com a plaqueta da peça.
//
// O destino (parada, cliente) fica à direita de cada linha, e no fim vem um resumo por
// parada: é como a carga entra no veículo — a primeira parada por último, à mão.
//
// Sem campo de assinatura de propósito: quem separou e a que horas o app já registra,
// e campo em branco no papel vira a versão que ninguém confere com o sistema.
// ----------------------------------------------------------------------------------
const bordaCel = '1px solid #e2e8f0'
const cel: React.CSSProperties = { padding: '7px 6px', borderBottom: bordaCel, verticalAlign: 'top' }

/** Quantidade como a expedição conta: peça com patrimônio é 1; a granel, o número e a unidade. */
function volume(d: Demanda): { n: string; un: string } {
  if (d.patrimonio) return { n: '1', un: 'peça' }
  return { n: fmtNum(d.quantidade), un: (d.unidade ?? '').toLowerCase() }
}

export function FolhaPreCarga({ tecnico, data, itens }: { tecnico: Tecnico | undefined; data: string; itens: Demanda[] }) {
  const ordenados = [...itens].sort(ordenarParadas)
  const paradas = Array.from(agrupar(ordenados, chaveParada).values())
  const posicaoDaParada = new Map<string, number>()
  paradas.forEach((its, i) => posicaoDaParada.set(chaveParada(its[0]), i + 1))

  // Agrupado por equipamento: a volta pelo galpão é por peça, não por cliente.
  const porEquipamento = Array.from(agrupar(ordenados, d => normalizar(d.equipamento_nome) || 'SEM EQUIPAMENTO').entries())
    .sort(([a], [b]) => a.localeCompare(b))

  const comPatrimonio = ordenados.filter(d => d.patrimonio).length
  const aGranel = ordenados.length - comPatrimonio
  const separados = ordenados.filter(d => d.status_separacao === 'SEPARADO').length
  const veiculo = ordenados.find(i => i.veiculo)?.veiculo

  return (
    <div style={{ fontFamily: 'Inter, Segoe UI, system-ui, sans-serif', color: '#0f172a', fontSize: 12 }}>
      <div style={{ border: '2px solid #0f172a', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src="/logo.png" alt="" style={{ height: 26 }} />
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.14em', fontWeight: 800, color: '#b45309' }}>PRÉ-CARGA · SEPARAÇÃO</div>
            <div style={{ fontSize: 19, fontWeight: 800, marginTop: 1 }}>{tecnico?.nome ?? 'Sem técnico'}</div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>{veiculo ? `Veículo ${veiculo}` : 'Sem veículo definido'} · {paradas.length} parada(s)</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{fmtData(data)}</div>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, marginTop: 4 }}>{ordenados.length}</div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#475569' }}>itens a separar</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 18, fontSize: 11, color: '#475569', margin: '8px 2px 12px' }}>
        <span><b style={{ color: '#0f172a' }}>{comPatrimonio}</b> com patrimônio</span>
        <span><b style={{ color: '#0f172a' }}>{aGranel}</b> por quantidade</span>
        {separados > 0 && <span style={{ color: '#047857' }}><b>{separados}</b> já separado(s) no sistema</span>}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            {['✓', 'Qtd', 'Equipamento / Patrimônio', 'Vai para', 'Tipo', 'OS'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '6px', borderBottom: '1px solid #94a3b8', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: '#475569' }}>{h}</th>
            ))}
          </tr>
        </thead>
        {porEquipamento.map(([chave, lista]) => (
          <tbody key={chave} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
            {lista.map(d => {
              const { n, un } = volume(d)
              const sep = d.status_separacao === 'SEPARADO'
              return (
                <tr key={d.id}>
                  <td style={{ ...cel, width: 26 }}>
                    <span style={{ display: 'inline-block', width: 15, height: 15, border: '2px solid #0f172a', borderRadius: 3, textAlign: 'center', lineHeight: '13px', fontSize: 12, fontWeight: 800 }}>{sep ? '✓' : ''}</span>
                  </td>
                  <td style={{ ...cel, width: 54, whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 800 }}>{n}</span>
                    {un && <span style={{ fontSize: 10, color: '#475569' }}> {un}</span>}
                  </td>
                  <td style={cel}>
                    {/* O nome vai em TODA linha, mesmo repetido dentro do grupo. Escrevê-lo só na
                        primeira linha economizava tinta e criava linha órfã: duas peças do mesmo
                        equipamento, e a segunda saía com patrimônio e sem nome — quem separa lê
                        linha a linha, não bloco. */}
                    <div style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase' }}>{d.equipamento_nome ?? '— sem equipamento no cadastro da demanda —'}</div>
                    <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: d.patrimonio ? 14 : 11, fontWeight: d.patrimonio ? 700 : 400, color: d.patrimonio ? '#0f172a' : '#64748b' }}>
                      {d.patrimonio ?? 'sem patrimônio — conferir na quantidade'}
                    </div>
                  </td>
                  <td style={{ ...cel, width: '38%' }}>
                    <b>{posicaoDaParada.get(chaveParada(d))}ª parada · {d.cliente_nome ?? '—'}</b>
                    <div style={{ color: '#475569' }}>{d.local ?? '—'}</div>
                  </td>
                  <td style={{ ...cel, whiteSpace: 'nowrap', fontSize: 11 }}>{d.tipo}</td>
                  <td style={{ ...cel, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{d.om ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        ))}
      </table>

      {/* A carga entra no veículo na ordem inversa da rua: a primeira parada é a última a subir. */}
      <div style={{ marginTop: 16, pageBreakInside: 'avoid', breakInside: 'avoid' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#475569', marginBottom: 6 }}>
          Ordem de carregamento — a 1ª parada sobe por último
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[...paradas].reverse().map((its, i) => (
            <div key={i} style={{ border: bordaCel, borderRadius: 6, padding: '5px 9px', fontSize: 11, minWidth: 150 }}>
              <b>{posicaoDaParada.get(chaveParada(its[0]))}ª · {its[0].cliente_nome ?? '—'}</b>
              <div style={{ color: '#475569' }}>{its[0].local ?? '—'} · {its.length} item(ns)</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
