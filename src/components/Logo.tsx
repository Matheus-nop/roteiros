/** Logomarca oficial do Grupo Nova Opção (PNG extraído do sistema anterior). */
export function Logo({ claro = false, altura = 30, className = '' }: { claro?: boolean; altura?: number; className?: string }) {
  return <img src={claro ? '/logo-branca.png' : '/logo.png'} alt="Grupo Nova Opção" height={altura} style={{ height: altura, width: 'auto' }} className={className} draggable={false} />
}
