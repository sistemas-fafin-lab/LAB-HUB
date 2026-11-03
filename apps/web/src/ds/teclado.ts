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
