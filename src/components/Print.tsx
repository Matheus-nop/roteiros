// Impressão: renderiza o conteúdo em #print-root e chama window.print().
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const Ctx = createContext<{ imprimir(node: ReactNode): void } | null>(null)

export function PrintProvider({ children }: { children: ReactNode }) {
  const [conteudo, setConteudo] = useState<ReactNode>(null)
  const imprimir = useCallback((node: ReactNode) => setConteudo(node), [])
  useEffect(() => {
    if (!conteudo) return
    const t = setTimeout(() => {
      window.print()
      setTimeout(() => setConteudo(null), 300)
    }, 150)
    return () => clearTimeout(t)
  }, [conteudo])
  const root = typeof document !== 'undefined' ? document.getElementById('print-root') : null
  return (
    <Ctx.Provider value={{ imprimir }}>
      {children}
      {conteudo && root && createPortal(conteudo, root)}
    </Ctx.Provider>
  )
}

export function usePrint() {
  const c = useContext(Ctx)
  if (!c) throw new Error('usePrint fora do PrintProvider')
  return c
}
