import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Inbox, CalendarRange, Route, PackageCheck, Truck, Map, ClipboardCheck, Clock, Users, Database, History, LogOut, RefreshCw, Plus, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Logo } from './Logo'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { PAPEL_LABEL } from '../lib/status'
import type { Papel } from '../lib/types'
import { cx } from './ui'
import { ModalNovaDemanda } from './FormDemanda'

const MENU: { to: string; rotulo: string; icone: typeof Inbox; papeis?: Papel[]; sep?: boolean }[] = [
  { to: '/', rotulo: 'Dashboard', icone: LayoutDashboard },
  { to: '/fila', rotulo: 'Fila', icone: Inbox, papeis: ['ADMIN', 'PCM', 'COMERCIAL'], sep: true },
  { to: '/planejamento', rotulo: 'Planejamento', icone: CalendarRange, papeis: ['ADMIN', 'PCM', 'COMERCIAL'] },
  { to: '/pre-roteiro', rotulo: 'Pré-roteiro', icone: Route, papeis: ['ADMIN', 'PCM'] },
  { to: '/expedicao', rotulo: 'Expedição', icone: PackageCheck, papeis: ['ADMIN', 'PCM', 'EXPEDICAO'] },
  { to: '/pre-carga', rotulo: 'Pré-carga', icone: Truck, papeis: ['ADMIN', 'PCM', 'EXPEDICAO'] },
  { to: '/roteiro', rotulo: 'Roteiro', icone: Map },
  { to: '/imp-tecnico', rotulo: 'Imp. técnico', icone: ClipboardCheck },
  { to: '/pendencias', rotulo: 'Pendências', icone: Clock, papeis: ['ADMIN', 'PCM', 'COMERCIAL'] },
  { to: '/tecnicos', rotulo: 'Técnicos', icone: Users, papeis: ['ADMIN', 'PCM'], sep: true },
  { to: '/cadastros', rotulo: 'Cadastros', icone: Database, papeis: ['ADMIN', 'PCM'] },
  { to: '/historico', rotulo: 'Histórico', icone: History, papeis: ['ADMIN', 'PCM', 'COMERCIAL', 'EXPEDICAO'] },
]

export function Layout() {
  const { usuario, sair, modoDemo, pode } = useAuth()
  const { conectado, recarregar, carregando } = useData()
  const [nova, setNova] = useState(false)
  const [menu, setMenu] = useState(false)
  const nav = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const papel = usuario?.perfil.papel
  const itens = MENU.filter(m => !m.papeis || !papel || m.papeis.includes(papel))

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f7fa]">
      {/* Barra superior */}
      <header className="sticky top-0 z-40 flex h-[52px] items-center gap-3 bg-[#1e293b] px-4 text-white print:hidden">
        <button onClick={() => nav('/')} className="flex items-center gap-3"><Logo claro altura={30} /></button>
        <span className="hidden text-[14px] font-semibold tracking-tight sm:block">Gestão de roteiros</span>
        {modoDemo && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200">Demo</span>}
        <div className="flex-1" />
        <span className="hidden items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium sm:flex" title={conectado ? 'Tempo real ativo' : 'Sem tempo real · atualiza a cada 30s'}>
          <span className={cx('h-2 w-2 rounded-full', conectado ? 'bg-emerald-400' : 'bg-red-400')} />{conectado ? 'Conectado' : 'Sem atualização automática'}
        </span>
        <button onClick={() => recarregar()} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-800 hover:bg-slate-100" title="Forçar atualização">
          <RefreshCw size={13} className={carregando ? 'animate-spin' : ''} /><span className="hidden sm:inline">Atualizar</span>
        </button>
        {pode('fila.lancar') && (
          <button onClick={() => setNova(true)} className="flex items-center gap-1 rounded-lg bg-[#1a56db] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#1748c9]">
            <Plus size={14} />Nova demanda
          </button>
        )}
        <div className="relative" ref={ref}>
          <button onClick={() => setMenu(m => !m)} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] hover:bg-white/10">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-[11px] font-bold uppercase">{(usuario?.perfil.nome ?? usuario?.email ?? '?').slice(0, 1)}</span>
            <ChevronDown size={13} className="opacity-70" />
          </button>
          {menu && (
            <div className="absolute right-0 mt-1 w-56 rounded-lg bg-white p-1 text-slate-800 shadow-xl ring-1 ring-slate-200">
              <div className="px-3 py-2 text-xs"><div className="truncate font-semibold">{usuario?.perfil.nome ?? usuario?.email}</div><div className="text-slate-500">{usuario?.semPerfil ? 'Sem perfil' : papel ? PAPEL_LABEL[papel] : ''}</div></div>
              <button onClick={sair} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-slate-100"><LogOut size={13} />Sair</button>
            </div>
          )}
        </div>
      </header>

      {/* Abas */}
      <nav className="sticky top-[52px] z-30 border-b border-slate-200 bg-white print:hidden">
        <div className="flex overflow-x-auto px-2 [scrollbar-width:thin]">
          {itens.map(m => (
            <div key={m.to} className="flex items-center">
              {m.sep && <span className="mx-1 h-5 w-px bg-slate-200" />}
              <NavLink to={m.to} end={m.to === '/'}
                className={({ isActive }) => cx('flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-[13px] font-medium transition',
                  isActive ? 'border-[#1a56db] text-[#1a56db]' : 'border-transparent text-slate-500 hover:text-slate-800')}>
                <m.icone size={15} className="opacity-80" />{m.rotulo}
              </NavLink>
            </div>
          ))}
        </div>
      </nav>

      {usuario?.semPerfil && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 print:hidden">
          <b>Seu usuário ainda não tem perfil.</b> Nada pode ser gravado até um administrador criar sua linha em <code>perfis</code>
          (rodar de novo a migração <code>0001_schema.sql</code> no Supabase resolve: ela cria os perfis que faltam).
        </div>
      )}
      <main className="flex-1"><Outlet /></main>
      <ModalNovaDemanda aberto={nova} onFechar={() => setNova(false)} />
    </div>
  )
}
