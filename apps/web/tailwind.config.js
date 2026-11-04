/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // darkMode 'class': as variantes `dark:` e o tema do portal v2 (`.dark` em
  // styles/lh/tema.css) seguem a classe `dark` no <html>, gerenciada por
  // src/lib/tema.ts.
  darkMode: 'class',
  theme: {
    extend: {
      // Cores do portal v2 ligadas ao tema do LAB DS (src/styles/lh/tema.css):
      // claro em :root, escuro em .dark.
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
      // Ranade nos títulos e DM Sans no texto, servidas de public/fonts
      // (ver src/styles/fonts.css).
      fontFamily: { display: ['Ranade', 'DM Sans', 'system-ui', 'sans-serif'], sans: ['DM Sans', 'system-ui', 'sans-serif'] },
      boxShadow: { float: 'var(--lh-shadow-float)' },
    },
  },
}
