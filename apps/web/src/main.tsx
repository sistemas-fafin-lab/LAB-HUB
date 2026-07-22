import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AuthProvider } from './lib/AuthContext'
import { initAnalytics } from './lib/analytics'

const root = document.getElementById('root')
if (root === null) throw new Error('Root element #root not found')

initAnalytics()

createRoot(root).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
