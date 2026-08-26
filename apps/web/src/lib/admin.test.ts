import { describe, expect, it } from 'vitest'
import { ehSessaoAdmin } from './admin'

// Espelha os testes de middlewares/adminAuth.ts da API: as mesmas duas travas
// (ambiente + config) decidem se o campo de CPF aparece.
describe('ehSessaoAdmin', () => {
  it('nega fora de dev, mesmo com config e e-mail batendo', () => {
    expect(ehSessaoAdmin('teste@gmail.com', false, 'teste@gmail.com')).toBe(false)
  })

  it('nega em dev sem VITE_ADMIN_EMAIL configurado', () => {
    expect(ehSessaoAdmin('teste@gmail.com', true, undefined)).toBe(false)
  })

  it('nega em dev com config vazia', () => {
    expect(ehSessaoAdmin('teste@gmail.com', true, '')).toBe(false)
  })

  it('nega quando o e-mail da sessão é diferente do configurado', () => {
    expect(ehSessaoAdmin('outro@gmail.com', true, 'teste@gmail.com')).toBe(false)
  })

  it('nega sem sessão (e-mail ausente)', () => {
    expect(ehSessaoAdmin(undefined, true, 'teste@gmail.com')).toBe(false)
  })

  it('autoriza em dev, configurado, com o e-mail exato', () => {
    expect(ehSessaoAdmin('teste@gmail.com', true, 'teste@gmail.com')).toBe(true)
  })

  it('ignora caixa e espaços na comparação', () => {
    expect(ehSessaoAdmin(' TESTE@GMAIL.COM ', true, 'teste@gmail.com')).toBe(true)
  })
})
