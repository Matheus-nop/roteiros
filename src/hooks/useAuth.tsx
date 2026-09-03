import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { db, modoDemo } from '../lib'
import type { Papel, Usuario } from '../lib/types'
import { pode, type Acao } from '../lib/status'

interface AuthCtx {
  usuario: Usuario | null
  carregando: boolean
  entrar(email: string, senha: string): Promise<void>
  entrarDemo(papel: Papel): Promise<void>
  sair(): Promise<void>
  pode(acao: Acao): boolean
  modoDemo: boolean
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let ativo = true
    db.auth.usuarioAtual().then(u => { if (ativo) { setUsuario(u); setCarregando(false) } })
    const off = db.auth.onChange(u => { if (ativo) setUsuario(u) })
    return () => { ativo = false; off() }
  }, [])

  const value: AuthCtx = {
    usuario, carregando, modoDemo,
    entrar: async (e, s) => { setUsuario(await db.auth.entrar(e, s)) },
    entrarDemo: async (p) => { if (db.auth.entrarDemo) setUsuario(await db.auth.entrarDemo(p)) },
    sair: async () => { await db.auth.sair(); setUsuario(null) },
    pode: (a) => !usuario?.semPerfil && pode(usuario?.perfil.papel, a),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth fora do AuthProvider')
  return c
}
