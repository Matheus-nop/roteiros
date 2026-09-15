// Folha de presença para impressão: cabeçalho do treinamento e linhas para assinar.
//
// ESTA FOLHA É O DOCUMENTO. O treinamento acontece em obra, onde não há sinal e
// ninguém vai passar um tablet de mão em mão com luva de vaqueta. As pessoas
// assinam à caneta, a folha volta para o escritório, e alguém digita os nomes —
// é da digitação que saem os certificados.
//
// Por isso ela sai com DUAS partes: quem já está cadastrado na lista aparece
// impresso (só falta assinar), e abaixo vêm linhas em branco para quem apareceu
// sem avisar. Turma de treinamento gratuito sempre tem os dois.
import type { Participante, Presenca, Tecnico, Treinamento } from '../lib/types'
import { fmtData } from '../lib/format'
import { codigoTreinamento, fmtCarga, fmtCpf, fmtHora } from '../lib/treinamentos'

/** Linhas em branco além das já cadastradas. Uma folha meio vazia custa nada;
 *  uma folha que acaba no meio da turma faz alguém assinar no verso. */
const LINHAS_EM_BRANCO = 12

const CSS = `
.fp{font-family:'Segoe UI',Inter,Arial,sans-serif;color:#0f172a;font-size:11px;line-height:1.3}
.fp-head{display:flex;justify-content:space-between;align-items:stretch;background:linear-gradient(135deg,#0d2a47,#1f4f7f);color:#fff;border-radius:10px;padding:12px 16px;margin-bottom:10px}
.fp-head img{height:22px;margin-bottom:8px}
.fp-tema{font-size:19px;font-weight:900;line-height:1.1;text-transform:uppercase;max-width:520px}
.fp-sub{font-size:11.5px;opacity:.95;margin-top:5px}
.fp-cod{background:rgba(255,255,255,.14);border-radius:8px;padding:8px 12px;text-align:center;min-width:104px;display:flex;flex-direction:column;justify-content:center}
.fp-cod .n{font-size:17px;font-weight:900;letter-spacing:.02em;line-height:1}
.fp-cod .l{font-size:8.5px;text-transform:uppercase;letter-spacing:.08em;opacity:.9;margin-top:3px}
.fp-dados{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px}
.fp-dado{border:1px solid #e2e8f0;border-radius:7px;padding:5px 9px;background:#f8fafc}
.fp-dado .l{font-size:8.5px;text-transform:uppercase;letter-spacing:.07em;color:#64748b;font-weight:700}
.fp-dado .v{font-size:12px;font-weight:700;margin-top:2px}
.fp-titulo{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#1f4f7f;border-bottom:2px solid #1f4f7f;padding-bottom:3px;margin-bottom:6px}
table.fp-t{width:100%;border-collapse:collapse}
table.fp-t th{background:#eef3f8;border:1px solid #cbd5e1;padding:5px 7px;font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#12365a;text-align:left}
table.fp-t td{border:1px solid #cbd5e1;padding:0 7px;height:30px;font-size:11px;vertical-align:middle}
table.fp-t td.n{width:26px;text-align:center;color:#64748b;font-weight:700;font-size:10px}
table.fp-t td.nome{font-weight:600;text-transform:uppercase}
table.fp-t td.cpf{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;width:120px}
table.fp-t td.cargo{width:130px;font-size:10px;color:#475569;text-transform:uppercase}
table.fp-t td.ass{width:34%}
.fp-nota{margin-top:8px;font-size:9.5px;color:#64748b}
.fp-ass{margin-top:26px;display:flex;justify-content:space-between;gap:40px}
.fp-ass div{flex:1;border-top:1px solid #475569;padding-top:4px;font-size:10px;text-align:center;color:#334155}
.fp-foot{margin-top:10px;display:flex;justify-content:space-between;font-size:9px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:5px}
@media print{@page{margin:10mm;size:A4 portrait} .fp-head{-webkit-print-color-adjust:exact;print-color-adjust:exact} tr{break-inside:avoid}}
`

export function FolhaPresenca({ treinamento, instrutor, lista }: {
  treinamento: Treinamento
  instrutor: Tecnico | undefined
  lista: { presenca: Presenca; participante: Participante }[]
}) {
  const t = treinamento
  const brancos = Array.from({ length: LINHAS_EM_BRANCO }, (_, i) => lista.length + i + 1)
  return (
    <div className="fp">
      <style>{CSS}</style>

      <div className="fp-head">
        <div>
          <img src="/logo-branca.png" alt="Grupo Nova Opção" />
          <div className="fp-tema">{t.tema}</div>
          <div className="fp-sub">Lista de presença · {t.cliente_nome ?? 'Cliente não informado'}</div>
        </div>
        <div className="fp-cod">
          <div className="n">{codigoTreinamento(t.numero)}</div>
          <div className="l">Treinamento</div>
        </div>
      </div>

      <div className="fp-dados">
        <div className="fp-dado"><div className="l">Data</div><div className="v">{fmtData(t.data)}</div></div>
        <div className="fp-dado"><div className="l">Horário</div><div className="v">{fmtHora(t.hora_inicio)} às {fmtHora(t.hora_fim)}</div></div>
        <div className="fp-dado"><div className="l">Carga horária</div><div className="v">{fmtCarga(t.carga_horaria)}</div></div>
        <div className="fp-dado"><div className="l">Instrutor</div><div className="v">{instrutor?.nome ?? '—'}</div></div>
      </div>
      <div className="fp-dados" style={{ gridTemplateColumns: '1fr' }}>
        <div className="fp-dado"><div className="l">Local</div><div className="v">{t.local ?? '—'}</div></div>
      </div>

      <div className="fp-titulo">Participantes</div>
      <table className="fp-t">
        <thead>
          <tr><th style={{ width: 26 }}>#</th><th>Nome completo</th><th style={{ width: 120 }}>CPF</th><th style={{ width: 130 }}>Função</th><th style={{ width: '34%' }}>Assinatura</th></tr>
        </thead>
        <tbody>
          {lista.map((x, i) => (
            <tr key={x.presenca.id}>
              <td className="n">{i + 1}</td>
              <td className="nome">{x.participante.nome}</td>
              <td className="cpf">{x.participante.documento ? fmtCpf(x.participante.documento) : ''}</td>
              <td className="cargo">{x.participante.cargo ?? ''}</td>
              <td className="ass" />
            </tr>
          ))}
          {brancos.map(n => (
            <tr key={`b${n}`}>
              <td className="n">{n}</td><td /><td /><td /><td />
            </tr>
          ))}
        </tbody>
      </table>

      <div className="fp-nota">
        Quem assinar nas linhas em branco precisa ser digitado no sistema para que o certificado seja emitido.
      </div>

      <div className="fp-ass">
        <div>{instrutor?.nome ?? 'Instrutor'} — instrutor</div>
        <div>Responsável pelo cliente</div>
      </div>

      <div className="fp-foot">
        <span>Grupo Nova Opção · treinamento gratuito ao cliente</span>
        <span>{codigoTreinamento(t.numero)} · impresso em {new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  )
}
