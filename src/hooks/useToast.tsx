import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Toast = { id: number; tipo: 'ok' | 'erro' | 'info'; texto: string }
interface ToastCtx { toast(texto: string, tipo?: Toast['tipo']): void; erro(e: unknown): void }
const Ctx = createContext<ToastCtx | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Toast[]>([])
  const toast = useCallback((texto: string, tipo: Toast['tipo'] = 'ok') => {
    const id = Date.now() + Math.random()
    setLista(l => [...l, { id, tipo, texto }])
    setTimeout(() => setLista(l => l.filter(t => t.id !== id)), tipo === 'erro' ? 7000 : 3500)
  }, [])
  const erro = useCallback((e: unknown) => toast(e instanceof Error ? e.message : String(e), 'erro'), [toast])
  return (
    <Ctx.Provider value={{ toast, erro }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2 print:hidden">
        {lista.map(t => (
          <div key={t.id} className={
            'pointer-events-auto rounded-md px-4 py-2.5 text-sm shadow-lg ring-1 ' +
            (t.tipo === 'erro' ? 'bg-red-600 text-white ring-red-700' : t.tipo === 'info' ? 'bg-slate-800 text-white ring-slate-900' : 'bg-emerald-600 text-white ring-emerald-700')
          }>{t.texto}</div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): ToastCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useToast fora do ToastProvider')
  return c
}
