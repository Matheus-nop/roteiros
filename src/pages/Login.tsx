import { useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Logo } from '../components/Logo'
import { Botao, Campo, Input } from '../components/ui'
import type { Papel } from '../lib/types'
import { PAPEL_LABEL } from '../lib/status'

export function Login() {
  const { entrar, entrarDemo, modoDemo } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErro(null); setCarregando(true)
    try { await entrar(email, senha) } catch (err) { setErro((err as Error).message) } finally { setCarregando(false) }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center"><Logo altura={44} /></div>
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h1 className="text-base font-semibold text-slate-900">Entrar</h1>
          <p className="mt-0.5 text-sm text-slate-500">Gestão de roteiros, expedição e execução técnica.</p>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <Campo rotulo="E-mail"><Input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required /></Campo>
            <Campo rotulo="Senha"><Input type="password" value={senha} onChange={e => setSenha(e.target.value)} autoComplete="current-password" required /></Campo>
            {erro && <p className="text-sm text-red-700">{erro}</p>}
            <Botao type="submit" variante="primario" className="w-full justify-center" disabled={carregando}>{carregando ? 'Entrando…' : 'Entrar'}</Botao>
          </form>
        </div>
        {modoDemo && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-medium">Modo demonstração (sem Supabase)</p>
            <p className="mt-1 text-xs text-amber-800">Dados fictícios salvos só neste navegador. Configure <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> no <code>.env</code> para usar o banco real.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(['ADMIN', 'PCM', 'COMERCIAL', 'EXPEDICAO', 'TECNICO'] as Papel[]).map(p => (
                <Botao key={p} tamanho="sm" onClick={() => entrarDemo(p)}>{PAPEL_LABEL[p]}</Botao>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
