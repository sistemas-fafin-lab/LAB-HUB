import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// O monorepo tem dois Reacts: o da web (apps/web/node_modules) e o da raiz,
// fixado pelo mobile. Bibliotecas içadas para a raiz (ex.: lucide-react)
// resolveriam o React da raiz e quebrariam com "Invalid hook call". O alias
// força todo import de react/react-dom (inclusive `react/jsx-runtime`) a sair
// do React da web.
export const REACT_DA_WEB = {
  react: fileURLToPath(new URL('./node_modules/react', import.meta.url)),
  'react-dom': fileURLToPath(new URL('./node_modules/react-dom', import.meta.url)),
}

export default defineConfig({
  plugins: [react()],
  resolve: { alias: REACT_DA_WEB },
})
