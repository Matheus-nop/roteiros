// Operações de negócio sobre `demandas`. Todas identificam registros por uuid.
import type { Db } from './db'
import { DbError } from './db'
import type { Cliente, Demanda, Equipamento, Fechamento, NovaDemanda, Status, Historico, StatusSeparacao, EtiquetaAvulsa, RoteiroArquivado, NovoTreinamento, Participante, Presenca, Treinamento } from './types'
import { STATUS_ARQUIVADOS, STATUS_EM_ROTA, familiaDoTipo, proximaTriagem } from './status'
import { hojeISO, normalizar, ordenarParadas } from './format'
import { cpfValido, fmtHora, soDigitos } from './treinamentos'
import { contarDesfechos, montarParadas } from './arquivo'

const T = 'demandas'
const TT = 'treinamentos'

export function chaveIdentidade(d: Pick<Demanda, 'om' | 'equipamento_nome' | 'patrimonio' | 'cliente_id' | 'cliente_nome'>): string {
  return [normalizar(d.om), normalizar(d.equipamento_nome), normalizar(d.patrimonio), d.cliente_id ?? normalizar(d.cliente_nome)].join('|')
}

/**
 * Chave FROUXA, para desconfiar — não para bloquear.
 *
 * Ignora pontuação, acento, zero à esquerda e o sufixo 'SN:', porque a mesma demanda
 * chega escrita de dois jeitos: "035635" e "35635", "250225-407" e
 * "250225-407 SN: 20244406271".
 *
 * ELA SOZINHA NÃO BASTA, e isso custou caro para descobrir: casada só por peça +
 * equipamento, ela apontou 73 linhas numa importação de 118 — e 58 eram atendimento
 * NOVO no mesmo equipamento, de uma OS antiga já encerrada. Equipamento volta para
 * manutenção o tempo todo; é o negócio funcionando, não repetição. Aviso que erra 8 em
 * cada 10 vezes ensina a ignorar aviso.
 *
 * Por isso ela serve de ÍNDICE, e quem decide é `pareceRepetida` abaixo.
 */
export function chaveAproximada(d: Pick<Demanda, 'om' | 'equipamento_nome' | 'patrimonio'>): string {
  const so = (v: string | null) => normalizar(v).replace(/[^A-Z0-9]/g, '')
  const equip = so(d.equipamento_nome)
  // O patrimônio identifica a peça física; o `split` corta sufixos como
  // "SN: 20244406271", que descrevem a peça e não a demanda.
  const pat = so(normalizar(d.patrimonio).split(' SN')[0])
  if (pat) return `P:${pat}|${equip}`
  const om = so(d.om).replace(/^0+/, '')
  return om ? `O:${om}|${equip}` : ''
}

/** Mesma ordem de serviço, ignorando zero à esquerda e pontuação ('1415-01' ~ '1415-01/26'). */
function mesmaOm(a: string | null, b: string | null): boolean {
  const so = (v: string | null) => normalizar(v).replace(/[^A-Z0-9]/g, '').replace(/^0+/, '')
  const x = so(a), y = so(b)
  return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x))
}

/**
 * A candidata (mesma peça, mesmo equipamento) é mesmo repetição do que está sendo
 * lançado?
 *
 * DUAS CONDIÇÕES, E SÓ ELAS: mesmo MOVIMENTO e mesma ORDEM DE SERVIÇO.
 *
 * O movimento primeiro, e isto é regra do negócio: a OS identifica o CONTRATO, não o
 * movimento. A mesma OS cobre a entrega e, semanas depois, a retirada daquele
 * equipamento — duas demandas legítimas com o mesmo número. E a comparação é por
 * FAMÍLIA: RETIRADA e DEVOLUÇÃO são o mesmo movimento, ENTREGA e LOCAÇÃO também.
 *
 * A OS depois, ignorando zero à esquerda e pontuação: '035639' e '35639' são a mesma
 * ordem, e é assim que a mesma demanda chega escrita de dois jeitos.
 *
 * O QUE NÃO ENTRA, E POR QUE
 *
 * Já esteve aqui um terceiro caso: "a demanda que já existe ainda está aberta". A ideia
 * era pegar a peça mandada duas vezes para a rua no mesmo período. Na prática, quando o
 * PCM lança o dia todo à mão, quase toda peça tem demanda aberta — e o aviso passou a
 * disparar em cima de TODA importação, inclusive de serviço legitimamente novo com OS
 * nova. Aviso que aparece sempre não avisa nada.
 *
 * Peça ocupada é informação de operação, não de duplicidade. Se um dia valer a pena
 * mostrar isso, é em outro lugar e com outro nome.
 */
export function pareceRepetida(nova: Pick<Demanda, 'om' | 'tipo'>, existente: Demanda): boolean {
  if (familiaDoTipo(nova.tipo) !== familiaDoTipo(existente.tipo)) return false
  return mesmaOm(nova.om, existente.om)
}

/** Duplicidade: bloqueia só se EXATAMENTE igual (equip + patrimônio + OM + cliente) e não arquivada. */
export function encontrarDuplicata(nova: Pick<Demanda, 'om' | 'equipamento_nome' | 'patrimonio' | 'cliente_id' | 'cliente_nome'>, ativas: Demanda[]): Demanda | undefined {
  const k = chaveIdentidade(nova)
  return ativas.find(d => !STATUS_ARQUIVADOS.includes(d.status) && chaveIdentidade(d) === k)
}

export function criarAcoes(db: Db) {
  const patchMany = (ids: string[], patch: Record<string, unknown>) => db.updateMany<Demanda>(T, ids, patch)
  const patch = (id: string, p: Record<string, unknown>) => db.update<Demanda>(T, id, p)

  /**
   * O treinamento visto como demanda: é assim que ele aparece no planejamento, na
   * pré-carga e no `Meu roteiro` do técnico.
   *
   * O tema vai na OBSERVAÇÃO, e não em `equipamento_nome`, por dois motivos: a
   * observação é o campo que o `Meu roteiro` mostra em destaque na tela do técnico,
   * e `equipamento_nome` alimenta a sugestão do formulário de demandas — um tema de
   * treinamento ali passaria a ser oferecido como equipamento.
   */
  function campoDaDemanda(t: Treinamento): Record<string, unknown> {
    return {
      tipo: 'TREINAMENTO',
      cliente_id: t.cliente_id,
      cliente_nome: t.cliente_nome,
      local: t.local,
      tecnico_id: t.tecnico_id,
      data_planejada: t.data,
      observacao: `Treinamento ${fmtHora(t.hora_inicio)}–${fmtHora(t.hora_fim)}: ${t.tema}`,
      // Sem técnico ainda não é plano, é intenção — e o quadro do planejamento é
      // justamente onde se resolve isso.
      status: t.tecnico_id ? 'PLANEJADO' : 'AGUARDANDO_ROTEIRIZACAO',
      origem: 'TREINAMENTO',
      quantidade: 1,
    }
  }

  /**
   * Leva para a demanda o que mudou no treinamento.
   *
   * Não mexe em demanda já encerrada nem em `ordem_parada`: a posição da parada é
   * decisão do PCM no quadro, e remarcar a hora da aula não pode reembaralhar o
   * roteiro do dia. Trocar a DATA, sim, tira a demanda da ordem antiga — ela vai
   * para outro dia, onde ainda não tem lugar.
   */
  async function sincronizarDemanda(t: Treinamento): Promise<void> {
    if (!t.demanda_id) return
    try {
      const [d] = await db.select<Demanda>(T, { eq: { id: t.demanda_id } })
      if (!d || STATUS_ARQUIVADOS.includes(d.status)) return
      const p = campoDaDemanda(t)
      delete p.status
      if (d.data_planejada !== t.data) p.ordem_parada = null
      await patch(t.demanda_id, p)
    } catch { /* a demanda pode ter sido excluída à mão */ }
  }

  return {
    // ---------------- Fila ----------------
    async lancar(linhas: NovaDemanda[], ativas: Demanda[]): Promise<{ criadas: Demanda[]; duplicadas: NovaDemanda[] }> {
      const duplicadas: NovaDemanda[] = []
      const aceitas: Record<string, unknown>[] = []
      const vistas = new Set<string>()
      for (const l of linhas) {
        const k = chaveIdentidade(l as Demanda)
        if (encontrarDuplicata(l as Demanda, ativas) || vistas.has(k)) { duplicadas.push(l); continue }
        vistas.add(k)
        aceitas.push({ ...l, om: l.om?.toString().trim() || null, status: l.status ?? 'FILA', origem: l.origem ?? 'COMERCIAL' })
      }
      const criadas = aceitas.length ? await db.insert<Demanda>(T, aceitas) : []
      return { criadas, duplicadas }
    },

    /**
     * Cliente ou equipamento digitado à mão vira cadastro, e a demanda passa a apontar
     * para ele.
     *
     * POR QUE ISSO EXISTE
     *
     * O nome digitado já é a verdade: a demanda foi lançada com ele e vai ser executada
     * com ele. Deixar de fora do cadastro só garante que a próxima pessoa digite de novo,
     * com outra grafia — e aí o mesmo equipamento aparece três vezes no relatório.
     * Cadastrar na hora é o que faz a sugestão da próxima vez já estar pronta.
     *
     * DUAS SALVAGUARDAS
     *
     * 1. Só entra o que passou pelo `lancar` — nome de linha duplicada ou recusada não
     *    vira cadastro.
     * 2. Nasce marcado com `criado_automaticamente`, e o Cadastros mostra a marca. Erro
     *    de digitação vira cadastro, sim; o que não pode é virar cadastro invisível.
     *
     * Falha de escrita não derruba o lançamento: a demanda já está salva, e o cadastro é
     * conveniência. Devolve o que criou para a tela poder contar.
     */
    async aprenderCadastros(criadas: Demanda[], clientes: Cliente[], equipamentos: Equipamento[]) {
      const nomeConhecido = new Set(clientes.flatMap(c => [c.nome, ...c.apelidos]).map(normalizar))
      const equipConhecido = new Set(equipamentos.map(e => `${normalizar(e.nome)}|${normalizar(e.patrimonio)}`))

      const clientesNovos = new Map<string, string>()
      const equipsNovos = new Map<string, { nome: string; patrimonio: string | null; controlado_por_quantidade: boolean; unidade: string | null }>()

      for (const d of criadas) {
        // Nome com uma ou duas letras é quase sempre engano de digitação, não cadastro.
        const cli = (d.cliente_nome ?? '').trim()
        if (!d.cliente_id && cli.length >= 3 && !nomeConhecido.has(normalizar(cli)) && !clientesNovos.has(normalizar(cli))) {
          clientesNovos.set(normalizar(cli), cli.toUpperCase())
        }
        const eq = (d.equipamento_nome ?? '').trim()
        const chaveEq = `${normalizar(eq)}|${normalizar(d.patrimonio)}`
        if (!d.equipamento_id && eq.length >= 3 && !equipConhecido.has(chaveEq) && !equipsNovos.has(chaveEq)) {
          equipsNovos.set(chaveEq, {
            nome: eq.toUpperCase(),
            patrimonio: d.patrimonio?.trim() || null,
            // Sem patrimônio, o item é controlado por quantidade — é a mesma regra que o
            // formulário aplica ao montar a demanda.
            controlado_por_quantidade: !d.patrimonio?.trim(),
            unidade: d.unidade ?? (!d.patrimonio?.trim() ? 'UNIDADE' : null),
          })
        }
      }

      const inserir = async <T,>(tabela: string, linhas: Record<string, unknown>[]): Promise<T[]> => {
        if (!linhas.length) return []
        try { return await db.insert<T>(tabela, linhas.map(l => ({ ...l, criado_automaticamente: true }))) }
        // Sem a coluna `criado_automaticamente` (migração 0008 não rodou) ou sem
        // permissão: o cadastro é conveniência, o lançamento já está salvo.
        catch { try { return await db.insert<T>(tabela, linhas) } catch { return [] } }
      }

      // `apelidos: []` explícito: a coluna tem default no banco, mas a lista de sugestão
      // percorre `c.apelidos` e uma linha sem o campo quebraria o formulário inteiro.
      const novosClientes = await inserir<Cliente>('clientes', Array.from(clientesNovos.values()).map(nome => ({ nome, apelidos: [] })))
      const novosEquips = await inserir<Equipamento>('equipamentos', Array.from(equipsNovos.values()))

      // Amarra as demandas recém-criadas nos cadastros recém-criados: sem isso elas
      // ficariam para sempre com o nome solto e fora do agrupamento por FK.
      const porNomeCliente = new Map(novosClientes.map(c => [normalizar(c.nome), c.id]))
      const porChaveEquip = new Map(novosEquips.map(e => [`${normalizar(e.nome)}|${normalizar(e.patrimonio)}`, e.id]))
      await Promise.all(criadas.map(async d => {
        const p: Record<string, unknown> = {}
        if (!d.cliente_id) {
          const id = porNomeCliente.get(normalizar(d.cliente_nome))
          if (id) p.cliente_id = id
        }
        if (!d.equipamento_id) {
          const id = porChaveEquip.get(`${normalizar(d.equipamento_nome)}|${normalizar(d.patrimonio)}`)
          if (id) p.equipamento_id = id
        }
        if (Object.keys(p).length) { try { await patch(d.id, p) } catch { /* segue */ } }
      }))

      return { clientes: novosClientes.map(c => c.nome), equipamentos: novosEquips.map(e => e.nome) }
    },

    /**
     * Renomear um cliente no cadastro e levar o nome novo às demandas dele.
     *
     * `demandas.cliente_nome` é desnormalizado de propósito: é o que as telas mostram e
     * o que sobrevive à exclusão do cadastro. O preço é este — renomear o cadastro não
     * alcança as demandas sozinho, e o quadro fica mostrando o nome antigo enquanto o
     * cadastro diz outro. Quem renomeia não tem como adivinhar que precisa de um segundo
     * passo, então o segundo passo vai junto.
     *
     * Só toca nas demandas que apontam para ESTE cadastro. Nome solto, sem FK, fica como
     * está: não há como saber se é o mesmo cliente ou um homônimo.
     */
    async renomearCliente(clienteId: string, nome: string) {
      const alvo = await db.select<Demanda>(T, { eq: { cliente_id: clienteId } })
      if (!alvo.length) return 0
      await patchMany(alvo.map(d => d.id), { cliente_nome: nome })
      return alvo.length
    },

    /**
     * Tira um cliente do cadastro.
     *
     * Só sai quem não está preso a nenhuma demanda. A FK
     * `demandas_cliente_id_fkey` já recusaria — mas com a mensagem crua do
     * Postgres, que fala em constraint e não diz quantas demandas seguram o
     * cadastro nem o que fazer a respeito.
     *
     * A contagem é no banco, e não em `useData()`: aquele hook carrega só as
     * demandas ATIVAS, então um cliente com dez demandas encerradas pareceria
     * livre na tela e o clique morreria em erro de FK.
     */
    async excluirCliente(clienteId: string, nome: string) {
      const presas = await db.select<Demanda>(T, { eq: { cliente_id: clienteId } })
      if (presas.length) {
        throw new DbError(
          `${nome} está em ${presas.length} demanda(s) e não pode ser excluído. ` +
            'Se for duplicata de outro cliente, use "Juntar com" — as demandas passam ' +
            'para o cliente que fica e este sai do cadastro.',
        )
      }
      await db.remove('clientes', clienteId)
    },

    /**
     * Junta dois cadastros do mesmo cliente.
     *
     * É o que se quer de verdade quando se tenta excluir uma duplicata: o nome
     * errado não some sozinho, porque há demandas apontando para ele. Aqui as
     * demandas passam para o cliente que fica, o nome do que sai vira apelido
     * dele — senão o lançamento seguinte escrito daquele jeito criaria a
     * duplicata de novo — e só então o cadastro extra é removido.
     *
     * `cliente_nome` vai junto com `cliente_id`: é o nome gravado na demanda, e
     * é ele que as telas mostram. Mover só a FK deixaria o quadro exibindo o
     * nome do cadastro que acabou de deixar de existir.
     */
    async juntarClientes(de: Cliente, para: Cliente) {
      if (de.id === para.id) throw new DbError('Escolha dois clientes diferentes.')
      const alvo = await db.select<Demanda>(T, { eq: { cliente_id: de.id } })
      if (alvo.length) {
        await patchMany(alvo.map(d => d.id), { cliente_id: para.id, cliente_nome: para.nome })
      }
      const apelidos = Array.from(new Set([
        ...(para.apelidos ?? []),
        de.nome,
        ...(de.apelidos ?? []),
      ].map(a => a.trim().toUpperCase()).filter(a => a && a !== para.nome.toUpperCase())))
      await db.update('clientes', para.id, { apelidos })
      await db.remove('clientes', de.id)
      return alvo.length
    },

    async avancarTriagem(d: Demanda) {
      const prox = proximaTriagem(d.status)
      if (!prox) throw new DbError('Demanda já está no último passo da triagem')
      return patch(d.id, { status: prox })
    },

    async definirStatus(ids: string[], status: Status) {
      return patchMany(ids, { status })
    },

    async enviarParaPlanejamento(ids: string[]) {
      return patchMany(ids, { status: 'AGUARDANDO_ROTEIRIZACAO' })
    },

    async devolverParaFila(ids: string[]) {
      return patchMany(ids, { status: 'FILA', tecnico_id: null, veiculo: null, data_planejada: null, ordem_parada: null, status_separacao: 'NAO_SEPARADO', separado_por: null, data_separacao: null })
    },

    async editar(id: string, campos: Partial<Demanda>) {
      const { id: _i, numero: _n, created_at: _c, updated_at: _u, ...resto } = campos as Demanda
      return patch(id, resto as Record<string, unknown>)
    },

    // ---------------- Planejamento ----------------
    /** Atribui técnico/veículo/data. Não puxa o veículo padrão do técnico: o veículo é decisão explícita. */
    async atribuir(ids: string[], campos: { tecnico_id?: string | null; veiculo?: string | null; data_planejada?: string | null }) {
      const p: Record<string, unknown> = {}
      if ('tecnico_id' in campos) p.tecnico_id = campos.tecnico_id
      if ('veiculo' in campos) p.veiculo = campos.veiculo
      if ('data_planejada' in campos) p.data_planejada = campos.data_planejada
      return patchMany(ids, p)
    },

    /** Recebe os ids na ordem desejada e grava 10, 20, 30... (ordem manual é soberana). */
    /**
     * Grava a nova ordem das paradas — só nos itens que realmente mudaram de número.
     *
     * Cada item é um UPDATE, e arrastar um card reescrevia o grupo inteiro: mover a última
     * parada de um dia de trinta itens custava trinta escritas, trinta eventos de tempo real
     * e trinta re-renderizações em cada aparelho conectado, para mudar duas posições. Como
     * a numeração é 10, 20, 30…, comparar com o que já está gravado responde quem mudou.
     */
    async reordenar(naOrdem: Demanda[]) {
      const mudaram = naOrdem
        .map((d, i) => ({ d, ordem: (i + 1) * 10 }))
        .filter(({ d, ordem }) => d.ordem_parada !== ordem)
      if (!mudaram.length) return 0
      await Promise.all(mudaram.map(({ d, ordem }) => patch(d.id, { ordem_parada: ordem })))
      return mudaram.length
    },

    /**
     * Gera roteiro: PLANEJADO/AGUARDANDO → ROTEIRIZADO, mantendo a ordem existente e numerando quem não tem.
     *
     * `jaNumerados` são itens do MESMO técnico e MESMA data que já têm parada e não estão
     * nesta geração — porque a pré-carga deles já fechou (saíram do planejamento) ou porque
     * um filtro da tela os escondeu. Eles não são renumerados (a folha pode já estar na mão
     * do técnico), mas contam: esta geração começa depois do maior número deles. Sem isso,
     * acrescentar uma demanda a um dia já roteirizado criava uma segunda "parada 1" e as
     * novas se intercalavam com as antigas na tela do técnico.
     */
    async gerarRoteiro(itens: Demanda[], jaNumerados: Demanda[] = []) {
      const semTecnico = itens.filter(d => !d.tecnico_id || !d.data_planejada)
      if (semTecnico.length) throw new DbError(`${semTecnico.length} item(ns) sem técnico ou sem data. Atribua antes de gerar o roteiro.`)
      const base = jaNumerados.reduce((m, d) => Math.max(m, d.ordem_parada ?? 0), 0)
      const ordenados = [...itens].sort(ordenarParadas)
      // Quem já está roteirizado no número certo não é reescrito: gerar de novo para
      // acrescentar duas demandas passa a custar duas escritas, não o dia inteiro.
      const mudaram = ordenados
        .map((d, i) => ({ d, ordem: base + (i + 1) * 10 }))
        .filter(({ d, ordem }) => d.status !== 'ROTEIRIZADO' || d.ordem_parada !== ordem)
      await Promise.all(mudaram.map(({ d, ordem }) => patch(d.id, { status: 'ROTEIRIZADO', ordem_parada: ordem })))
      return mudaram.length
    },

    /** Remove do roteiro: volta ao planejamento e renumera as demais fechando buracos, sem reembaralhar. */
    async removerDoRoteiro(d: Demanda, irmaos: Demanda[]) {
      await patch(d.id, { status: 'AGUARDANDO_ROTEIRIZACAO', ordem_parada: null, status_separacao: 'NAO_SEPARADO', separado_por: null, data_separacao: null })
      const restantes = irmaos.filter(x => x.id !== d.id).sort(ordenarParadas)
      await Promise.all(restantes.map((x, i) => (x.ordem_parada === (i + 1) * 10 ? null : patch(x.id, { ordem_parada: (i + 1) * 10 }))))
    },

    // ---------------- Expedição / Pré-carga ----------------
    async marcarSeparado(id: string, separado: boolean, separadoPor: string | null) {
      return patch(id, separado
        ? { status_separacao: 'SEPARADO', separado_por: separadoPor, data_separacao: hojeISO() }
        : { status_separacao: 'NAO_SEPARADO', separado_por: null, data_separacao: null })
    },

    /** Separação em 3 estados (não separado → em separação → separado). */
    async definirSeparacao(id: string, estado: StatusSeparacao, separadoPor: string | null) {
      if (estado === 'SEPARADO') return patch(id, { status_separacao: 'SEPARADO', separado_por: separadoPor, data_separacao: hojeISO() })
      if (estado === 'EM_SEPARACAO') return patch(id, { status_separacao: 'EM_SEPARACAO', separado_por: separadoPor, data_separacao: null })
      return patch(id, { status_separacao: 'NAO_SEPARADO', separado_por: null, data_separacao: null })
    },

    async definirSeparadoPor(id: string, separadoPor: string | null) {
      return patch(id, { separado_por: separadoPor })
    },

    /** Expedição dá o "ok, pode levar": ROTEIRIZADO → AGUARDANDO_SAIDA. */
    async liberarParaRota(ids: string[]) {
      return patchMany(ids, { status: 'AGUARDANDO_SAIDA' })
    },

    /** Pré-roteiro: libera um subconjunto de itens (uma parada) para o roteiro, numerando após as paradas já liberadas. */
    async liberarParada(itens: Demanda[], jaNoRoteiro: Demanda[]) {
      const semDados = itens.filter(d => !d.tecnico_id || !d.data_planejada)
      if (semDados.length) throw new DbError('Itens sem técnico ou sem data não podem ser liberados.')
      const max = jaNoRoteiro.reduce((m, d) => Math.max(m, d.ordem_parada ?? 0), 0)
      const ordenados = [...itens].sort(ordenarParadas)
      await Promise.all(ordenados.map((d, i) => patch(d.id, { status: 'ROTEIRIZADO', ordem_parada: max + (i + 1) * 10 })))
    },

    async registrarEtiquetaAvulsa(e: EtiquetaAvulsa, usuarioId: string | null) {
      const [row] = await db.insert<EtiquetaAvulsa>('etiquetas_avulsas', [{ ...e, emitida_por: usuarioId }])
      return row
    },

    /** Fecha a pré-carga do dia: ROTEIRIZADO → AGUARDANDO_SAIDA e registra fechamento (estornável). */
    async fecharPreCarga(tecnicoId: string, data: string, itens: Demanda[], usuarioId: string | null) {
      const ids = itens.filter(d => d.status === 'ROTEIRIZADO').map(d => d.id)
      if (!ids.length) throw new DbError('Nenhum item aberto para fechar.')
      await patchMany(ids, { status: 'AGUARDANDO_SAIDA' })
      const [f] = await db.insert<Fechamento>('fechamentos', [{ tipo: 'PRE_CARGA', tecnico_id: tecnicoId, data, demanda_ids: ids, fechado_por: usuarioId }])
      return f
    },

    async estornarFechamento(f: Fechamento) {
      if (f.estornado) throw new DbError('Fechamento já estornado.')
      const alvo: Status = f.tipo === 'PRE_CARGA' ? 'ROTEIRIZADO' : 'EM_DESLOCAMENTO'
      await patchMany(f.demanda_ids, { status: alvo })
      await db.update<Fechamento>('fechamentos', f.id, { estornado: true })
    },

    // ---------------- Arquivo digital dos roteiros ----------------
    /**
     * Arquiva o roteiro se não sobrou nada em rota; se ainda há item aberto, não faz nada.
     *
     * Recebe os **ids que compunham o roteiro** (lidos pela tela antes da ação), não um
     * filtro por data: a demanda reagendada já mudou de data quando esta função roda, e
     * um filtro por data a perderia — justamente o item cuja falta explica por que o
     * roteiro fechou. Reler por id devolve o desfecho real de cada um.
     *
     * Idempotente por (técnico, data): reabrir e fechar de novo reescreve o registro.
     */
    async arquivarSeCompleto(p: { tecnicoId: string; tecnicoNome: string; data: string; ids: string[]; veiculo?: string | null; usuarioId: string | null; automatico?: boolean }): Promise<RoteiroArquivado | null> {
      if (!p.ids.length || !p.tecnicoId || !p.data) return null
      const linhas = await db.select<Demanda>(T, { in: { id: p.ids } })
      if (!linhas.length) return null
      // Aberto = ainda em rota E ainda neste dia. Reagendada para outro dia não segura o arquivo.
      const aberto = linhas.some(d => STATUS_EM_ROTA.includes(d.status) && d.data_planejada === p.data)
      if (aberto) return null

      const paradas = montarParadas(linhas, p.data)
      const [row] = await db.upsert<RoteiroArquivado>('roteiros_arquivo', [{
        tecnico_id: p.tecnicoId,
        tecnico_nome: p.tecnicoNome,
        data: p.data,
        veiculo: p.veiculo ?? linhas.find(d => d.veiculo)?.veiculo ?? null,
        arquivado_por: p.usuarioId,
        automatico: p.automatico ?? true,
        paradas,
        ...contarDesfechos(paradas),
      }], 'tecnico_id,data')
      return row ?? null
    },

    /**
     * Desfaz o roteiro inteiro: todo item em rota volta ao planejamento.
     *
     * Mantém técnico e data — o PCM quase sempre quer remontar o mesmo dia, e limpar
     * isso jogaria tudo na coluna "sem técnico" para ser reatribuído um a um. Some a
     * ordem das paradas e a separação, que eram deste roteiro e não valem mais.
     * O que já foi executado não volta: finalizado é fato consumado.
     */
    async desfazerRoteiro(itens: Demanda[]) {
      const ids = itens.filter(d => STATUS_EM_ROTA.includes(d.status)).map(d => d.id)
      if (!ids.length) throw new DbError('Não há item em rota neste roteiro para devolver ao planejamento.')
      await patchMany(ids, {
        status: 'AGUARDANDO_ROTEIRIZACAO', ordem_parada: null,
        status_separacao: 'NAO_SEPARADO', separado_por: null, data_separacao: null,
      })
      return ids.length
    },

    // ---------------- Roteiro / Imp. técnico ----------------
    async iniciarRota(itens: Demanda[]) {
      const ids = itens.filter(d => d.status === 'ROTEIRIZADO' || d.status === 'AGUARDANDO_SAIDA').map(d => d.id)
      return patchMany(ids, { status: 'EM_DESLOCAMENTO' })
    },

    async finalizar(ids: string[]) {
      return patchMany(ids, { status: 'FINALIZADO', finalizado_em: new Date().toISOString() })
    },

    /**
     * Devolve demandas ao estado que a tela tinha antes da marcação — o desfazer do técnico
     * que tocou errado.
     *
     * Não é "voltar um status": concluir e reagendar mexem em campos diferentes (um grava
     * `finalizado_em`, o outro troca a data planejada, some com a ordem da parada e zera a
     * separação), e adivinhar o inverso de cada um daria margem a erro. Aqui o chamador
     * passa a demanda como ela estava, e os campos que a marcação toca voltam a esse valor.
     *
     * O arquivo do dia não é desfeito: se o roteiro já tinha fechado, ele volta a fechar —
     * e a reescrever o registro — quando o item for concluído de novo.
     */
    async desfazerMarcacao(anteriores: Demanda[]) {
      if (!anteriores.length) throw new DbError('Nada para desfazer.')
      await Promise.all(anteriores.map(d => patch(d.id, {
        status: d.status,
        finalizado_em: d.finalizado_em,
        data_planejada: d.data_planejada,
        data_reagendada: d.data_reagendada,
        ordem_parada: d.ordem_parada,
        herdado_de_pendencia: d.herdado_de_pendencia,
        status_separacao: d.status_separacao,
        separado_por: d.separado_por,
        data_separacao: d.data_separacao,
        observacao: d.observacao,
      })))
      return anteriores.length
    },

    /**
     * Pendente: pede data de reagendamento e volta ao planejamento com ESSA data
     * como data planejada (a data de abertura fica só como referência).
     */
    async marcarPendente(ids: string[], novaData: string, observacao: string | null) {
      if (!novaData) throw new DbError('Informe a data de reagendamento.')
      const p: Record<string, unknown> = {
        status: 'AGUARDANDO_ROTEIRIZACAO', data_reagendada: novaData, data_planejada: novaData,
        herdado_de_pendencia: true, ordem_parada: null,
        status_separacao: 'NAO_SEPARADO', separado_por: null, data_separacao: null,
      }
      if (observacao) p.observacao = observacao
      return patchMany(ids, p)
    },

    async reagendar(ids: string[], novaData: string) {
      return patchMany(ids, { data_reagendada: novaData, data_planejada: novaData, status: 'AGUARDANDO_ROTEIRIZACAO', ordem_parada: null })
    },

    /**
     * Fecha o roteiro do dia. FINALIZADO já está arquivado; CANCELADO sai; quem não foi executado
     * é reagendado (se `novaData`) ou mantido em andamento.
     */
    async fecharRoteiro(tecnicoId: string, data: string, itens: Demanda[], opcao: { reagendarPara: string | null }, usuarioId: string | null) {
      const abertos = itens.filter(d => STATUS_EM_ROTA.includes(d.status))
      if (opcao.reagendarPara && abertos.length) {
        await patchMany(abertos.map(d => d.id), {
          status: 'AGUARDANDO_ROTEIRIZACAO', data_reagendada: opcao.reagendarPara, data_planejada: opcao.reagendarPara,
          herdado_de_pendencia: true, ordem_parada: null, status_separacao: 'NAO_SEPARADO', separado_por: null, data_separacao: null,
        })
      }
      const [f] = await db.insert<Fechamento>('fechamentos', [{ tipo: 'ROTEIRO', tecnico_id: tecnicoId, data, demanda_ids: itens.map(d => d.id), fechado_por: usuarioId }])
      return f
    },

    async cancelar(ids: string[], motivo: string | null) {
      const p: Record<string, unknown> = { status: 'CANCELADO', ordem_parada: null }
      if (motivo) p.observacao = motivo
      return patchMany(ids, p)
    },

    // ---------------- Histórico ----------------
    /** Restaura demanda arquivada (FINALIZADO/CANCELADO) para o planejamento. */
    async restaurar(id: string) {
      return patch(id, { status: 'AGUARDANDO_ROTEIRIZACAO', finalizado_em: null, ordem_parada: null, status_separacao: 'NAO_SEPARADO', separado_por: null, data_separacao: null })
    },

    /** Reinsere uma demanda excluída a partir do snapshot do histórico. */
    async restaurarDoSnapshot(h: Historico) {
      const s = h.snapshot
      if (!s || !s.id) throw new DbError('Snapshot indisponível.')
      const { numero: _n, created_at: _c, updated_at: _u, ...resto } = s as Demanda
      const [d] = await db.insert<Demanda>(T, [{ ...resto, status: 'AGUARDANDO_ROTEIRIZACAO', ordem_parada: null }])
      return d
    },

    async excluir(id: string) {
      return db.remove(T, id)
    },

    // ---------------- Treinamentos ----------------
    /**
     * Agenda um treinamento E cria a demanda que leva o instrutor até lá.
     *
     * POR QUE AS DUAS COISAS
     *
     * O treinamento é um compromisso do técnico como qualquer outro: ocupa a manhã
     * dele, sai de carro e concorre com as entregas do dia. Se ele vivesse só na
     * agenda, o PCM montaria o roteiro sem saber que o Igor está em Nova Iguaçu às
     * nove — e o descobriria na véspera, pelo WhatsApp. Era exatamente o que
     * acontecia antes deste módulo.
     *
     * QUEM MANDA É A AGENDA. A demanda é o reflexo: mudou a data ou o instrutor
     * aqui, `sincronizarDemanda` leva a mudança para lá. O caminho contrário não
     * existe de propósito — dois donos para a mesma data é como se perde uma.
     *
     * Se a demanda falhar (RLS, migração não aplicada), o treinamento fica salvo
     * sem ela. É o lado certo para falhar: a agenda é o registro, e o app mostra
     * "sem demanda" para quem precisa consertar.
     */
    async agendarTreinamento(nova: NovoTreinamento): Promise<{ treinamento: Treinamento; demanda: Demanda | null }> {
      if (!nova.tema?.trim()) throw new DbError('Informe o tema do treinamento.')
      if (!nova.data) throw new DbError('Informe a data do treinamento.')
      const [t] = await db.insert<Treinamento>(TT, [{
        ...nova,
        tema: nova.tema.trim().toUpperCase(),
        hora_inicio: fmtHora(nova.hora_inicio) || '09:00',
        hora_fim: fmtHora(nova.hora_fim) || '11:00',
        status: nova.status ?? 'AGENDADO',
      }])

      let demanda: Demanda | null = null
      try {
        const [d] = await db.insert<Demanda>(T, [campoDaDemanda(t)])
        demanda = d
        await db.update<Treinamento>(TT, t.id, { demanda_id: d.id })
        t.demanda_id = d.id
      } catch { /* a agenda já está salva; a tela mostra que falta a demanda */ }
      return { treinamento: t, demanda }
    },

    /** Altera o treinamento e leva a mudança para a demanda que o acompanha. */
    async editarTreinamento(t: Treinamento, mudanca: Partial<NovoTreinamento>): Promise<Treinamento> {
      const p: Record<string, unknown> = { ...mudanca }
      if (typeof p.tema === 'string') p.tema = p.tema.trim().toUpperCase()
      if (typeof p.hora_inicio === 'string') p.hora_inicio = fmtHora(p.hora_inicio)
      if (typeof p.hora_fim === 'string') p.hora_fim = fmtHora(p.hora_fim)
      const novo = await db.update<Treinamento>(TT, t.id, p)
      await sincronizarDemanda(novo)
      return novo
    },

    /**
     * Cancela o treinamento e a demanda junto. Quem cancela a aula não quer o
     * técnico dirigindo até o cliente no dia seguinte.
     *
     * A lista de presença NÃO é apagada: treinamento cancelado com gente já
     * digitada é erro de operação, e apagar o que alguém digitou esconde o erro
     * em vez de mostrá-lo.
     */
    async cancelarTreinamento(t: Treinamento, motivo: string | null): Promise<Treinamento> {
      const p: Record<string, unknown> = { status: 'CANCELADO' }
      if (motivo) p.observacao = motivo
      const novo = await db.update<Treinamento>(TT, t.id, p)
      if (t.demanda_id) {
        try { await patch(t.demanda_id, { status: 'CANCELADO', ordem_parada: null, observacao: motivo || 'Treinamento cancelado' }) }
        catch { /* a demanda pode ter sido excluída à mão */ }
      }
      return novo
    },

    /**
     * Dá o treinamento por realizado e encerra a demanda.
     *
     * A demanda também é finalizada aqui, e não só pelo técnico no `Meu roteiro`:
     * quem digita a lista de presença assinada está afirmando que a aula aconteceu,
     * o que é uma prova mais forte que um toque na tela. Se o técnico já tiver
     * finalizado, o patch é inócuo.
     */
    async concluirTreinamento(t: Treinamento): Promise<Treinamento> {
      const novo = await db.update<Treinamento>(TT, t.id, { status: 'REALIZADO' })
      if (t.demanda_id) {
        try { await patch(t.demanda_id, { status: 'FINALIZADO' }) }
        catch { /* a demanda pode ter sido excluída à mão */ }
      }
      return novo
    },

    /** Volta um treinamento realizado ou cancelado para a agenda. */
    async reabrirTreinamento(t: Treinamento): Promise<Treinamento> {
      const novo = await db.update<Treinamento>(TT, t.id, { status: 'AGENDADO' })
      await sincronizarDemanda(novo)
      return novo
    },

    async excluirTreinamento(t: Treinamento): Promise<void> {
      // A demanda vai junto: ela existe só para levar o instrutor a um treinamento
      // que deixou de existir. As presenças caem pelo `on delete cascade` da 0016.
      if (t.demanda_id) { try { await db.remove(T, t.demanda_id) } catch { /* segue */ } }
      await db.remove(TT, t.id)
    },

    /**
     * Põe alguém na lista de presença, cadastrando a pessoa se ela ainda não existir.
     *
     * A pessoa é procurada primeiro pelo CPF e depois pelo nome dentro do cliente —
     * a mesma ordem das duas chaves únicas da 0016. É isso que faz o encarregado que
     * volta ao terceiro treinamento do ano ser a MESMA linha, com o nome escrito de
     * um jeito só nos três certificados.
     */
    async adicionarPresenca(
      treinamento: Treinamento,
      pessoa: { nome: string; documento: string | null; cargo: string | null },
      conhecidos: Participante[],
      jaNaLista: Presenca[],
    ): Promise<{ participante: Participante; presenca: Presenca }> {
      const nome = pessoa.nome.trim().replace(/\s+/g, ' ')
      if (nome.length < 3) throw new DbError('Informe o nome completo do participante.')
      const doc = soDigitos(pessoa.documento) || null
      // Vazio pode; errado não — o CPF vai impresso no certificado (ver lib/treinamentos.ts).
      if (doc && !cpfValido(doc)) throw new DbError('CPF inválido. Confira os números ou deixe o campo em branco.')

      let participante =
        (doc && conhecidos.find(p => p.documento === doc)) ||
        conhecidos.find(p => !p.documento && normalizar(p.nome) === normalizar(nome) && p.cliente_id === treinamento.cliente_id)

      if (participante) {
        // Completar o cadastro de quem já existe: o CPF que faltava, o cargo novo.
        const p: Record<string, unknown> = {}
        if (doc && !participante.documento) p.documento = doc
        if (pessoa.cargo && !participante.cargo) p.cargo = pessoa.cargo.trim().toUpperCase()
        if (!participante.cliente_id && treinamento.cliente_id) p.cliente_id = treinamento.cliente_id
        if (Object.keys(p).length) participante = await db.update<Participante>('participantes', participante.id, p)
      } else {
        const [novo] = await db.insert<Participante>('participantes', [{
          nome: nome.toUpperCase(),
          documento: doc,
          cargo: pessoa.cargo?.trim().toUpperCase() || null,
          cliente_id: treinamento.cliente_id,
          criado_automaticamente: true,
        }])
        participante = novo
      }

      const repetido = jaNaLista.find(x => x.participante_id === participante!.id)
      if (repetido) throw new DbError(`${participante.nome} já está nesta lista.`)

      const [presenca] = await db.insert<Presenca>('presencas', [{
        treinamento_id: treinamento.id, participante_id: participante.id, presente: true,
      }])
      return { participante, presenca }
    },

    async marcarPresenca(id: string, presente: boolean): Promise<Presenca> {
      return db.update<Presenca>('presencas', id, { presente })
    },

    async removerPresenca(id: string): Promise<void> {
      return db.remove('presencas', id)
    },

    async editarParticipante(id: string, p: Partial<Participante>): Promise<Participante> {
      const doc = p.documento === undefined ? undefined : (soDigitos(p.documento) || null)
      if (doc && !cpfValido(doc)) throw new DbError('CPF inválido. Confira os números ou deixe o campo em branco.')
      const patchP: Record<string, unknown> = {}
      if (p.nome !== undefined) patchP.nome = p.nome.trim().replace(/\s+/g, ' ').toUpperCase()
      if (doc !== undefined) patchP.documento = doc
      if (p.cargo !== undefined) patchP.cargo = p.cargo?.trim().toUpperCase() || null
      // Deixou de ser um nome que o sistema inventou sozinho: alguém conferiu.
      patchP.criado_automaticamente = false
      return db.update<Participante>('participantes', id, patchP)
    },

    /** Registra que o certificado saiu. Responde "já mandei o dele?" sem depender de memória. */
    async registrarCertificados(ids: string[]): Promise<Presenca[]> {
      if (!ids.length) return []
      return db.updateMany<Presenca>('presencas', ids, { certificado_em: new Date().toISOString() })
    },
  }
}

export type Acoes = ReturnType<typeof criarAcoes>
