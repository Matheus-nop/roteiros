import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Inbox, CalendarRange, Route, PackageCheck, Truck, Map, ClipboardCheck, Clock, Users, Database, History, LogOut, RefreshCw, Plus, ChevronDown, Menu, X, Wifi, WifiOff, Smartphone } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Marca } from './Logo'
import { useAuth } from '../hooks/useAuth'
import { useData } from '../hooks/useData'
import { PAPEL_LABEL } from '../lib/status'
import type { Papel } from '../lib/types'
import { cx } from './ui'
import { ModalNovaDemanda } from './FormDemanda'
import { usePwa } from '../hooks/usePwa'

type ItemMenu = { to: string; rotulo: string; icone: typeof Inbox; papeis?: Papel[]; sep?: boolean }

const MENU: ItemMenu[] = [
  { to: '/meu-roteiro', rotulo: 'Meu roteiro', icone: Map, papeis: ['TECNICO'] },
  { to: '/', rotulo: 'Dashboard', icone: LayoutDashboard, papeis: ['ADMIN', 'PCM', 'COMERCIAL', 'EXPEDICAO'] },
  { to: '/fila', rotulo: 'Fila', icone: Inbox, papeis: ['ADMIN', 'PCM', 'COMERCIAL'], sep: true },
  { to: '/planejamento', rotulo: 'Planejamento', icone: CalendarRange, papeis: ['ADMIN', 'PCM', 'COMERCIAL'] },
  { to: '/pre-roteiro', rotulo: 'Pré-roteiro', icone: Route, papeis: ['ADMIN', 'PCM'] },
  { to: '/expedicao', rotulo: 'Expedição', icone: PackageCheck, papeis: ['ADMIN', 'PCM', 'EXPEDICAO'] },
  { to: '/pre-carga', rotulo: 'Pré-carga', icone: Truck, papeis: ['ADMIN', 'PCM', 'EXPEDICAO'] },
  { to: '/roteiro', rotulo: 'Roteiro', icone: Map, papeis: ['ADMIN', 'PCM', 'COMERCIAL', 'EXPEDICAO'] },
  { to: '/imp-tecnico', rotulo: 'Imp. técnico', icone: ClipboardCheck, papeis: ['ADMIN', 'PCM', 'EXPEDICAO'] },
  { to: '/pendencias', rotulo: 'Pendências', icone: Clock, papeis: ['ADMIN', 'PCM', 'COMERCIAL'] },
  { to: '/tecnicos', rotulo: 'Técnicos', icone: Users, papeis: ['ADMIN', 'PCM'], sep: true },
  { to: '/cadastros', rotulo: 'Cadastros', icone: Database, papeis: ['ADMIN', 'PCM'] },
  { to: '/historico', rotulo: 'Histórico', icone: History, papeis: ['ADMIN', 'PCM', 'COMERCIAL', 'EXPEDICAO'] },
]

export function Layout() {
  const { usuario, sair, modoDemo, pode } = useAuth()
  const { conectado, recarregar, carregando } = useData()
  const { podeInstalar, instalar, temAtualizacao, atualizar } = usePwa()
  const [nova, setNova] = useState(false)
  const [menu, setMenu] = useState(false)
  const [gaveta, setGaveta] = useState(false)
  const nav = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const papel = usuario?.perfil.papel
  const itens = MENU.filter(m => !m.papeis || !papel || m.papeis.includes(papel))
  const inicio = papel === 'TECNICO' ? '/meu-roteiro' : '/'

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f7fa]">
      {/* Barra superior: identidade à esquerda, estado e ações à direita. */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 bg-gradient-to-r from-brand-800 via-brand-700 to-brand-600 px-3 text-white shadow-sm print:hidden sm:gap-3 sm:px-4">
        <button onClick={() => setGaveta(true)} className="-ml-1 rounded-lg p-2 hover:bg-white/10 lg:hidden" aria-label="Abrir menu"><Menu size={18} /></button>
        <button onClick={() => nav(inicio)} className="flex min-w-0 items-center rounded-lg py-1 pr-1 transition hover:opacity-90" aria-label="Ir para o início"><Marca /></button>
        {modoDemo && <span className="hidden shrink-0 rounded-full bg-acento-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-acento-300 ring-1 ring-acento-400/30 sm:inline">Demo</span>}

        <div className="flex-1" />

        <span
          className={cx('hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 xl:flex',
            conectado ? 'bg-emerald-400/15 text-emerald-200 ring-emerald-400/25' : 'bg-red-400/15 text-red-200 ring-red-400/30')}
          title={conectado ? 'Tempo real ativo' : 'Sem tempo real · a tela atualiza a cada 30s'}>
          {conectado ? <Wifi size={12} /> : <WifiOff size={12} />}{conectado ? 'Ao vivo' : 'Sem tempo real'}
        </span>

        <button onClick={() => recarregar()} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-[12px] font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/20" title="Forçar atualização">
          <RefreshCw size={13} className={carregando ? 'animate-spin' : ''} /><span className="hidden xl:inline">Atualizar</span>
        </button>

        {pode('fila.lancar') && (
          <button onClick={() => setNova(true)} className="flex shrink-0 items-center gap-1 rounded-lg bg-acento-500 px-2.5 py-1.5 text-[12px] font-bold text-brand-900 shadow-sm transition hover:bg-acento-400 lg:px-3" title="Lançar nova demanda">
            <Plus size={14} /><span className="hidden whitespace-nowrap lg:inline">Nova demanda</span>
          </button>
        )}

        <div className="relative shrink-0" ref={ref}>
          <button onClick={() => setMenu(m => !m)} className="flex items-center gap-1.5 rounded-lg p-1 transition hover:bg-white/10">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-[12px] font-bold uppercase ring-1 ring-white/20">{(usuario?.perfil.nome ?? usuario?.email ?? '?').slice(0, 1)}</span>
            <ChevronDown size={13} className="opacity-70" />
          </button>
          {menu && (
            <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl bg-white text-slate-800 shadow-xl ring-1 ring-slate-200">
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="truncate text-sm font-semibold">{usuario?.perfil.nome ?? usuario?.email}</div>
                <div className="mt-0.5 truncate text-xs text-slate-500">{usuario?.email}</div>
                <div className="mt-2 inline-flex rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700 ring-1 ring-brand-100">
                  {usuario?.semPerfil ? 'Sem perfil' : papel ? PAPEL_LABEL[papel] : '—'}
                </div>
              </div>
              <div className="p-1">
                {podeInstalar && (
                  <button onClick={() => { instalar(); setMenu(false) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium hover:bg-slate-100">
                    <Smartphone size={14} className="text-brand-600" />Instalar o app
                  </button>
                )}
                <button onClick={sair} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-slate-100"><LogOut size={14} />Sair</button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Navegação: abas em telas grandes, gaveta no celular. */}
      <nav className="sticky top-14 z-30 hidden border-b border-slate-200 bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)] print:hidden lg:block">
        <div className="rolagem-fina mx-auto flex max-w-[1800px] items-center overflow-x-auto px-2">
          {itens.map(m => (
            <div key={m.to} className="flex items-center">
              {m.sep && <span className="mx-1.5 h-5 w-px bg-slate-200" />}
              <NavLink to={m.to} end={m.to === '/'}
                className={({ isActive }) => cx('relative flex items-center gap-1.5 whitespace-nowrap px-3 py-3 text-[13px] font-medium transition',
                  isActive ? 'text-brand-700' : 'text-slate-500 hover:text-slate-900')}>
                {({ isActive }) => (<>
                  <m.icone size={15} className={isActive ? 'text-brand-600' : 'opacity-70'} />{m.rotulo}
                  <span className={cx('absolute inset-x-2 bottom-0 h-[2.5px] rounded-t-full transition', isActive ? 'bg-acento-500' : 'bg-transparent')} />
                </>)}
              </NavLink>
            </div>
          ))}
        </div>
      </nav>

      {/* Gaveta de navegação (celular e tablet) */}
      {gaveta && (
        <div className="fixed inset-0 z-50 lg:hidden print:hidden" onMouseDown={e => { if (e.target === e.currentTarget) setGaveta(false) }}>
          <div className="absolute inset-0 bg-slate-900/50" />
          <div className="pt-segura absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col bg-white shadow-2xl">
            <div className="flex h-14 items-center justify-between bg-gradient-to-r from-brand-800 to-brand-600 px-3 text-white">
              <Marca />
              <button onClick={() => setGaveta(false)} className="rounded-lg p-2 hover:bg-white/10" aria-label="Fechar menu"><X size={18} /></button>
            </div>
            <div className="rolagem-fina flex-1 overflow-y-auto p-2">
              {itens.map(m => (
                <div key={m.to}>
                  {m.sep && <div className="my-1.5 border-t border-slate-100" />}
                  <NavLink to={m.to} end={m.to === '/'} onClick={() => setGaveta(false)}
                    className={({ isActive }) => cx('toque flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition',
                      isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50')}>
                    <m.icone size={17} className="opacity-80" />{m.rotulo}
                  </NavLink>
                </div>
              ))}
            </div>
            <div className="pb-segura border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
              {usuario?.perfil.nome ?? usuario?.email} · {papel ? PAPEL_LABEL[papel] : '—'}
            </div>
          </div>
        </div>
      )}

      {temAtualizacao && (
        <div className="flex items-center justify-center gap-3 bg-brand-700 px-4 py-2 text-[13px] text-white print:hidden">
          <span>Uma versão nova do app está pronta.</span>
          <button onClick={atualizar} className="rounded-md bg-acento-500 px-2.5 py-1 text-[12px] font-bold text-brand-900 hover:bg-acento-400">Atualizar agora</button>
        </div>
      )}

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
