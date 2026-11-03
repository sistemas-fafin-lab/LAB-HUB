// Fontes servidas pelo próprio bundle (antes vinham do Google Fonts por CDN).
// Mesmas famílias e pesos de antes: Inter 400–700 e Plus Jakarta Sans 600–800.
// (O Google Fonts era pedido com Jakarta 900, peso que a família não tem: o
// navegador já usava o 800 para `font-black`, e continua usando.)
// O laudo mede a paginação depois de `document.fonts.ready`, então as fontes
// precisam continuar com estes nomes de família.
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import '@fontsource/plus-jakarta-sans/800.css'

// Portal v2 (LAB Design System): DM Sans no texto. A Ranade dos títulos é
// servida de public/fonts (styles/lh/fontes.css). Nenhuma tela antiga usa
// essas famílias, então carregá-las não muda o visual atual.
import '@fontsource/dm-sans/300.css'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/dm-sans/700.css'
