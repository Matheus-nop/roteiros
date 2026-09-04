// Demandas já encerradas (finalizadas/canceladas) de uma ou mais datas.
//
// O `useData` carrega só as ativas — é o que faz as telas do PCM não incharem. Mas quem
// mede execução precisa das encerradas: sem elas o item some ao ser concluído, a lista
// encolhe sem explicar por quê e não há como dizer "5 de 8".
import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../lib'
import { STATUS_ARQUIVADOS } from '../lib/status'
import type { Demanda } from '../lib/types'

/**
 * @param datas   datas planejadas a consultar; vazio devolve vazio.
 * @param tecnicoId  de quem são as demandas; `null` só faz sentido com `todosOsTecnicos`.
 * @param todosOsTecnicos  ignora `tecnicoId` e traz as datas inteiras (uso do dashboard).
 */
export function useEncerradas(datas: string[], tecnicoId: string | null, todosOsTecnicos = false) {
  const [linhas, setLinhas] = useState<Demanda[]>([])
  const alvo = todosOsTecnicos ? null : tecnicoId
  // Array novo a cada render entraria em laço como dependência; a chave é estável.
  const chave = useMemo(() => datas.filter(Boolean).sort().join('|'), [datas])

  const carregar = useCallback(async () => {
    const lista = chave ? chave.split('|') : []
    if (!lista.length || (!todosOsTecnicos && !alvo)) { setLinhas([]); return }
    try {
      setLinhas(await db.select<Demanda>('demandas', {
        eq: alvo ? { tecnico_id: alvo } : undefined,
        in: { status: STATUS_ARQUIVADOS, data_planejada: lista },
        order: [{ col: 'ordem_parada' }],
      }))
    } catch { /* offline ou sem permissão: a tela segue com as ativas */ }
  }, [chave, alvo, todosOsTecnicos])

  useEffect(() => {
    let vivo = true
    const puxar = () => { if (vivo) carregar() }
    puxar()
    // Só recarrega quando o evento interessa — senão qualquer escrita dispararia uma consulta.
    const off = db.subscribe<Demanda>('demandas', e => {
      const linha = e.novo ?? e.antigo
      if (!linha || !alvo || linha.tecnico_id === alvo) puxar()
    })
    return () => { vivo = false; off() }
  }, [carregar, alvo])

  return linhas
}
