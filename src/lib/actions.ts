// Operações de negócio sobre `demandas`. Todas identificam registros por uuid.
import type { Db } from './db'
import { DbError } from './db'
import type { Cliente, Demanda, Equipamento, Fechamento, NovaDemanda, Status, Historico, StatusSeparacao, EtiquetaAvulsa, RoteiroArquivado } from './types'
import { STATUS_ARQUIVADOS, STATUS_EM_ROTA, proximaTriagem } from './status'
import { hojeISO, normalizar, ordenarParadas } from './format'
import { contarDesfechos, montarParadas } from './arquivo'

const T = 'demandas'

export function chaveIdentidade(d: Pick<Demanda, 'om' | 'equipamento_nome' | 'patrimonio' | 'cliente_id' | 'cliente_nome'>): string {
  return [normalizar(d.om), normalizar(d.equipamento_nome), normalizar(d.patrimonio), d.cliente_id ?? normalizar(d.cliente_nome)].join('|')
}

/** Duplicidade: bloqueia só se EXATAMENTE igual (equip + patrimônio + OM + cliente) e não arquivada. */
export function encontrarDuplicata(nova: Pick<Demanda, 'om' | 'equipamento_nome' | 'patrimonio' | 'cliente_id' | 'cliente_nome'>, ativas: Demanda[]): Demanda | undefined {
  const k = chaveIdentidade(nova)
  return ativas.find(d => !STATUS_ARQUIVADOS.includes(d.status) && chaveIdentidade(d) === k)
}

export function criarAcoes(db: Db) {
  const patchMany = (ids: string[], patch: Record<string, unknown>) => db.updateMany<Demanda>(T, ids, patch)
  const patch = (id: string, p: Record<string, unknown>) => db.update<Demanda>(T, id, p)

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
    async reordenar(idsNaOrdem: string[]) {
      await Promise.all(idsNaOrdem.map((id, i) => patch(id, { ordem_parada: (i + 1) * 10 })))
    },

    /** Gera roteiro: PLANEJADO/AGUARDANDO → ROTEIRIZADO, mantendo a ordem existente e numerando quem não tem. */
    async gerarRoteiro(itens: Demanda[]) {
      const semTecnico = itens.filter(d => !d.tecnico_id || !d.data_planejada)
      if (semTecnico.length) throw new DbError(`${semTecnico.length} item(ns) sem técnico ou sem data. Atribua antes de gerar o roteiro.`)
      const ordenados = [...itens].sort(ordenarParadas)
      await Promise.all(ordenados.map((d, i) => patch(d.id, { status: 'ROTEIRIZADO', ordem_parada: (i + 1) * 10 })))
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
  }
}

export type Acoes = ReturnType<typeof criarAcoes>
