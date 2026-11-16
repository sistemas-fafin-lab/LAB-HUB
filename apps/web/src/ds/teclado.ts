import type { KeyboardEvent } from 'react'

// Controles do DS desenhados com <span role="checkbox|switch|radio|button">
// precisam responder ao teclado como o elemento nativo: Espaço (e Enter, no
// caso de botão) aciona. Sem isso, quem navega por Tab chega ao controle e não
// consegue usá-lo.
export function ativarComTeclado(acao: () => void, teclas: readonly string[] = [' ', 'Enter']) {
  return (e: KeyboardEvent) => {
    if (!teclas.includes(e.key)) return
    e.preventDefault()
    acao()
  }
}

const PROXIMA: Record<string, 1 | -1> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }

/**
 * Setas num grupo de rádio: marcam a opção vizinha (com volta) e levam o foco
 * até ela. Devolve o índice escolhido, ou null quando a tecla não é seta.
 */
export function navegarNoGrupoDeRadio(e: KeyboardEvent<HTMLElement>, atual: number, total: number): number | null {
  const delta = PROXIMA[e.key]
  if (delta === undefined || total === 0) return null
  e.preventDefault()
  const alvo = (atual + delta + total) % total
  e.currentTarget.closest('[role=radiogroup]')?.querySelectorAll<HTMLElement>('[role=radio]')[alvo]?.focus()
  return alvo
}

const SELETOR_FOCAVEL = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** Elementos alcançáveis por Tab dentro de `raiz`, na ordem do documento. */
export function focaveis(raiz: HTMLElement): HTMLElement[] {
  return Array.from(raiz.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL))
}
