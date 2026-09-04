/**
 * Identidade visual. São três peças, com papéis distintos:
 *
 * - `Logo`      — a logomarca oficial do Grupo Nova Opção (PNG do sistema anterior).
 * - `Simbolo`   — o símbolo do produto: a rota com as duas paradas. Vetorial, escala
 *                 de 16px (favicon) a 128px (tela de login) sem borrar.
 * - `Marca`     — o conjunto que vai na barra superior: logomarca da empresa +
 *                 divisória + nome do produto. A empresa é a âncora; "Roteiros" é o
 *                 nome do sistema, subordinado a ela.
 */

export function Logo({ claro = false, altura = 30, className = '' }: { claro?: boolean; altura?: number; className?: string }) {
  return <img src={claro ? '/logo-branca.png' : '/logo.png'} alt="Grupo Nova Opção" height={altura} style={{ height: altura, width: 'auto' }} className={className} draggable={false} />
}

/** Símbolo do produto: trajeto pontilhado da origem até a parada final. */
export function Simbolo({ tamanho = 28, className = '' }: { tamanho?: number; className?: string }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="url(#simbolo-fundo)" />
      <path d="M9.5 21.5c0-2.8 2.2-4 5.5-4h2.5c2.4 0 4-1.1 4-3" stroke="#ffffff" strokeOpacity=".55" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="0.1 3.6" />
      <circle cx="9.5" cy="22.2" r="2.6" fill="#ffffff" />
      <path d="M21.5 6.5c2.5 0 4.5 2 4.5 4.6 0 3.2-4.5 7.9-4.5 7.9s-4.5-4.7-4.5-7.9c0-2.6 2-4.6 4.5-4.6Z" fill="#f59e0b" />
      <circle cx="21.5" cy="11.1" r="1.7" fill="#0d2a47" />
      <defs>
        <linearGradient id="simbolo-fundo" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1f4f7f" />
          <stop offset="1" stopColor="#0d2a47" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/**
 * Lockup da barra superior. Em telas estreitas some a logomarca da empresa e fica
 * só o símbolo + "Roteiros" — o suficiente para saber onde se está.
 */
export function Marca({ claro = true }: { claro?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Logo claro={claro} altura={26} className="hidden shrink-0 md:block" />
      <span className={`hidden h-7 w-px shrink-0 md:block ${claro ? 'bg-white/25' : 'bg-slate-300'}`} />
      <Simbolo tamanho={26} className="shrink-0 md:hidden" />
      <span className="flex flex-col items-start leading-none">
        <span className={`whitespace-nowrap text-[15px] font-bold tracking-tight ${claro ? 'text-white' : 'text-brand-800'}`}>Roteiros</span>
        <span className={`mt-[3px] hidden whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.14em] sm:block ${claro ? 'text-acento-400' : 'text-acento-600'}`}>Planejamento &amp; rota</span>
      </span>
    </span>
  )
}
