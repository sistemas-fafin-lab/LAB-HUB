import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Separado do vite.config.ts de propósito: o build não precisa carregar nada
// disto.
//
// `env` (e não um setupFile) porque lib/supabase.ts lê `import.meta.env` no
// LOAD e lança se faltar — um setupFile roda depois do transform, tarde demais.
// Testes que não mockam o módulo ainda conseguem importá-lo por causa daqui.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    env: {
      VITE_SUPABASE_URL: 'http://localhost/supabase',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
    restoreMocks: true,
  },
})
