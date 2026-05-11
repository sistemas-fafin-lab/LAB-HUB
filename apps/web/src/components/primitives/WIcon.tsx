import { useEffect, useRef } from 'react'

interface WIconProps {
  name: string
  className?: string
  strokeWidth?: number
}

export function WIcon({ name, className = 'w-5 h-5', strokeWidth = 2 }: WIconProps) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    type LucideWindow = Window & typeof globalThis & { lucide?: { createIcons: (opts: object) => void } }
    const win = window as LucideWindow
    if (!ref.current || !win.lucide) return
    ref.current.innerHTML = ''
    const el = document.createElement('i')
    el.setAttribute('data-lucide', name)
    el.className = className
    ref.current.appendChild(el)
    win.lucide.createIcons({ attrs: { 'stroke-width': strokeWidth } })
  }, [name, className, strokeWidth])

  return <span ref={ref} className="inline-flex" />
}
