// As localidades que a equipe já usou, mais usadas primeiro.
//
// Vem da view `v_localidades` (migração 0006), que lê TODAS as demandas — inclusive as
// arquivadas. Isso importa: um corte que manda tudo para o histórico zeraria a sugestão
// se ela saísse só das demandas ativas, e o comercial voltaria a digitar do zero
// justamente no dia em que o vocabulário mais importa.
import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib'
import { useData } from './useData'

type LinhaLocalidade = { nome: string; usos: number }

export function useLocalidades(): string[] {
  const { demandas } = useData()
  const [daView, setDaView] = useState<string[] | null>(null)

  useEffect(() => {
    let vivo = true
    db.select<LinhaLocalidade>('v_localidades', { order: [{ col: 'usos', asc: false }] })
      .then(r => { if (vivo) setDaView(r.map(x => x.nome).filter(Boolean)) })
      // View ainda não criada (migração 0006 não rodou): cai no que está carregado.
      .catch(() => { if (vivo) setDaView(null) })
    return () => { vivo = false }
  }, [])

  // Reserva: as localidades das demandas em memória. Menos completa, mas nunca vazia
  // enquanto houver demanda ativa — e não deixa o campo sem sugestão nenhuma.
  const daMemoria = useMemo(() => {
    const contagem = new Map<string, number>()
    for (const d of demandas) if (d.local) contagem.set(d.local, (contagem.get(d.local) ?? 0) + 1)
    return Array.from(contagem.entries()).sort((a, b) => b[1] - a[1]).map(([nome]) => nome)
  }, [demandas])

  // Junta as duas: a view manda na ordem, a memória cobre o que acabou de ser lançado
  // e ainda não entrou na view (ela só é reconsultada ao montar a tela).
  return useMemo(() => {
    const vistos = new Set<string>()
    const saida: string[] = []
    for (const n of [...(daView ?? []), ...daMemoria]) {
      const chave = n.trim().toUpperCase()
      if (!chave || vistos.has(chave)) continue
      vistos.add(chave); saida.push(n)
    }
    return saida
  }, [daView, daMemoria])
}
