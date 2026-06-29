interface WSkeletonProps {
  /** Forma e dimensões (largura/altura/arredondamento) via utilitárias Tailwind. */
  className?: string
  dark: boolean
}

// Bloco de carregamento com shimmer. O chamador define tamanho/forma pela className.
export function WSkeleton({ className = '', dark }: WSkeletonProps) {
  return <div className={`animate-pulse ${dark ? 'bg-gray-800' : 'bg-slate-200'} ${className}`} />
}
