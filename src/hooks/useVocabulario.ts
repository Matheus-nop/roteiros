// O vocabulário que a equipe já usou — mais usado primeiro.
//
// Vale para localidade, cliente e equipamento. Os três são campos onde a ordem
// alfabética é a pior ordem possível: quem lança dez demandas por dia digita quase
// sempre os mesmos cinco nomes, e "AGUAS DO RIO" no topo vale mais que "ACQUA" só por
// começar com A.
//
// Cada um vem de uma view (`v_localidades` da 0006, `v_clientes_uso` e
// `v_equipamentos_uso` da 0008) que lê TODAS as demandas — inclusive as arquivadas.
// Isso importa: um corte que manda tudo para o histórico zeraria a sugestão se ela
// saísse só das demandas ativas, e o comercial voltaria a digitar do zero justamente no
// dia em que o vocabulário mais importa.
import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib'
import type { Demanda } from '../lib/types'
import { useData } from './useData'

type LinhaUso = { nome: string; usos: number }

/**
 * @param view    view de uso (nome, usos), já ordenável por `usos`.
 * @param extrair de onde tirar o mesmo nome numa demanda em memória (reserva).
 */
function useMaisUsados(view: string, extrair: (d: Demanda) => string | null): string[] {
  const { demandas } = useData()
  const [daView, setDaView] = useState<string[] | null>(null)

  useEffect(() => {
    let vivo = true
    db.select<LinhaUso>(view, { order: [{ col: 'usos', asc: false }] })
      .then(r => { if (vivo) setDaView(r.map(x => x.nome).filter(Boolean)) })
      // View ainda não criada (a migração não rodou): cai no que está carregado.
      .catch(() => { if (vivo) setDaView(null) })
    return () => { vivo = false }
  }, [view])

  // Reserva: o que está nas demandas em memória. Menos completa, mas nunca vazia
  // enquanto houver demanda ativa — e não deixa o campo sem sugestão nenhuma.
  const daMemoria = useMemo(() => {
    const contagem = new Map<string, number>()
    for (const d of demandas) {
      const n = extrair(d)
      if (n) contagem.set(n, (contagem.get(n) ?? 0) + 1)
    }
    return Array.from(contagem.entries()).sort((a, b) => b[1] - a[1]).map(([nome]) => nome)
    // `extrair` é uma função nova a cada render; a lista de demandas é o que muda de verdade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demandas])

  // Junta as duas: a view manda na ordem, a memória cobre o que acabou de ser lançado
  // e ainda não entrou na view (ela só é reconsultada ao montar a tela).
  return useMemo(() => juntarSemRepetir(daView ?? [], daMemoria), [daView, daMemoria])
}

/** Concatena listas de nomes descartando repetição (comparação sem caixa nem espaço). */
export function juntarSemRepetir(...listas: string[][]): string[] {
  const vistos = new Set<string>()
  const saida: string[] = []
  for (const lista of listas) {
    for (const n of lista) {
      // `?? ''`: uma linha de cadastro antiga pode vir sem `apelidos`, e aí a lista
      // recebe `undefined` no meio. Uma sugestão não pode derrubar o formulário.
      const chave = (n ?? '').trim().toUpperCase()
      if (!chave || vistos.has(chave)) continue
      vistos.add(chave); saida.push(n)
    }
  }
  return saida
}

export const useLocalidades = () => useMaisUsados('v_localidades', d => d.local)
export const useClientesMaisUsados = () => useMaisUsados('v_clientes_uso', d => d.cliente_nome)
export const useEquipamentosMaisUsados = () => useMaisUsados('v_equipamentos_uso', d => d.equipamento_nome)
