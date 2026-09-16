// A capa que vai grampeada na frente da folha de presença.
//
// PARA QUEM ELA É
//
// Para o técnico dentro do carro, não para o arquivo. Ele já saiu do galpão e
// precisa saber três coisas, nessa ordem: onde eu entro, quem eu procuro, e que
// horas isso começa. Tudo o mais é contexto.
//
// Por isso o endereço e o contato são os dois blocos grandes da página, com
// corpo de texto que se lê de relance e a caneta na mão. O tema e o conteúdo
// vêm depois, menores: são o que ele vai FAZER, e isso ele já sabe — a dúvida
// que fazia ele ligar para o escritório era em que portão entrar.
//
// O que ela NÃO tem: linha para assinar, campo para preencher, nada que peça
// caneta. Quem assina é a folha de presença atrás dela. Capa que também é
// formulário vira a folha que a equipe assina por engano.
import type { Participante, Presenca, Tecnico, Treinamento } from '../lib/types'
import { fmtData, diaSemana } from '../lib/format'
import { codigoTreinamento, fmtCarga, fmtHora } from '../lib/treinamentos'

const CSS = `
.cp{font-family:'Segoe UI',Inter,Arial,sans-serif;color:#0f172a;font-size:12px;line-height:1.35;break-after:page;page-break-after:always}
.cp-head{display:flex;justify-content:space-between;align-items:stretch;background:linear-gradient(135deg,#0d2a47,#1f4f7f);color:#fff;border-radius:10px;padding:14px 18px;margin-bottom:12px}
.cp-head img{height:24px;margin-bottom:8px}
.cp-rot{font-size:10px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;opacity:.75}
.cp-tema{font-size:21px;font-weight:900;line-height:1.1;text-transform:uppercase;max-width:560px;margin-top:4px}
.cp-cod{background:rgba(255,255,255,.14);border-radius:8px;padding:9px 13px;text-align:center;min-width:112px;display:flex;flex-direction:column;justify-content:center}
.cp-cod .n{font-size:18px;font-weight:900;letter-spacing:.02em;line-height:1}
.cp-cod .l{font-size:8.5px;text-transform:uppercase;letter-spacing:.09em;opacity:.9;margin-top:3px}
.cp-quando{display:flex;gap:10px;margin-bottom:12px}
.cp-quando > div{flex:1;border:1px solid #cbd5e1;border-radius:9px;padding:9px 13px;background:#f8fafc}
.cp-quando .l{font-size:9px;text-transform:uppercase;letter-spacing:.09em;color:#64748b;font-weight:800}
.cp-quando .v{font-size:19px;font-weight:900;margin-top:2px;line-height:1.1}
.cp-quando .s{font-size:11px;color:#475569;margin-top:1px}
.cp-caixa{border:2px solid #1f4f7f;border-radius:10px;padding:11px 15px;margin-bottom:10px;break-inside:avoid}
.cp-caixa .l{font-size:9.5px;text-transform:uppercase;letter-spacing:.1em;color:#1f4f7f;font-weight:800;margin-bottom:3px}
.cp-caixa .g{font-size:20px;font-weight:800;line-height:1.25}
.cp-caixa .m{font-size:14px;font-weight:600;color:#334155;margin-top:3px}
.cp-caixa.vazia{border-color:#e2e8f0}
.cp-caixa.vazia .g{color:#94a3b8;font-weight:600;font-size:14px}
.cp-duas{display:flex;gap:10px}
.cp-duas > div{flex:1}
.cp-linha{display:flex;gap:10px;margin-bottom:10px}
.cp-campo{flex:1;border:1px solid #e2e8f0;border-radius:8px;padding:7px 12px;background:#f8fafc}
.cp-campo .l{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:800}
.cp-campo .v{font-size:13.5px;font-weight:700;margin-top:1px}
.cp-tit{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.09em;color:#1f4f7f;border-bottom:2px solid #1f4f7f;padding-bottom:3px;margin:14px 0 6px}
.cp-top{margin:0;padding-left:20px;list-style:disc outside}
.cp-top li{margin-bottom:3px;font-size:12.5px}
.cp-obs{border-left:4px solid #f59e0b;background:#fffbeb;border-radius:0 8px 8px 0;padding:8px 13px;font-size:12.5px;color:#78350f}
.cp-foot{margin-top:16px;display:flex;justify-content:space-between;font-size:9.5px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:6px}
@media print{@page{margin:10mm;size:A4 portrait} .cp-head{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`

/** "qua" → "quarta-feira"; sábado e domingo não levam "-feira". */
function porExtensoODia(iso: string): string {
  const d = diaSemana(iso)
  const nomes: Record<string, string> = {
    dom: 'domingo', seg: 'segunda-feira', ter: 'terça-feira', qua: 'quarta-feira',
    qui: 'quinta-feira', sex: 'sexta-feira', 'sáb': 'sábado',
  }
  return nomes[d] ?? d
}

export function CapaTreinamento({ treinamento, instrutor, lista }: {
  treinamento: Treinamento
  instrutor: Tecnico | undefined
  lista: { presenca: Presenca; participante: Participante }[]
}) {
  const t = treinamento
  const inscritos = lista.filter(x => x.presenca.presente).length
  return (
    <div className="cp">
      <style>{CSS}</style>

      <div className="cp-head">
        <div>
          <img src="/logo-branca.png" alt="Grupo Nova Opção" />
          <div className="cp-rot">Treinamento · ordem de serviço do instrutor</div>
          <div className="cp-tema">{t.tema}</div>
        </div>
        <div className="cp-cod">
          <div className="n">{codigoTreinamento(t.numero)}</div>
          <div className="l">Treinamento</div>
        </div>
      </div>

      {/* Quando — a primeira pergunta de quem pega o papel. */}
      <div className="cp-quando">
        <div>
          <div className="l">Data</div>
          <div className="v">{fmtData(t.data)}</div>
          <div className="s">{porExtensoODia(t.data)}</div>
        </div>
        <div>
          <div className="l">Horário</div>
          <div className="v">{fmtHora(t.hora_inicio)} às {fmtHora(t.hora_fim)}</div>
          <div className="s">carga horária de {fmtCarga(t.carga_horaria)}</div>
        </div>
      </div>

      {/* Onde entrar e quem procurar: os dois blocos que justificam a capa. */}
      <div className={`cp-caixa${t.endereco ? '' : ' vazia'}`}>
        <div className="l">Onde</div>
        <div className="g">{t.endereco ?? 'Endereço não informado — confirme com o escritório antes de sair'}</div>
        {(t.local || t.cliente_nome) && (
          <div className="m">{[t.cliente_nome, t.local].filter(Boolean).join(' · ')}</div>
        )}
      </div>

      <div className={`cp-caixa${t.contato_nome || t.contato_telefone ? '' : ' vazia'}`}>
        <div className="l">Procurar por</div>
        <div className="g">
          {t.contato_nome ?? (t.contato_telefone ? 'Contato não informado' : 'Contato não informado — procure a portaria')}
        </div>
        {t.contato_telefone && <div className="m">📞 {t.contato_telefone}</div>}
      </div>

      <div className="cp-linha">
        <div className="cp-campo">
          <div className="l">Instrutor</div>
          <div className="v">{instrutor?.nome ?? 'a definir'}</div>
        </div>
        <div className="cp-campo">
          <div className="l">Turma já inscrita</div>
          <div className="v">{inscritos === 0 ? 'ninguém digitado ainda' : `${inscritos} pessoa${inscritos > 1 ? 's' : ''}`}</div>
        </div>
      </div>

      {t.conteudo?.length > 0 && (
        <>
          <div className="cp-tit">O que será passado</div>
          <ul className="cp-top">
            {t.conteudo.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </>
      )}

      {t.observacao && (
        <>
          <div className="cp-tit">Observação</div>
          <div className="cp-obs">{t.observacao}</div>
        </>
      )}

      <div className="cp-foot">
        <span>A folha de presença vai na página seguinte — é ela que as pessoas assinam.</span>
        <span>{codigoTreinamento(t.numero)} · impresso em {new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  )
}
