/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // darkMode 'class': as variantes `dark:` e o tema do portal v2 (`.dark` em
  // styles/lh/tema.css) seguem a classe `dark` no <html>, gerenciada por
  // src/lib/tema.ts. As telas antigas ainda recebem `dark` por prop.
  darkMode: 'class',
  theme: {
    extend: {
      // Cores do portal v2 ligadas ao tema do LAB DS (src/styles/lh/tema.css):
      // claro em :root, escuro em .dark. Nenhum nome colide com as classes que
      // as telas antigas usam, então elas não mudam.
      colors: {
        page: 'var(--lh-page)',
        card: 'var(--lh-card)',
        subtle: 'var(--lh-subtle)',
        tint: 'var(--lh-tint)',
        chip: 'var(--lh-chip)',
        line: 'var(--lh-line)',
        strong: 'var(--lh-line-strong)',
        ink: 'var(--lh-ink)',
        muted: 'var(--lh-muted)',
        faint: 'var(--lh-faint)',
        brand: 'var(--lh-brand)',
        action: 'var(--lh-action)',
        link: 'var(--lh-link)',
        'brand-soft': 'var(--lh-brand-soft)',
        'brand-text': 'var(--lh-brand-text)',
        coral: 'var(--lh-coral)',
        'coral-soft': 'var(--lh-coral-soft)',
        track: 'var(--lh-track)',
        fab: 'var(--lh-fab)',
        'fab-ink': 'var(--lh-fab-ink)',
      },
      // `font-display` resolve por variável: Plus Jakarta Sans nas telas
      // antigas (servida via @fontsource — ver src/styles/fontes.ts) e Ranade
      // dentro de `.lh-v2`, a raiz das telas novas. O texto corrido das telas
      // novas herda DM Sans da própria `.lh-v2`.
      fontFamily: { display: ['var(--lh-font-display)'] },
      boxShadow: { float: 'var(--lh-shadow-float)' },
    },
  },
}
