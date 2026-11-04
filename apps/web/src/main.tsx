// Fontes da marca (Ranade e DM Sans variável), servidas de public/fonts. O laudo
// mede a paginação depois de `document.fonts.ready`: as famílias precisam manter
// os nomes 'Ranade' e 'DM Sans'.
import './styles/fonts.css'
import { StrictMode } from 'react'
import './styles/index.css'
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
