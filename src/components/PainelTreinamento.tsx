// O treinamento aberto: os dados, a turma, e os dois papéis que saem daqui.
//
// A ORDEM DA TELA É A ORDEM DO TRABALHO. Antes do treinamento, o botão que
// importa é "Folha de presença" — imprime e vai para a obra. Depois, digita-se
// quem assinou e sai o certificado. Por isso a lista vem antes dos botões de
// encerrar: é nela que se passa o tempo.
import { useMemo, useState } from 'react'
import {
  AlertTriangle, Award, CheckCircle2, FileSignature, MapPin, Pencil, Printer,
  RotateCcw, Trash2, UserPlus, X,
} from 'lucide-react'
import { useData } from '../hooks/useData'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { usePrint } from './Print'
import { Badge, Botao, Campo, Checkbox, Confirmar, Input, Modal, cx } from './ui'
import { CampoSugestao } from './CampoSugestao'
import { FolhaPresenca } from './FolhaPresenca'
import { Certificados } from './Certificado'
import type { Participante, Presenca, Treinamento } from '../lib/types'
import { fmtData, fmtDataHora, normalizar } from '../lib/format'
import {
  STATUS_TREINAMENTO_LABEL, STATUS_TREINAMENTO_TONE, codigoTreinamento, cpfValido,
  fmtCarga, fmtCpf, fmtHora, soDigitos,
} from '../lib/treinamentos'

type Nova = { nome: string; documento: string; cargo: string }
const vazia = (): Nova => ({ nome: '', documento: '', cargo: '' })

export function PainelTreinamento({ treinamento, onFechar, onEditar }: {
  treinamento: Treinamento
  onFechar(): void
  onEditar(t: Treinamento): void
}) {
  const { acoes, demandas, participantes, presencas, tecnicoPorId } = useData()
  const { pode } = useAuth()
  const { toast, erro } = useToast()
  const { imprimir } = usePrint()
  const t = treinamento
  const podeEditar = pode('treinamentos.editar')

  const [nova, setNova] = useState<Nova>(vazia())
  const [salvando, setSalvando] = useState(false)
  const [confirmar, setConfirmar] = useState<'cancelar' | 'excluir' | null>(null)

  const instrutor = tecnicoPorId(t.tecnico_id)
  const porId = useMemo(() => new Map(participantes.map(p => [p.id, p])), [participantes])

  /** A turma, na ordem em que foi digitada — a mesma da folha assinada. */
  const lista = useMemo(() => presencas
    .filter(p => p.treinamento_id === t.id)
    .map(p => ({ presenca: p, participante: porId.get(p.participante_id) }))
    .filter((x): x is { presenca: Presenca; participante: Participante } => !!x.participante)
    .sort((a, b) => (a.presenca.created_at ?? '').localeCompare(b.presenca.created_at ?? '')),
    [presencas, porId, t.id])

  const daTurma = lista.filter(x => x.presenca.presente)
  const jaConhecidos = useMemo(() => participantes.map(p => p.nome), [participantes])
  const demandaSumida = !t.demanda_id || (t.status === 'AGENDADO' && !demandas.some(d => d.id === t.demanda_id))

  // Digitar um nome que já existe no cadastro preenche CPF e função sozinho —
  // é o que faz o encarregado que volta ao terceiro treinamento não ser digitado
  // de novo, com o CPF de cabeça e uma chance a mais de errar um dígito.
  const casarCadastro = (nome: string) => {
    const achado = participantes.find(p => normalizar(p.nome) === normalizar(nome))
    setNova(n => ({
      nome,
      documento: achado?.documento ? fmtCpf(achado.documento) : n.documento,
      cargo: achado?.cargo ?? n.cargo,
    }))
  }

  const adicionar = async () => {
    setSalvando(true)
    try {
      const { participante } = await acoes.adicionarPresenca(
        t, { nome: nova.nome, documento: nova.documento || null, cargo: nova.cargo || null },
        participantes, lista.map(x => x.presenca))
      toast(`${participante.nome} entrou na lista.`)
      setNova(vazia())
    } catch (e) { erro(e) } finally { setSalvando(false) }
  }

  /**
   * Espera o modelo e a fonte chegarem antes de mandar imprimir.
   *
   * Sem isto o certificado sai errado na PRIMEIRA emissão de cada máquina, e só
   * nela: o modelo e a Montserrat ficam fora do pacote instalado (vite.config),
   * então na primeira vez eles vêm da rede — e a impressão dispara antes. O
   * resultado é uma folha branca com o texto numa fonte qualquer. Depois entram
   * no cache do navegador e ninguém mais reproduz o problema, que é justamente
   * o tipo de defeito que ninguém consegue explicar.
   */
  const prepararModelo = async () => {
    const fonte = (spec: string) => document.fonts?.load?.(spec) ?? Promise.resolve()
    const imagem = new Promise<void>(pronto => {
      const img = new Image()
      img.onload = img.onerror = () => pronto()
      img.src = '/certificado/modelo.png'
    })
    await Promise.all([
      fonte("700 40px 'Montserrat Certificado'"),
      fonte("500 20px 'Montserrat Certificado'"),
      fonte("italic 600 20px 'Montserrat Certificado'"),
      fonte("italic 700 20px 'Montserrat Certificado'"),
      imagem,
    ])
  }

  const imprimirCertificados = async () => {
    if (!daTurma.length) { toast('Ninguém marcado como presente — nada a certificar.', 'erro'); return }
    const semCpf = daTurma.filter(x => !x.participante.documento)
    if (semCpf.length) toast(`${semCpf.length} participante(s) sem CPF: o certificado sai sem esse dado.`, 'info')
    if (!t.conteudo?.length) toast('Este treinamento está sem conteúdo programático: o certificado sai sem a lista de tópicos.', 'info')
    await prepararModelo()
    imprimir(<Certificados treinamento={t} instrutor={instrutor} participantes={daTurma.map(x => x.participante)} />)
    // Marca quem já teve certificado emitido. Responde "já mandei o dele?" meses
    // depois, quando alguém liga pedindo segunda via.
    try { await acoes.registrarCertificados(daTurma.map(x => x.presenca.id)) } catch { /* o papel já saiu */ }
  }

  const concluir = async () => {
    try {
      await acoes.concluirTreinamento(t)
      toast('Treinamento dado por realizado. A demanda do roteiro foi encerrada junto.')
    } catch (e) { erro(e) }
  }

  const cpfRuim = !!nova.documento.trim() && !cpfValido(nova.documento)

  return (
    <>
      <Modal aberto onFechar={onFechar} largura="max-w-4xl"
        titulo={`${codigoTreinamento(t.numero)} · ${t.tema}`}
        rodape={podeEditar ? <>
          <Botao variante="perigo" onClick={() => setConfirmar('excluir')}><Trash2 size={14} />Excluir</Botao>
          <div className="flex-1" />
          {t.status === 'AGENDADO' ? <>
            <Botao onClick={() => setConfirmar('cancelar')}><X size={14} />Cancelar treinamento</Botao>
            <Botao variante="sucesso" onClick={concluir}><CheckCircle2 size={14} />Dar por realizado</Botao>
          </> : (
            <Botao onClick={() => acoes.reabrirTreinamento(t).then(() => toast('Treinamento de volta à agenda.')).catch(erro)}>
              <RotateCcw size={14} />Voltar para a agenda
            </Botao>
          )}
        </> : undefined}>

        {/* ---------------------------------------------------------- cabeçalho */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TREINAMENTO_TONE[t.status]}>{STATUS_TREINAMENTO_LABEL[t.status]}</Badge>
              <span className="text-[13px] font-semibold text-slate-800">{t.cliente_nome ?? 'Cliente a definir'}</span>
            </div>
            {t.local && <div className="mt-1 flex items-center gap-1 text-[12.5px] text-slate-500"><MapPin size={12} />{t.local}</div>}
          </div>
          {podeEditar && <Botao tamanho="sm" onClick={() => onEditar(t)}><Pencil size={13} />Editar</Botao>}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Dado rotulo="Data" valor={fmtData(t.data)} />
          <Dado rotulo="Horário" valor={`${fmtHora(t.hora_inicio)}–${fmtHora(t.hora_fim)}`} />
          <Dado rotulo="Carga horária" valor={fmtCarga(t.carga_horaria)} />
          <Dado rotulo="Instrutor" valor={instrutor?.nome ?? 'a definir'} alerta={!instrutor} />
        </div>
        {t.observacao && <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-[12.5px] text-amber-900">{t.observacao}</p>}

        {podeEditar && !t.conteudo?.length && (
          <p className="mt-2 flex items-start gap-1.5 rounded-md bg-slate-50 px-2.5 py-1.5 text-[12px] text-slate-600 ring-1 ring-slate-200">
            <AlertTriangle size={14} className="mt-px shrink-0 text-slate-400" />
            Sem conteúdo programático. O certificado sai sem a lista de tópicos — informe em <b>Editar</b>.
          </p>
        )}

        {demandaSumida && t.status === 'AGENDADO' && (
          <p className="mt-2 flex items-start gap-1.5 rounded-md bg-red-50 px-2.5 py-1.5 text-[12px] text-red-800">
            <AlertTriangle size={14} className="mt-px shrink-0" />
            Este treinamento não tem demanda no planejamento — o dia do instrutor não conta com ele.
            Lance uma demanda de tipo TREINAMENTO para {fmtData(t.data)} à mão.
          </p>
        )}

        {/* ---------------------------------------------------------- os papéis */}
        {t.conteudo?.length > 0 && (
          <ul className="mt-2 space-y-0.5 rounded-md bg-slate-50 px-3 py-2 text-[12px] text-slate-600 ring-1 ring-slate-200">
            {t.conteudo.map((c, i) => <li key={i}>• {c}</li>)}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-3">
          <Botao variante="primario" onClick={() => imprimir(<FolhaPresenca treinamento={t} instrutor={instrutor} lista={lista} />)}>
            <Printer size={14} />Folha de presença
          </Botao>
          <Botao variante="sucesso" onClick={imprimirCertificados} disabled={!daTurma.length}>
            <Award size={14} />Certificados ({daTurma.length})
          </Botao>
          <span className="flex items-center text-[11.5px] text-slate-500">
            <FileSignature size={13} className="mr-1 text-slate-400" />
            A folha sai em branco para assinar em obra; os nomes voltam digitados aqui.
          </span>
        </div>

        {/* ---------------------------------------------------------- a turma */}
        <div className="mt-4">
          <h3 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
            Lista de presença · {daTurma.length} de {lista.length}
          </h3>
          {lista.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-[13px] text-slate-500">
              Ninguém digitado ainda. Os nomes vêm da folha assinada.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200">
              <table className="tabela w-full min-w-[620px]">
                <thead>
                  <tr><th style={{ width: 34 }}>#</th><th>Nome</th><th>CPF</th><th>Função</th><th style={{ width: 90 }}>Presente</th><th>Certificado</th><th /></tr>
                </thead>
                <tbody>
                  {lista.map((x, i) => (
                    <tr key={x.presenca.id} className={cx(!x.presenca.presente && 'opacity-50')}>
                      <td className="text-center text-[11px] text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="font-medium">{x.participante.nome}</td>
                      <td className="om text-slate-600">{x.participante.documento ? fmtCpf(x.participante.documento) : <span className="text-slate-400">—</span>}</td>
                      <td className="text-xs text-slate-500">{x.participante.cargo ?? '—'}</td>
                      <td className="text-center">
                        <Checkbox checked={x.presenca.presente} disabled={!podeEditar}
                          onChange={e => acoes.marcarPresenca(x.presenca.id, e.target.checked).catch(erro)} />
                      </td>
                      <td className="text-[11.5px] text-slate-500">
                        {x.presenca.certificado_em ? fmtDataHora(x.presenca.certificado_em) : <span className="text-slate-300">não emitido</span>}
                      </td>
                      <td className="text-right">
                        {podeEditar && (
                          <Botao variante="fantasma" tamanho="sm" title="Tirar da lista"
                            onClick={() => acoes.removerPresenca(x.presenca.id).catch(erro)}><Trash2 size={13} /></Botao>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {podeEditar && (
            <div className="mt-2 grid grid-cols-2 items-end gap-2 rounded-lg bg-slate-50 p-2.5 ring-1 ring-slate-200 sm:grid-cols-8">
              <Campo rotulo="Nome completo" className="col-span-2 sm:col-span-3">
                <CampoSugestao valor={nova.nome} onChange={casarCadastro} sugestoes={jaConhecidos} />
              </Campo>
              <Campo rotulo="CPF" className="sm:col-span-2">
                <Input value={nova.documento} onChange={e => setNova(n => ({ ...n, documento: e.target.value }))}
                  placeholder="000.000.000-00" inputMode="numeric"
                  onBlur={e => setNova(n => ({ ...n, documento: soDigitos(e.target.value).length === 11 ? fmtCpf(e.target.value) : n.documento }))}
                  className={cpfRuim ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : undefined} />
              </Campo>
              <Campo rotulo="Função" className="sm:col-span-2">
                <Input value={nova.cargo} onChange={e => setNova(n => ({ ...n, cargo: e.target.value.toUpperCase() }))} placeholder="ENCARREGADO" />
              </Campo>
              <Botao variante="primario" onClick={adicionar} disabled={salvando || nova.nome.trim().length < 3 || cpfRuim}>
                <UserPlus size={14} />Incluir
              </Botao>
              {cpfRuim && (
                <p className="col-span-2 text-[11.5px] text-red-700 sm:col-span-8">
                  CPF inválido. Confira os números — ou deixe em branco, que o certificado sai sem ele.
                </p>
              )}
            </div>
          )}
        </div>
      </Modal>

      <Confirmar
        aberto={confirmar === 'cancelar'} titulo="Cancelar treinamento" perigo confirmarTexto="Cancelar treinamento"
        texto={<>O treinamento <b>{t.tema}</b> de {fmtData(t.data)} sai da agenda e a demanda do roteiro é cancelada junto.
          A lista de presença já digitada continua guardada.</>}
        onFechar={() => setConfirmar(null)}
        onConfirmar={() => {
          setConfirmar(null)
          acoes.cancelarTreinamento(t, null).then(() => toast('Treinamento cancelado.')).catch(erro)
        }} />

      <Confirmar
        aberto={confirmar === 'excluir'} titulo="Excluir treinamento" perigo confirmarTexto="Excluir"
        texto={<>Apaga o treinamento, a lista de presença ({lista.length} pessoa(s)) e a demanda do roteiro.
          Não dá para desfazer — se a aula foi desmarcada, o certo é <b>cancelar</b>, que deixa o registro.</>}
        onFechar={() => setConfirmar(null)}
        onConfirmar={() => {
          setConfirmar(null)
          acoes.excluirTreinamento(t).then(() => { toast('Treinamento excluído.'); onFechar() }).catch(erro)
        }} />
    </>
  )
}

function Dado({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 ring-1 ring-slate-200">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{rotulo}</div>
      <div className={cx('mt-0.5 text-[13px] font-semibold', alerta ? 'text-amber-700' : 'text-slate-800')}>{valor}</div>
    </div>
  )
}
