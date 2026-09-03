import { X } from 'lucide-react'
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import type { Status } from '../lib/types'
import { STATUS_LABEL, STATUS_TONE } from '../lib/status'

export function cx(...c: (string | false | null | undefined)[]) { return c.filter(Boolean).join(' ') }

type Variante = 'primario' | 'secundario' | 'perigo' | 'fantasma' | 'sucesso'
const VAR: Record<Variante, string> = {
  primario: 'bg-[#1a56db] text-white hover:bg-[#1748c9] ring-[#1a56db]',
  secundario: 'bg-white text-slate-700 hover:bg-slate-50 ring-slate-300',
  perigo: 'bg-white text-red-700 hover:bg-red-50 ring-red-200',
  fantasma: 'bg-transparent text-slate-600 hover:bg-slate-100 ring-transparent',
  sucesso: 'bg-emerald-600 text-white hover:bg-emerald-700 ring-emerald-600',
}

export function Botao({ variante = 'secundario', tamanho = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; tamanho?: 'sm' | 'md' }) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-lg font-medium ring-1 ring-inset shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50',
        tamanho === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
        VAR[variante], className,
      )}
    />
  )
}

export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx('campo', p.className)} />
}
export function Select(p: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx('campo', p.className)} />
}
export function Campo({ rotulo, children, className }: { rotulo: string; children: ReactNode; className?: string }) {
  return <label className={cx('block', className)}><span className="rotulo">{rotulo}</span>{children}</label>
}

export function Badge({ children, tone = 'bg-slate-100 text-slate-700 ring-slate-200', className }: { children: ReactNode; tone?: string; className?: string }) {
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset', tone, className)}>{children}</span>
}
export function BadgeStatus({ status }: { status: Status }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
}
export function BadgeTipo({ tipo }: { tipo: string }) {
  const tone = tipo === 'ENTREGA' || tipo === 'LOCACAO' ? 'bg-blue-50 text-blue-800 ring-blue-200'
    : tipo === 'TROCA' ? 'bg-amber-50 text-amber-800 ring-amber-200'
    : tipo.startsWith('RETORNO') ? 'bg-teal-50 text-teal-800 ring-teal-200'
    : 'bg-slate-100 text-slate-600 ring-slate-200'
  return <Badge tone={tone}>{tipo}</Badge>
}

export function Modal({ titulo, aberto, onFechar, children, rodape, largura = 'max-w-lg' }: { titulo: string; aberto: boolean; onFechar(): void; children: ReactNode; rodape?: ReactNode; largura?: string }) {
  useEffect(() => {
    if (!aberto) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [aberto, onFechar])
  if (!aberto) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-[6vh] print:hidden" onMouseDown={e => { if (e.target === e.currentTarget) onFechar() }}>
      <div className={cx('w-full rounded-lg bg-white shadow-xl ring-1 ring-slate-200', largura)}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-800">{titulo}</h2>
          <button onClick={onFechar} className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {rodape && <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 rounded-b-lg">{rodape}</div>}
      </div>
    </div>
  )
}

export function Vazio({ titulo, texto, children }: { titulo: string; texto?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <p className="text-sm font-medium text-slate-700">{titulo}</p>
      {texto && <p className="mt-1 max-w-md text-sm text-slate-500">{texto}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

export function Cartao({ children, className, titulo, acoes }: { children: ReactNode; className?: string; titulo?: ReactNode; acoes?: ReactNode }) {
  return (
    <section className={cx('rounded-xl bg-white shadow-sm ring-1 ring-slate-200', className)}>
      {(titulo || acoes) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
          <div className="text-sm font-semibold text-slate-800">{titulo}</div>
          <div className="flex flex-wrap items-center gap-2">{acoes}</div>
        </header>
      )}
      {children}
    </section>
  )
}

export function Pagina({ titulo, subtitulo, acoes, children }: { titulo: string; subtitulo?: ReactNode; acoes?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[1800px] px-4 py-4 sm:px-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">{titulo}</h1>
          {subtitulo && <p className="mt-0.5 text-[13px] text-slate-500">{subtitulo}</p>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
      {children}
    </div>
  )
}

export function Contador({ rotulo, valor, tom = 'text-slate-900', onClick }: { rotulo: string; valor: number | string; tom?: string; onClick?(): void }) {
  return (
    <button onClick={onClick} className={cx('rounded-xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-slate-200', onClick && 'hover:ring-[#1a56db]/50')}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{rotulo}</div>
      <div className={cx('mt-1 text-2xl font-semibold tabular-nums', tom)}>{valor}</div>
    </button>
  )
}

export function Confirmar({ aberto, titulo, texto, onConfirmar, onFechar, perigo, confirmarTexto = 'Confirmar' }: { aberto: boolean; titulo: string; texto: ReactNode; onConfirmar(): void; onFechar(): void; perigo?: boolean; confirmarTexto?: string }) {
  return (
    <Modal aberto={aberto} titulo={titulo} onFechar={onFechar} rodape={<>
      <Botao onClick={onFechar}>Cancelar</Botao>
      <Botao variante={perigo ? 'perigo' : 'primario'} onClick={onConfirmar}>{confirmarTexto}</Botao>
    </>}>
      <div className="text-sm text-slate-700">{texto}</div>
    </Modal>
  )
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return <div className="px-4 py-10 text-center text-sm text-slate-500">{texto}</div>
}

export function Checkbox(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="checkbox" {...p} className={cx('h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600/30', p.className)} />
}
