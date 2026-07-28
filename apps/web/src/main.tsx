import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AuthProvider } from './lib/AuthContext'
import { initAnalytics } from './lib/analytics'
import { aplicarTema, lerTema } from './lib/tema'

const root = document.getElementById('root')
if (root === null) throw new Error('Root element #root not found')

initAnalytics()
// Antes do primeiro paint: quem escolheu dark não vê um flash branco no boot.
aplicarTema(lerTema())

createRoot(root).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
