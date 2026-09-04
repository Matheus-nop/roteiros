// Campo de texto com sugestão — combobox, não `<datalist>`.
//
// O `<datalist>` nativo parece resolver e não resolve: cada navegador decide se casa
// pelo começo ou por qualquer parte do texto, ignora acento de um jeito diferente, e no
// celular a lista aparece de formas distintas. Para "duque" achar
// "DUQUE DE CAXIAS - JD. PRIMAVERA" de forma previsível em todo lugar, a filtragem
// precisa ser nossa.
//
// Sugere, não obriga: qualquer texto novo continua sendo aceito. Localidade nova aparece
// toda semana, e um campo fechado emperraria o comercial.
import { useEffect, useMemo, useRef, useState } from 'react'
import { normalizar } from '../lib/format'
import { cx } from './ui'

const MAX_SUGESTOES = 8

export function CampoSugestao({ valor, onChange, sugestoes, placeholder, className, id, maiusculas = true }: {
  valor: string
  onChange(v: string): void
  /** Já na ordem de relevância — as primeiras aparecem quando o campo está vazio. */
  sugestoes: string[]
  placeholder?: string
  className?: string
  id?: string
  /** O domínio grava local, cliente e equipamento em maiúsculas. */
  maiusculas?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [marcado, setMarcado] = useState(0)
  const caixa = useRef<HTMLDivElement>(null)

  const filtradas = useMemo(() => {
    const b = normalizar(valor)
    // Campo vazio mostra as mais usadas; com texto, casa em qualquer parte do nome.
    const lista = b ? sugestoes.filter(s => normalizar(s).includes(b)) : sugestoes
    // Um resultado idêntico ao que já está escrito não é sugestão, é eco.
    return lista.filter(s => normalizar(s) !== b).slice(0, MAX_SUGESTOES)
  }, [valor, sugestoes])

  useEffect(() => { setMarcado(0) }, [valor])

  useEffect(() => {
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  const escolher = (s: string) => { onChange(s); setAberto(false) }

  const teclado = (e: React.KeyboardEvent) => {
    if (!aberto || !filtradas.length) {
      if (e.key === 'ArrowDown') { setAberto(true); e.preventDefault() }
      return
    }
    if (e.key === 'ArrowDown') { setMarcado(m => (m + 1) % filtradas.length); e.preventDefault() }
    else if (e.key === 'ArrowUp') { setMarcado(m => (m - 1 + filtradas.length) % filtradas.length); e.preventDefault() }
    else if (e.key === 'Enter') { escolher(filtradas[marcado]); e.preventDefault() }
    else if (e.key === 'Escape') { setAberto(false) }
    else if (e.key === 'Tab') { setAberto(false) }
  }

  return (
    <div className="relative" ref={caixa}>
      <input
        id={id}
        className={cx('campo', className)}
        value={valor}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={aberto && filtradas.length > 0}
        aria-autocomplete="list"
        onChange={e => { onChange(maiusculas ? e.target.value.toUpperCase() : e.target.value); setAberto(true) }}
        onFocus={() => setAberto(true)}
        onKeyDown={teclado}
      />
      {aberto && filtradas.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-slate-200">
          {filtradas.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                // `mousedown` e não `click`: o clique dispara depois do blur do input,
                // e nesse meio-tempo a lista já teria fechado.
                onMouseDown={e => { e.preventDefault(); escolher(s) }}
                onMouseEnter={() => setMarcado(i)}
                className={cx('block w-full px-3 py-2 text-left text-[13px] leading-tight transition',
                  i === marcado ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-50')}>
                <Realce texto={s} busca={valor} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Destaca o trecho que casou, para ficar claro por que aquela linha apareceu. */
function Realce({ texto, busca }: { texto: string; busca: string }) {
  const b = normalizar(busca)
  if (!b) return <>{texto}</>
  const i = normalizar(texto).indexOf(b)
  if (i < 0) return <>{texto}</>
  return <>
    {texto.slice(0, i)}
    <b className="font-bold text-brand-700">{texto.slice(i, i + b.length)}</b>
    {texto.slice(i + b.length)}
  </>
}
