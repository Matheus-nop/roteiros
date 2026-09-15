// Certificado de participação, para impressão — uma página A4 deitada por pessoa.
//
// O QUE ESTÁ IMPRESSO, E POR QUÊ
//
// Nome e CPF são o que identifica a pessoa, e foi o que se pediu: é o que o RH do
// cliente confere. O resto do papel (tema, carga horária, data, local, instrutor)
// não é enfeite nem escolha — sem isso a folha diz "fulano participou" e não diz
// de quê, por quanto tempo nem quando, e aí não serve para o RH do cliente.
// Nenhum desses campos é digitado aqui: todos já estão no treinamento, e a carga
// horária é coluna gerada no banco (0016), então o papel não tem como divergir
// do horário impresso ao lado dela.
//
// O CÓDIGO no rodapé (TRN-014) é o do treinamento, não o da pessoa: é por ele que
// se acha a turma no sistema quando alguém liga pedindo segunda via.
import type { Participante, Tecnico, Treinamento } from '../lib/types'
import { fmtData } from '../lib/format'
import { codigoTreinamento, fmtCarga, fmtCpf, fmtHora } from '../lib/treinamentos'

const CSS = `
.cert{font-family:'Segoe UI',Inter,Arial,sans-serif;color:#0f172a}
.cert-p{width:277mm;height:190mm;box-sizing:border-box;position:relative;padding:10mm;break-after:page;page-break-after:always}
.cert-p:last-child{break-after:auto;page-break-after:auto}
.cert-moldura{height:100%;box-sizing:border-box;border:2px solid #1f4f7f;border-radius:6px;padding:10mm 14mm;display:flex;flex-direction:column;align-items:center;text-align:center;position:relative;overflow:hidden}
.cert-moldura::before{content:'';position:absolute;inset:3.5mm;border:0.6mm solid #f59e0b;border-radius:3px;pointer-events:none}
.cert-logo{height:17mm;margin-bottom:3mm}
.cert-titulo{font-size:30px;font-weight:900;letter-spacing:.22em;color:#12365a;text-transform:uppercase;line-height:1}
.cert-selo{margin-top:2mm;font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#b45309}
.cert-texto{margin-top:7mm;font-size:13.5px;color:#334155}
.cert-nome{margin-top:3mm;font-size:32px;font-weight:900;text-transform:uppercase;color:#0d2a47;line-height:1.1;border-bottom:0.5mm solid #f59e0b;padding-bottom:2.5mm;min-width:150mm;max-width:100%}
.cert-cpf{margin-top:2.5mm;font-size:12px;font-family:ui-monospace,Menlo,monospace;color:#475569;letter-spacing:.04em}
.cert-corpo{margin-top:5mm;font-size:13.5px;line-height:1.6;color:#334155;max-width:215mm}
.cert-tema{font-weight:900;text-transform:uppercase;color:#12365a;font-size:16px}
.cert-dados{margin-top:auto;display:flex;gap:6mm;justify-content:center;width:100%}
.cert-dado{border-top:0.4mm solid #cbd5e1;padding-top:2mm;min-width:36mm}
.cert-dado .l{font-size:8px;text-transform:uppercase;letter-spacing:.11em;color:#64748b;font-weight:700}
.cert-dado .v{font-size:12.5px;font-weight:800;color:#0f172a;margin-top:0.8mm}
.cert-ass{margin-top:9mm;display:flex;justify-content:center;width:100%}
.cert-ass div{border-top:0.4mm solid #334155;padding-top:2mm;min-width:78mm;font-size:11px;color:#334155}
.cert-ass b{display:block;font-size:12.5px;color:#0f172a}
.cert-foot{margin-top:5mm;font-size:8.5px;color:#94a3b8;letter-spacing:.05em}
@media print{@page{size:A4 landscape;margin:0}
  .cert-moldura{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`

export function Certificados({ treinamento, instrutor, participantes }: {
  treinamento: Treinamento
  instrutor: Tecnico | undefined
  participantes: Participante[]
}) {
  const t = treinamento
  return (
    <div className="cert">
      <style>{CSS}</style>
      {participantes.map(p => (
        <section className="cert-p" key={p.id}>
          <div className="cert-moldura">
            <img className="cert-logo" src="/logo.png" alt="Grupo Nova Opção" />
            <div className="cert-titulo">Certificado</div>
            {/* Subtítulo fixo e genérico de propósito: o assunto do curso é o TEMA,
                logo abaixo, e um selo que dissesse "operação segura" sairia errado
                num treinamento de montagem de andaime. */}
            <div className="cert-selo">Participação em treinamento</div>

            <div className="cert-texto">Certificamos que</div>
            <div className="cert-nome">{p.nome}</div>
            {p.documento && <div className="cert-cpf">CPF {fmtCpf(p.documento)}</div>}

            <div className="cert-corpo">
              participou do treinamento<br />
              <span className="cert-tema">{t.tema}</span><br />
              {t.cliente_nome ? <>promovido pelo Grupo Nova Opção para {t.cliente_nome}</> : <>promovido pelo Grupo Nova Opção</>}
              {t.local ? <>, em {t.local}</> : null}.
            </div>

            <div className="cert-dados">
              <div className="cert-dado"><div className="l">Data</div><div className="v">{fmtData(t.data)}</div></div>
              <div className="cert-dado"><div className="l">Horário</div><div className="v">{fmtHora(t.hora_inicio)} às {fmtHora(t.hora_fim)}</div></div>
              <div className="cert-dado"><div className="l">Carga horária</div><div className="v">{fmtCarga(t.carga_horaria)}</div></div>
              <div className="cert-dado"><div className="l">Certificado</div><div className="v">{codigoTreinamento(t.numero)}</div></div>
            </div>

            <div className="cert-ass">
              <div><b>{instrutor?.nome ?? 'Grupo Nova Opção'}</b>Instrutor responsável</div>
            </div>

            <div className="cert-foot">
              GRUPO NOVA OPÇÃO · LOCAÇÃO, MANUTENÇÃO E VENDA DE EQUIPAMENTOS · {codigoTreinamento(t.numero)}
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}
