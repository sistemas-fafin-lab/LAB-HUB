import { describe, expect, it } from 'vitest'
import { ehSessaoAdmin } from './admin'

// Espelha os testes de middlewares/adminAuth.ts da API: as mesmas travas
// (ambiente + disjuntor + config) decidem se o campo de CPF aparece.
describe('ehSessaoAdmin', () => {
  it('nega em dev sem VITE_ADMIN_EMAIL configurado', () => {
    expect(ehSessaoAdmin('teste@gmail.com', true, undefined, false)).toBe(false)
  })

  it('nega em dev com config vazia', () => {
    expect(ehSessaoAdmin('teste@gmail.com', true, '', false)).toBe(false)
  })

  it('nega quando o e-mail da sessão é diferente do configurado', () => {
    expect(ehSessaoAdmin('outro@gmail.com', true, 'teste@gmail.com', false)).toBe(false)
  })

  it('nega sem sessão (e-mail ausente)', () => {
    expect(ehSessaoAdmin(undefined, true, 'teste@gmail.com', false)).toBe(false)
  })

  it('autoriza em dev, configurado, com o e-mail exato — sem exigir disjuntor', () => {
    expect(ehSessaoAdmin('teste@gmail.com', true, 'teste@gmail.com', false)).toBe(true)
  })

  it('ignora caixa e espaços na comparação', () => {
    expect(ehSessaoAdmin(' TESTE@GMAIL.COM ', true, 'teste@gmail.com', false)).toBe(true)
  })

  describe('fora de dev — matriz de disjuntor + e-mail', () => {
    it('nega com disjuntor desligado e e-mail correto', () => {
      expect(ehSessaoAdmin('teste@gmail.com', false, 'teste@gmail.com', false)).toBe(false)
    })

    it('nega com disjuntor ligado e e-mail não configurado', () => {
      expect(ehSessaoAdmin('teste@gmail.com', false, undefined, true)).toBe(false)
    })

    it('nega com disjuntor desligado e e-mail não configurado', () => {
      expect(ehSessaoAdmin('teste@gmail.com', false, undefined, false)).toBe(false)
    })

    it('nega com disjuntor ligado e e-mail da sessão diferente do configurado', () => {
      expect(ehSessaoAdmin('outro@gmail.com', false, 'teste@gmail.com', true)).toBe(false)
    })

    it('autoriza com disjuntor ligado e e-mail batendo', () => {
      expect(ehSessaoAdmin('teste@gmail.com', false, 'teste@gmail.com', true)).toBe(true)
    })
  })
})
