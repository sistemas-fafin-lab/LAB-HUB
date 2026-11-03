import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { REACT_DA_WEB } from './vite.config'

// No Vitest a condição `node` escolhe o build CJS do lucide-react, cujo
// `require('react')` o Node resolve direto da raiz, sem passar pelo alias do
// React (ver vite.config.ts). Apontar para o build ESM faz os imports dele
// passarem pelo Vite — e pelo alias.
const lucideEsm = join(
  dirname(createRequire(import.meta.url).resolve('lucide-react/package.json')),
  'dist/esm/lucide-react.mjs',
)

// Separado do vite.config.ts de propósito: o build não precisa carregar nada
// disto.
//
// `env` (e não um setupFile) porque lib/supabase.ts lê `import.meta.env` no
// LOAD e lança se faltar — um setupFile roda depois do transform, tarde demais.
// Testes que não mockam o módulo ainda conseguem importá-lo por causa daqui.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      ...Object.entries(REACT_DA_WEB).map(([find, replacement]) => ({ find, replacement })),
      { find: /^lucide-react$/, replacement: lucideEsm },
    ],
  },
  test: {
    // Dependências em node_modules rodam fora do Vite no Vitest, e aí o alias
    // do React não vale para elas. Inline faz o Vite resolver os imports do
    // lucide-react.
    server: { deps: { inline: ['lucide-react'] } },
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
