// ---------------------------------------------------------------------------
// Feature flags de mockup
// ---------------------------------------------------------------------------
// Seções/recursos ainda sem fonte de dados real. O código do mockup fica
// PRESERVADO no lugar; aqui apenas controlamos a exibição. Troque para `true`
// quando o backend correspondente existir para reexibir a parte.
//
// (Alguns itens — Hero e Exames recentes — já usam dado real da API; estão
//  ocultos por escolha de produto, não por serem mock. Basta reativar a flag.)
// ---------------------------------------------------------------------------

export const MOSTRAR_ACOMPANHAMENTO = false          // HomePage: card de marcadores
export const MOSTRAR_PROXIMOS_PASSOS_EXTRAS = false  // HomePage: compartilhar/baixar laudos
export const MOSTRAR_RESULTADO_HERO = false          // HomePage: card "Seu último exame"
export const MOSTRAR_EXAMES_RECENTES = false         // HomePage: lista "Exames recentes"
export const MOSTRAR_CHATBOT = false                 // SupportDock: chat "Lia"
export const MOSTRAR_NOTIFICACOES = false            // Topbar: sino / badge de notificações
export const MOSTRAR_DEPENDENTES = false             // Topbar: seletor de dependentes (D2 adiado)

// Páginas inteiras ocultas do menu E inacessíveis por acesso direto.
export const MOSTRAR_RESULTADOS = false              // Sidebar/rota: Resultados
export const MOSTRAR_TENDENCIAS = false              // Sidebar/rota: Tendências
export const MOSTRAR_DOCUMENTOS = false              // Sidebar/rota: Documentos
export const MOSTRAR_FATURAMENTO = false             // Sidebar/rota: Faturamento

// ---------------------------------------------------------------------------
// Fonte única de "rota oculta" — usada pelo Sidebar (esconde o item) e pelo
// App (bloqueia acesso direto, caindo na Visão geral). Manter aqui evita que
// o menu e o roteador divirjam.
// ---------------------------------------------------------------------------
const ROTAS_OCULTAS: Record<string, boolean> = {
  results:   !MOSTRAR_RESULTADOS,
  trends:    !MOSTRAR_TENDENCIAS,
  documents: !MOSTRAR_DOCUMENTOS,
  billing:   !MOSTRAR_FATURAMENTO,
}

export function rotaOculta(route: string): boolean {
  return ROTAS_OCULTAS[route] ?? false
}
