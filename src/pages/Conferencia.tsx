// Conferência de carga: a segunda vista sobre o que a expedição separou.
//
// POR QUE ESTA TELA EXISTE
//
// Quem separa é quem confere, e ninguém confere o próprio trabalho de verdade —
// não por má-fé, mas porque quem já olhou dez vezes para uma lista não enxerga
// mais o que falta nela. Entre "pré-carga fechada" e "iniciar rota" não havia
// ninguém olhando: o erro só aparecia na obra, com o cliente na frente e o
// caminhão a trinta quilômetros.
//
// DUAS DECISÕES QUE MOLDAM A TELA
//
// 1. Marca-se no TOQUE, não digitando a placa. O técnico está em pé, ao lado do
//    caminhão, com o celular numa mão. Digitar placa é preciso e é lento, e tela
//    lenta o pátio contorna. Em troca, o patrimônio é o maior texto do card: ele
//    marca olhando a placa, não a descrição.
//
// 2. A divergência NÃO trava a saída. Caminhão parado custa mais que entrega
//    errada, e travar ensinaria o técnico a marcar tudo OK para conseguir sair.
//    Ela fica na demanda, acende na expedição e sobra no histórico com nome e
//    hora — quem erra não é barrado, é visto.
import { AlertTriangle, Check, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { SeletorData } from '../components/Filtros'
import { Badge, BadgeTipo, Botao, Contador, Input, Modal, Pagina, Select, Vazio, cx } from '../components/ui'
import { STATUS_EM_ROTA, separaNaExpedicao } from '../lib/status'
import { agrupar, chaveParada, fmtData, fmtPatrimonio, hojeISO, ordenarParadas } from '../lib/format'
import type { Demanda } from '../lib/types'

/** O que o técnico costuma encontrar. Escrever à mão, de pé, no celular, é o que
 *  não acontece — então os casos comuns viram um toque, e o campo livre fica
 *  para o resto. Ver `divergencia` na migração 0019. */
const MOTIVOS = [
  'Não está no caminhão',
  'Veio a máquina errada',
  'Quantidade a menos',
  'Faltou acessório',
  'Equipamento danificado',
]

export function Conferencia() {
  const { demandas, tecnicos, acoes, tecnicoPorId } = useData()
  const { usuario, pode } = useAuth()
  const { toast, erro } = useToast()

  const meuTec = usuario?.perfil.papel === 'TECNICO' ? usuario.perfil.tecnico_id : null
  // Quem não é técnico (PCM acompanhando) escolhe de quem é a carga.
  const [escolhido, setEscolhido] = useState<string>(() => localStorage.getItem('conf-tecnico') ?? '')
  const tecnicoId = (meuTec ?? escolhido) || null
  const tecnico = tecnicoPorId(tecnicoId)

  const [data, setData] = useState(hojeISO())
  const [apontando, setApontando] = useState<Demanda | null>(null)
  const conferir = pode('carga.conferir')

  // A carga do dia: o que se carrega de fato. MANUTENÇÃO e ASSINATURA não passam
  // pelo caminhão, e por isso não entram na conferência — `separaNaExpedicao` é
  // a mesma régua que a pré-carga e a expedição já usam.
  const carga = useMemo(
    () => demandas
      .filter(d => STATUS_EM_ROTA.includes(d.status) && separaNaExpedicao(d.tipo)
                && d.tecnico_id === tecnicoId && d.data_planejada === data)
      .sort(ordenarParadas),
    [demandas, tecnicoId, data])

  const paradas = useMemo(() => Array.from(agrupar(carga, chaveParada).values()), [carga])
  const ok = carga.filter(d => d.conferencia === 'OK').length
  const divergentes = carga.filter(d => d.conferencia === 'DIVERGENTE')
  const faltam = carga.filter(d => d.conferencia === 'NAO_CONFERIDO').length
  const naRua = carga.some(d => d.status === 'EM_DESLOCAMENTO')

  const quem = usuario?.perfil.nome || tecnico?.nome || null
  const run = async (fn: () => Promise<unknown>, msg?: string) => {
    try { await fn(); if (msg) toast(msg) } catch (e) { erro(e) }
  }

  const escolher = (id: string) => { setEscolhido(id); localStorage.setItem('conf-tecnico', id) }

  if (!tecnicoId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <Vazio titulo="De quem é a carga?" texto="Esta tela confere uma carga por vez. O técnico entra direto na sua; quem é do PCM escolhe abaixo.">
          <Select value={escolhido} onChange={e => escolher(e.target.value)} className="w-64">
            <option value="">Selecione o técnico…</option>
            {tecnicos.filter(t => t.ativo).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </Select>
        </Vazio>
      </div>
    )
  }

  return (
    <Pagina
      titulo="Conferência de carga"
      subtitulo="Confira o caminhão antes de sair · o que não bater vai para a expedição na hora"
      acoes={<>
        {!meuTec && (
          <Select value={escolhido} onChange={e => escolher(e.target.value)} className="w-44">
            {tecnicos.filter(t => t.ativo).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </Select>
        )}
        <SeletorData valor={data} onChange={setData} />
      </>}
    >
      {/* Os três números que respondem "posso sair?". O que falta conferir vem
          primeiro porque é o único que pede ação de quem está aqui. */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Contador rotulo="A conferir" valor={faltam} tom={faltam > 0 ? 'text-amber-700' : undefined} />
        <Contador rotulo="Conferidos" valor={ok} tom={ok > 0 ? 'text-emerald-700' : undefined} />
        <Contador rotulo="Divergentes" valor={divergentes.length} tom={divergentes.length > 0 ? 'text-red-600' : undefined} />
      </div>

      {divergentes.length > 0 && (
        <div className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-900 ring-1 ring-red-200">
          <p className="flex items-center gap-1.5 font-bold"><AlertTriangle size={15} />
            {divergentes.length} item(ns) não bateram</p>
          <p className="mt-1">
            A expedição já está vendo isto na tela dela. A rota <b>não fica travada</b> —
            se der para sair assim, saia; o que ficou apontado segue registrado.
          </p>
        </div>
      )}

      {carga.length === 0 && (
        <Vazio titulo={`Nenhuma carga para ${fmtData(data)}`}
          texto="A carga aparece aqui quando o PCM gera o roteiro e a expedição separa. Nada a conferir ainda." />
      )}

      {carga.length > 0 && conferir && faltam > 0 && (
        <div className="mb-3">
          <Botao variante="primario" className="w-full justify-center py-3 text-base"
            onClick={() => run(async () => {
              const n = await acoes.conferirTudo(carga, quem)
              toast(`${n} item(ns) conferido(s).`)
            })}>
            <Check size={18} />Conferi os {faltam} que faltam
          </Botao>
          {/* O atalho existe para a carga pequena e certa, que é a maioria dos
              dias. Quem tem quinze itens marca um a um; quem tem três não
              deveria precisar de três toques para dizer a mesma coisa. */}
          <p className="mt-1 text-center text-[11px] text-slate-500">
            Marca só o que ainda não foi tocado — o que você já apontou continua apontado.
          </p>
        </div>
      )}

      <div className="space-y-2.5">
        {paradas.map((its, i) => (
          <div key={its[0].id} className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-700 text-[12px] font-black text-white">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold uppercase">📍 {its[0].local ?? '—'}</p>
                <p className="truncate text-[11.5px] text-slate-500">{its[0].cliente_nome ?? '—'}</p>
              </div>
            </div>
            <ul className="divide-y divide-slate-100">
              {its.map(d => (
                <ItemDaCarga key={d.id} d={d} podeConferir={conferir}
                  onOk={() => run(() => acoes.conferir(d.id, 'OK', quem))}
                  onLimpar={() => run(() => acoes.conferir(d.id, 'NAO_CONFERIDO', null))}
                  onApontar={() => setApontando(d)} />
              ))}
            </ul>
          </div>
        ))}
      </div>

      {carga.length > 0 && (
        <p className="mt-4 text-center text-[12px] text-slate-500">
          {naRua
            ? <>A rota já começou. O que for apontado agora continua chegando à expedição.</>
            : <>Conferido não é o mesmo que saiu: a rota começa em <b>Meu roteiro</b>.</>}
        </p>
      )}

      {apontando && (
        <DialogoDivergencia
          d={apontando}
          aoFechar={() => setApontando(null)}
          aoConfirmar={motivo => run(async () => {
            await acoes.conferir(apontando.id, 'DIVERGENTE', quem, motivo)
            setApontando(null)
          }, 'Apontado. A expedição já está vendo.')}
        />
      )}
    </Pagina>
  )
}

/**
 * Uma linha da carga.
 *
 * O patrimônio é o maior texto do card de propósito: marcar no toque só pega
 * "faltou" se quem marca estiver olhando a lista. Olhando a PLACA, pega também
 * a máquina trocada, que é o erro de expedição mais caro.
 */
function ItemDaCarga({ d, podeConferir, onOk, onLimpar, onApontar }: {
  d: Demanda
  podeConferir: boolean
  onOk(): void
  onLimpar(): void
  onApontar(): void
}) {
  const conferido = d.conferencia === 'OK'
  const divergente = d.conferencia === 'DIVERGENTE'

  return (
    <li className={cx('px-3 py-2.5', divergente && 'bg-red-50', conferido && 'bg-emerald-50/50')}>
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <BadgeTipo tipo={d.tipo} />
            <span className="truncate text-[13px] font-semibold">{d.equipamento_nome ?? '—'}</span>
          </div>
          <p className="mt-0.5 font-mono text-[15px] font-bold tracking-tight text-slate-900">
            {fmtPatrimonio(d)}
          </p>
          {d.status_separacao !== 'SEPARADO' && (
            <Badge tone="bg-amber-100 text-amber-900">a expedição não marcou como separado</Badge>
          )}
          {divergente && (
            <p className="mt-1 text-[12.5px] font-semibold text-red-800">⚠ {d.divergencia}</p>
          )}
          {conferido && d.conferido_por && (
            <p className="mt-0.5 text-[11px] text-emerald-800">conferido por {d.conferido_por}</p>
          )}
        </div>

        {podeConferir && (
          <div className="flex shrink-0 items-center gap-1.5">
            {d.conferencia === 'NAO_CONFERIDO' ? (
              <>
                {/* Alvos grandes: isto é usado em pé, com luva, no sol. */}
                <button type="button" onClick={onApontar} aria-label="Apontar divergência"
                  className="grid size-11 place-items-center rounded-lg text-red-600 ring-1 ring-red-200 transition-colors hover:bg-red-50">
                  <AlertTriangle size={18} />
                </button>
                <button type="button" onClick={onOk} aria-label="Está no caminhão"
                  className="grid size-11 place-items-center rounded-lg bg-emerald-600 text-white transition-opacity hover:opacity-90">
                  <Check size={20} />
                </button>
              </>
            ) : (
              <button type="button" onClick={onLimpar} aria-label="Desfazer a conferência"
                className="grid size-11 place-items-center rounded-lg text-slate-500 ring-1 ring-slate-200 transition-colors hover:bg-slate-50">
                <Undo2 size={17} />
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

/** O que houve. Um toque resolve o caso comum; o campo fica para o resto. */
function DialogoDivergencia({ d, aoFechar, aoConfirmar }: {
  d: Demanda
  aoFechar(): void
  aoConfirmar(motivo: string): void
}) {
  const [motivo, setMotivo] = useState('')

  return (
    <Modal aberto titulo="O que não bateu?" onFechar={aoFechar}>
      <p className="text-[13px] text-slate-600">
        <b>{d.equipamento_nome ?? '—'}</b> · {fmtPatrimonio(d)}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {MOTIVOS.map(m => (
          <button key={m} type="button" onClick={() => setMotivo(m)}
            className={cx('rounded-full px-3 py-1.5 text-[12.5px] font-medium ring-1 transition-colors',
              motivo === m ? 'bg-red-600 text-white ring-red-600' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>
            {m}
          </button>
        ))}
      </div>
      <Input value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus
        placeholder="Ou escreva o que houve…" className="mt-3 w-full" />
      <div className="mt-4 flex items-center justify-end gap-2">
        <Botao onClick={aoFechar}>Voltar</Botao>
        <Botao variante="perigo" disabled={!motivo.trim()} onClick={() => aoConfirmar(motivo)}>
          <AlertTriangle size={14} />Apontar
        </Botao>
      </div>
    </Modal>
  )
}
