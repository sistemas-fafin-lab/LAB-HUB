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
