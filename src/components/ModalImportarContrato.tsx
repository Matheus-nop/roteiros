// Importar contrato com blocos de patrimônio.
//
// O contrato do SIXLoke lista os equipamentos com quantidade (Remessa) e, mais abaixo,
// os patrimônios em blocos separados — sem dizer a qual equipamento cada bloco pertence.
// A tela casa os dois pela quantidade, mostra o resultado e só então lança na fila,
// **uma demanda por patrimônio**.
//
// A leitura e o casamento estão em `lib/contrato.ts`; aqui é só a conversa com o usuário.
import { AlertTriangle, CheckCircle2, FileText, Package, ScanLine } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useData } from '../hooks/useData'
import { useToast } from '../hooks/useToast'
import { Botao, Campo, Input, Modal, Select, cx } from './ui'
import { TIPOS } from '../lib/status'
import { normalizar, hojeISO } from '../lib/format'
import { encontrarDuplicata } from '../lib/actions'
import { casarBlocos, lerBlocos, lerCabecalho, lerEquipamentos, localTextual, melhorEquipamento, melhorLocal, type CabecalhoContrato, type EquipamentoContrato } from '../lib/contrato'
import type { NovaDemanda, Tipo } from '../lib/types'

interface Lido {
  cab: CabecalhoContrato
  equips: EquipamentoContrato[]
  blocos: string[][]
}

export function ModalImportarContrato({ aberto, onFechar }: { aberto: boolean; onFechar(): void }) {
  const { clientes, equipamentos, demandas, acoes } = useData()
  const { toast, erro } = useToast()

  const [txtCab, setTxtCab] = useState('')
  const [txtEquip, setTxtEquip] = useState('')
  const [txtPat, setTxtPat] = useState('')
  const [lido, setLido] = useState<Lido | null>(null)

  // Escolhas do usuário sobre o que foi lido.
  const [blocoDe, setBlocoDe] = useState<(number | null)[]>([])
  const [equipDe, setEquipDe] = useState<string[]>([])
  const [cliente, setCliente] = useState('')
  const [local, setLocal] = useState('')
  const [os, setOs] = useState('')
  const [tipo, setTipo] = useState<Tipo>('ENTREGA')
  const [dataDesejada, setDataDesejada] = useState('')
  const [salvando, setSalvando] = useState(false)

  const nomesCadastrados = useMemo(() => Array.from(new Set(equipamentos.map(e => e.nome))).sort(), [equipamentos])
  const locaisConhecidos = useMemo(
    () => Array.from(new Set(demandas.map(d => d.local).filter(Boolean) as string[])).sort(),
    [demandas])
  /** Patrimônio é identidade: um número só pode ser um equipamento. */
  const porPatrimonio = useMemo(
    () => new Map(equipamentos.filter(e => e.patrimonio).map(e => [normalizar(e.patrimonio), e])),
    [equipamentos])

  const limpar = () => {
    setTxtCab(''); setTxtEquip(''); setTxtPat(''); setLido(null)
    setBlocoDe([]); setEquipDe([]); setCliente(''); setLocal(''); setOs(''); setDataDesejada('')
  }
  const fechar = () => { limpar(); onFechar() }

  const ler = () => {
    if (!txtEquip.trim() || !txtPat.trim()) { toast('Cole ao menos os equipamentos e os patrimônios.', 'erro'); return }
    const cab = lerCabecalho(txtCab)
    const equips = lerEquipamentos(txtEquip)
    const blocos = lerBlocos(txtPat)
    if (!equips.length) { toast('Nenhum equipamento reconhecido. Confira se colou a tabela com a coluna Remessa.', 'erro'); return }
    if (!blocos.length) { toast('Nenhum bloco de patrimônio reconhecido. Os blocos são separados pela linha "Patrimônio".', 'erro'); return }

    setLido({ cab, equips, blocos })
    setBlocoDe(casarBlocos(equips, blocos))
    setEquipDe(equips.map(e => melhorEquipamento(e.nome, nomesCadastrados)))

    // Cliente: casa com o cadastro (inclusive apelidos) para não criar um cliente quase igual.
    const nCli = normalizar(cab.cliente)
    const achado = clientes.find(c => normalizar(c.nome) === nCli || c.apelidos.some(a => normalizar(a) === nCli))
    setCliente(achado?.nome ?? cab.cliente)
    setLocal(melhorLocal(cab.bairro, cab.cidade, locaisConhecidos) || localTextual(cab))
    setOs(cab.ficha)
  }

  /** As demandas que serão lançadas, mais o que precisa de atenção antes disso. */
  const previa = useMemo(() => {
    if (!lido) return null
    const cli = clientes.find(c => normalizar(c.nome) === normalizar(cliente) || c.apelidos.some(a => normalizar(a) === normalizar(cliente)))

    const linhas: NovaDemanda[] = []
    const divergencias: { patrimonio: string; escolhido: string; cadastrado: string }[] = []
    const usados = new Map<number, number>()   // bloco → quantas vezes escolhido

    lido.equips.forEach((eq, i) => {
      const bi = blocoDe[i]
      if (bi === null || bi === undefined) return
      usados.set(bi, (usados.get(bi) ?? 0) + 1)
      const nome = equipDe[i] || eq.nome
      for (const patrimonio of lido.blocos[bi] ?? []) {
        const cadastro = porPatrimonio.get(normalizar(patrimonio))
        // O patrimônio diz a que equipamento ele pertence. Se isso contradiz o que foi
        // escolhido na tabela, é sinal de bloco trocado — avisa em vez de escolher sozinho.
        const bate = cadastro ? normalizar(cadastro.nome) === normalizar(nome) : false
        if (cadastro && !bate) divergencias.push({ patrimonio, escolhido: nome, cadastrado: cadastro.nome })
        linhas.push({
          om: os.trim() || null,
          cliente_id: cli?.id ?? null,
          cliente_nome: cli?.nome ?? (cliente.trim().toUpperCase() || null),
          local: local.trim().toUpperCase() || null,
          tipo,
          equipamento_id: bate ? cadastro!.id : null,
          equipamento_nome: nome.toUpperCase(),
          patrimonio,
          quantidade: 1,
          unidade: bate ? cadastro!.unidade : null,
          tecnico_id: null, veiculo: null,
          data_abertura: hojeISO(),
          data_planejada: dataDesejada || null,
          data_reagendada: null,
          observacao: null,
          origem: 'IMPORTACAO CONTRATO',
        })
      }
    })

    const conflitos = Array.from(usados.entries()).filter(([, n]) => n > 1).map(([bi]) => bi)
    const duplicadas = linhas.filter(l => encontrarDuplicata(l as never, demandas)).length
    const semCadastro = linhas.filter(l => !l.equipamento_id).length
    return { linhas, conflitos, duplicadas, divergencias, semCadastro }
  }, [lido, blocoDe, equipDe, cliente, local, os, tipo, dataDesejada, clientes, demandas, porPatrimonio])

  const importar = async () => {
    if (!previa?.linhas.length) return
    if (previa.conflitos.length) { toast('O mesmo bloco está escolhido para dois equipamentos. Ajuste antes de importar.', 'erro'); return }
    setSalvando(true)
    try {
      const { criadas, duplicadas } = await acoes.lancar(previa.linhas, demandas)
      toast(`${criadas.length} item(ns) importado(s) para a fila${duplicadas.length ? `, ${duplicadas.length} duplicado(s) ignorado(s)` : ''}.`)
      fechar()
    } catch (e) { erro(e) } finally { setSalvando(false) }
  }

  const rotuloBloco = (b: string[], i: number) => `Bloco ${i + 1} · ${b.length} un — ${b[0]}${b.length > 1 ? `…${b[b.length - 1]}` : ''}`

  return (
    <Modal aberto={aberto} onFechar={fechar} titulo="Importar contrato (blocos de patrimônio)" largura="max-w-6xl" rodape={<>
      <Botao onClick={fechar}>Cancelar</Botao>
      {lido && <Botao variante="fantasma" onClick={limpar}>Recomeçar</Botao>}
      <Botao variante="sucesso" disabled={!previa?.linhas.length || salvando || !!previa?.conflitos.length} onClick={importar}>
        {salvando ? 'Importando…' : `Importar ${previa?.linhas.length ?? 0} item(ns) para a fila`}
      </Botao>
    </>}>
      <p className="mb-3 text-sm text-slate-600">
        Para contratos em que os equipamentos vêm com quantidade (<b>Remessa</b>) e os patrimônios vêm em blocos
        separados no fim. Cada bloco é casado a um equipamento <b>pela quantidade</b>, e cada patrimônio vira uma
        demanda. Acessórios sem patrimônio ficam de fora.
      </p>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Cola n={1} rotulo="Cabeçalho do contrato" dica="A linha com cliente, endereço, bairro e cidade" icone={FileText}
          valor={txtCab} onChange={setTxtCab} linhas={5} exemplo={'ST\tFicha\t…\tCliente\tLocal\tEndereço\t…\tBairro\tCidade\n\t8842\t…\tÁGUAS DO RIO\tOBRA PENHA\tRUA X, 120\t…\tPENHA\tRIO DE JANEIRO'} />
        <Cola n={2} rotulo="Equipamentos" dica="A tabela com a coluna Remessa" icone={Package}
          valor={txtEquip} onChange={setTxtEquip} linhas={7} exemplo={'GERADOR DE ENERGIA 3,5KVA\t\t4\tUN\nBOMBA SUBMERSA 2"\t\t2\tUN'} />
        <Cola n={3} rotulo="Patrimônios" dica='Os blocos, separados por "Patrimônio"' icone={ScanLine}
          valor={txtPat} onChange={setTxtPat} linhas={7} exemplo={'Patrimônio (Nº)\n1031\n1145\n1287\n4194\nPatrimônio (Nº)\n2552\n7217'} />
      </div>

      <div className="mt-3">
        <Botao variante="primario" onClick={ler}><ScanLine size={14} />Ler e casar</Botao>
      </div>

      {lido && previa && (
        <>
          {/* Cabeçalho lido — tudo editável, porque o export nem sempre vem limpo. */}
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Dados do contrato</div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
              <Campo rotulo="Cliente"><Input value={cliente} onChange={e => setCliente(e.target.value)} placeholder="nome do cliente" /></Campo>
              <Campo rotulo="Local (vai para o quadro)">
                <Input list="dl-locais-contrato" value={local} onChange={e => setLocal(e.target.value)} placeholder="bairro - cidade" />
                <datalist id="dl-locais-contrato">{locaisConhecidos.map(l => <option key={l} value={l} />)}</datalist>
              </Campo>
              <Campo rotulo="Contrato / OS"><Input value={os} onChange={e => setOs(e.target.value)} className="om" placeholder="nº da ficha" /></Campo>
              <Campo rotulo="Tipo"><Select value={tipo} onChange={e => setTipo(e.target.value as Tipo)}>{TIPOS.map(t => <option key={t}>{t}</option>)}</Select></Campo>
              <Campo rotulo="Data desejada (opcional)"><Input type="date" value={dataDesejada} onChange={e => setDataDesejada(e.target.value)} /></Campo>
            </div>
            {(lido.cab.endereco || lido.cab.bairro) && (
              <p className="mt-2 text-[11.5px] text-slate-500">
                Lido do contrato: {lido.cab.endereco || '—'} · bairro {lido.cab.bairro || '—'} · cidade {lido.cab.cidade || '—'}
              </p>
            )}
            {!lido.cab.cliente && !lido.cab.endereco && (
              <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-[12px] text-amber-900 ring-1 ring-amber-200">
                O cabeçalho não foi reconhecido. Confira o campo 1 — ou preencha cliente e local à mão aqui em cima.
              </p>
            )}
          </div>

          {/* O casamento: uma linha por equipamento do contrato. */}
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Equipamento no contrato</th>
                  <th className="px-3 py-2">Equipamento cadastrado</th>
                  <th className="px-3 py-2 text-center">Qtd</th>
                  <th className="px-3 py-2">Bloco de patrimônios</th>
                </tr>
              </thead>
              <tbody>
                {lido.equips.map((eq, i) => {
                  const bi = blocoDe[i]
                  const conflito = bi !== null && previa.conflitos.includes(bi)
                  const tamanhoBate = bi !== null && lido.blocos[bi]?.length === eq.qtd
                  return (
                    <tr key={i} className={cx('border-t border-slate-100', conflito && 'bg-red-50')}>
                      <td className="px-3 py-2 font-semibold text-slate-800">{eq.nome}</td>
                      <td className="px-3 py-2">
                        <Select value={equipDe[i] ?? ''} onChange={e => setEquipDe(v => v.map((x, j) => (j === i ? e.target.value : x)))} className="!text-xs">
                          <option value="">— manter o nome do contrato —</option>
                          {nomesCadastrados.map(n => <option key={n}>{n}</option>)}
                        </Select>
                      </td>
                      <td className="px-3 py-2 text-center font-bold tabular-nums">{eq.qtd}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <Select value={bi === null || bi === undefined ? '' : String(bi)} className="!text-xs"
                            onChange={e => setBlocoDe(v => v.map((x, j) => (j === i ? (e.target.value === '' ? null : Number(e.target.value)) : x)))}>
                            <option value="">— ignorar (acessório) —</option>
                            {lido.blocos.map((b, j) => <option key={j} value={j}>{rotuloBloco(b, j)}{b.length === eq.qtd ? ' ✓' : ''}</option>)}
                          </Select>
                          {tamanhoBate && !conflito && <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Resumo e alertas */}
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-3 py-2.5 text-[12.5px] ring-1 ring-slate-200">
              <span className="font-bold text-slate-800">{previa.linhas.length} demanda(s) a lançar</span>
              <span className="text-slate-500">{lido.blocos.length} bloco(s) lido(s)</span>
              {previa.duplicadas > 0 && <span className="font-semibold text-amber-700">{previa.duplicadas} já existe(m) e será(ão) ignorada(s)</span>}
              {previa.semCadastro > 0 && <span className="text-slate-500">{previa.semCadastro} sem vínculo com o cadastro de equipamentos</span>}
            </div>

            {previa.conflitos.length > 0 && (
              <Aviso grave>
                O mesmo bloco está escolhido para dois equipamentos. Cada bloco pertence a um equipamento só —
                ajuste antes de importar.
              </Aviso>
            )}

            {previa.divergencias.length > 0 && (
              <Aviso>
                <b>{previa.divergencias.length} patrimônio(s) já cadastrado(s) com outro equipamento.</b> Costuma ser
                bloco trocado. Ex.: o patrimônio <b>{previa.divergencias[0].patrimonio}</b> está no cadastro como{' '}
                <b>{previa.divergencias[0].cadastrado}</b>, mas foi casado com <b>{previa.divergencias[0].escolhido}</b>.
                Dá para importar assim mesmo — a demanda fica com o nome escolhido, sem vínculo com o cadastro.
              </Aviso>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}

function Cola({ n, rotulo, dica, icone: Icone, valor, onChange, linhas, exemplo }: {
  n: number; rotulo: string; dica: string; icone: typeof FileText
  valor: string; onChange(v: string): void; linhas: number; exemplo: string
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-[12.5px] font-bold text-slate-700">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-700 text-[10px] font-black text-white">{n}</span>
        <Icone size={13} className="text-slate-400" />{rotulo}
      </label>
      <p className="mb-1 text-[11px] text-slate-500">{dica}</p>
      <textarea value={valor} onChange={e => onChange(e.target.value)} rows={linhas} placeholder={exemplo}
        className="campo resize-y font-mono !text-[11px] leading-snug" />
    </div>
  )
}

function Aviso({ children, grave }: { children: React.ReactNode; grave?: boolean }) {
  return (
    <div className={cx('flex items-start gap-2 rounded-lg px-3 py-2.5 text-[12.5px] ring-1',
      grave ? 'bg-red-50 text-red-900 ring-red-200' : 'bg-amber-50 text-amber-900 ring-amber-200')}>
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  )
}
