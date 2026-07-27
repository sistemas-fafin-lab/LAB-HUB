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
    // Só desmonta o que foi renderizado (ver test-setup.ts). O motivo de `env`
    // acima continua valendo: variável lida no LOAD do módulo não pode esperar
    // por um setupFile.
    setupFiles: ['./src/test-setup.ts'],
    env: {
      VITE_SUPABASE_URL: 'http://localhost/supabase',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      // Fuso fixo do público do app. Data ISO sem hora ("2026-07-24") vira
      // meia-noite UTC, e formatá-la em UTC-3 devolve o dia anterior — o teste
      // que cobre isso passaria à toa numa máquina em UTC (CI), justamente onde
      // o bug não apareceria.
      TZ: 'America/Sao_Paulo',
    },
    restoreMocks: true,
  },
})
