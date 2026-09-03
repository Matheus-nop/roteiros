import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Inbox, CalendarRange, Route, PackageCheck, Truck, Map, ClipboardCheck, Clock, Users, Database, History, LogOut, RefreshCw, Wifi, WifiOff, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { Logo } from './Logo'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { PAPEL_LABEL } from '../lib/status'
import type { Papel } from '../lib/types'
import { cx } from './ui'

const MENU: { to: string; rotulo: string; icone: typeof Inbox; papeis?: Papel[] }[] = [
  { to: '/', rotulo: 'Dashboard', icone: LayoutDashboard },
  { to: '/fila', rotulo: 'Fila', icone: Inbox, papeis: ['ADMIN', 'PCM', 'COMERCIAL'] },
  { to: '/planejamento', rotulo: 'Planejamento', icone: CalendarRange, papeis: ['ADMIN', 'PCM', 'COMERCIAL'] },
  { to: '/pre-roteiro', rotulo: 'Pré-roteiro', icone: Route, papeis: ['ADMIN', 'PCM'] },
  { to: '/expedicao', rotulo: 'Expedição', icone: PackageCheck, papeis: ['ADMIN', 'PCM', 'EXPEDICAO'] },
  { to: '/pre-carga', rotulo: 'Pré-carga', icone: Truck, papeis: ['ADMIN', 'PCM', 'EXPEDICAO'] },
  { to: '/roteiro', rotulo: 'Roteiro', icone: Map },
  { to: '/imp-tecnico', rotulo: 'Imp. técnico', icone: ClipboardCheck },
  { to: '/pendencias', rotulo: 'Pendências', icone: Clock, papeis: ['ADMIN', 'PCM', 'COMERCIAL'] },
  { to: '/tecnicos', rotulo: 'Técnicos', icone: Users, papeis: ['ADMIN', 'PCM'] },
  { to: '/cadastros', rotulo: 'Cadastros', icone: Database, papeis: ['ADMIN', 'PCM'] },
  { to: '/historico', rotulo: 'Histórico', icone: History, papeis: ['ADMIN', 'PCM', 'COMERCIAL', 'EXPEDICAO'] },
]

export function Layout() {
  const { usuario, sair, modoDemo } = useAuth()
  const { conectado, ultimaAtualizacao, recarregar, carregando } = useData()
  const [aberto, setAberto] = useState(false)
  const papel = usuario?.perfil.papel
  const itens = MENU.filter(m => !m.papeis || !papel || m.papeis.includes(papel))

  const nav = (
    <nav className="flex-1 space-y-0.5 px-2 py-2">
      {itens.map(m => (
        <NavLink key={m.to} to={m.to} end={m.to === '/'} onClick={() => setAberto(false)}
          className={({ isActive }) => cx('flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition',
            isActive ? 'bg-white/10 text-white' : 'text-brand-100/80 hover:bg-white/5 hover:text-white')}>
          <m.icone size={16} className="shrink-0 opacity-80" />{m.rotulo}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className="flex min-h-screen">
      {/* Sidebar desktop */}
      <aside className="hidden w-56 shrink-0 flex-col bg-brand-800 print:hidden lg:flex">
        <div className="border-b border-white/10 px-4 py-4"><Logo claro /></div>
        {nav}
        <div className="border-t border-white/10 px-3 py-3 text-xs text-brand-100/80">
          <div className="truncate font-medium text-white">{usuario?.perfil.nome ?? usuario?.email}</div>
          <div className="mt-0.5 flex items-center justify-between">
            <span>{usuario?.semPerfil ? 'Sem perfil' : papel ? PAPEL_LABEL[papel] : ''}</span>
            <button onClick={sair} className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/10" title="Sair"><LogOut size={13} />Sair</button>
          </div>
        </div>
      </aside>

      {/* Sidebar mobile */}
      {aberto && (
        <div className="fixed inset-0 z-40 flex lg:hidden print:hidden">
          <div className="flex w-64 flex-col bg-brand-800">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4"><Logo claro /><button onClick={() => setAberto(false)} className="text-white"><X size={18} /></button></div>
            {nav}
            <div className="border-t border-white/10 px-3 py-3 text-xs text-brand-100/80">
              <div className="truncate font-medium text-white">{usuario?.perfil.nome ?? usuario?.email}</div>
              <button onClick={sair} className="mt-1 flex items-center gap-1"><LogOut size={13} />Sair</button>
            </div>
          </div>
          <div className="flex-1 bg-slate-900/50" onClick={() => setAberto(false)} />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur print:hidden">
          <div className="flex items-center gap-3">
            <button className="rounded p-1 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setAberto(true)}><Menu size={18} /></button>
            <div className="lg:hidden"><Logo tamanho={22} /></div>
            {modoDemo && <span className="rounded bg-accent/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">Modo demonstração</span>}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="hidden items-center gap-1.5 sm:flex" title={ultimaAtualizacao ? `Última atualização ${ultimaAtualizacao.toLocaleTimeString('pt-BR')}` : ''}>
              {conectado ? <Wifi size={14} className="text-emerald-600" /> : <WifiOff size={14} className="text-red-600" />}
              {conectado ? 'Tempo real' : 'Sem tempo real · atualiza a cada 30s'}
            </span>
            <button onClick={() => recarregar()} className="flex items-center gap-1 rounded px-2 py-1 hover:bg-slate-100" title="Forçar atualização">
              <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} /> Atualizar
            </button>
          </div>
        </header>
        {usuario?.semPerfil && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 print:hidden">
            <b>Seu usuário ainda não tem perfil.</b> Nada pode ser gravado até um administrador criar sua linha em <code>perfis</code>
            (rodar de novo a migração <code>0001_schema.sql</code> no Supabase resolve: ela cria os perfis que faltam).
          </div>
        )}
        <main className="flex-1"><Outlet /></main>
      </div>
    </div>
  )
}
