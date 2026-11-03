/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // darkMode 'class': as telas de autenticação usam variantes `dark:`, que
  // seguem a classe `dark` no <html> (gerenciada por src/lib/tema.ts). O resto
  // do app continua recebendo `dark` por prop.
  darkMode: 'class',
  theme: {
    extend: {
      // Libera a utility `font-display` (Plus Jakarta Sans, servida localmente
      // via @fontsource — ver src/styles/fontes.ts).
      fontFamily: { display: ['Plus Jakarta Sans', 'Inter', 'sans-serif'] },
    },
  },
}
