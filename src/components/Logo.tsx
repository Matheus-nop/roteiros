export function Logo({ claro = false, tamanho = 28 }: { claro?: boolean; tamanho?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width={tamanho} height={tamanho} viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="6" fill={claro ? '#ffffff' : '#12365a'} />
        <path d="M8 23V9h3.2l6.6 9.1V9H21v14h-3.2l-6.6-9.1V23H8z" fill={claro ? '#12365a' : '#ffffff'} />
        <rect x="22.5" y="18" width="3" height="5" rx="0.6" fill="#f59e0b" />
      </svg>
      <div className="leading-none">
        <div className={`text-[13px] font-bold tracking-wide ${claro ? 'text-white' : 'text-brand-700'}`}>GRUPO NOVA OPÇÃO</div>
        <div className={`mt-0.5 text-[10px] uppercase tracking-[0.18em] ${claro ? 'text-brand-200' : 'text-slate-500'}`}>Roteiros</div>
      </div>
    </div>
  )
}
