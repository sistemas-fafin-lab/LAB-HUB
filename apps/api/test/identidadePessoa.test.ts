import { describe, expect, it } from 'vitest'
import { conferirPessoa, identidadeDoLaudoExterno } from '../src/laudos/identidade.js'

// Segunda prova de identidade: nome + nascimento, para o laudo que saiu sem CPF
// ou com um CPF diferente do cadastro. Pessoas inventadas.

const CADASTRO = { nome: 'MARIA JOSÉ DA SILVA', nascimento: '01/02/1990' }

describe('conferirPessoa', () => {
  it('confere quando nome e nascimento são os mesmos', () => {
    expect(conferirPessoa(CADASTRO, { nome: 'Maria José da Silva', nascimento: '1990-02-01' })).toBe('confere')
  })

  it('ignora acento, caixa, pontuação e espaços sobrando no nome', () => {
    expect(conferirPessoa(CADASTRO, { nome: '  maria  jose da silva. ', nascimento: '1990-02-01' })).toBe('confere')
  })

  it('aceita a data nos dois formatos, de qualquer lado', () => {
    expect(conferirPessoa({ ...CADASTRO, nascimento: '1990-02-01' }, { nome: CADASTRO.nome, nascimento: '01/02/1990' })).toBe(
      'confere',
    )
  })

  it('nome igual com nascimento diferente NÃO confere', () => {
    expect(conferirPessoa(CADASTRO, { nome: CADASTRO.nome, nascimento: '1990-02-02' })).toBe('diverge')
  })

  it('nascimento igual com nome diferente NÃO confere — nem parecido', () => {
    expect(conferirPessoa(CADASTRO, { nome: 'Maria da Silva', nascimento: '1990-02-01' })).toBe('diverge')
    expect(conferirPessoa(CADASTRO, { nome: 'Maria Jose da Silva Filha', nascimento: '1990-02-01' })).toBe('diverge')
  })

  it.each([
    ['nome ausente no laudo', { nome: null, nascimento: '1990-02-01' }],
    ['nascimento ausente no laudo', { nome: 'Maria José da Silva', nascimento: null }],
    ['data ilegível', { nome: 'Maria José da Silva', nascimento: '01-02' }],
    ['nome de uma palavra só', { nome: 'Maria', nascimento: '1990-02-01' }],
  ])('%s: indisponível', (_caso, doLaudo) => {
    expect(conferirPessoa(CADASTRO, doLaudo)).toBe('indisponivel')
  })

  it('cadastro incompleto: indisponível, nunca confere', () => {
    expect(conferirPessoa({ nome: 'Maria', nascimento: '01/02/1990' }, { nome: 'Maria', nascimento: '1990-02-01' })).toBe(
      'indisponivel',
    )
    expect(conferirPessoa({ nome: CADASTRO.nome, nascimento: null }, { nome: CADASTRO.nome, nascimento: null })).toBe(
      'indisponivel',
    )
  })
})

describe('identidadeDoLaudoExterno', () => {
  it('CPF que confere basta, mesmo com o nascimento divergindo no cadastro', () => {
    expect(identidadeDoLaudoExterno('confere', 'diverge')).toEqual({ veredito: 'confere', prova: 'cpf' })
    expect(identidadeDoLaudoExterno('confere', 'indisponivel')).toEqual({ veredito: 'confere', prova: 'cpf' })
  })

  it('laudo sem CPF: nome + nascimento conferindo fazem a prova', () => {
    expect(identidadeDoLaudoExterno('indisponivel', 'confere')).toEqual({ veredito: 'confere', prova: 'nome_nascimento' })
  })

  it('CPF divergente: aparece se nome + nascimento conferem', () => {
    expect(identidadeDoLaudoExterno('diverge', 'confere')).toEqual({ veredito: 'confere', prova: 'nome_nascimento' })
  })

  it('CPF divergente sem a segunda prova continua sendo de outra pessoa', () => {
    expect(identidadeDoLaudoExterno('diverge', 'diverge').veredito).toBe('diverge')
    expect(identidadeDoLaudoExterno('diverge', 'indisponivel').veredito).toBe('diverge')
  })

  it('sem CPF e sem a segunda prova: não dá para afirmar de quem é', () => {
    expect(identidadeDoLaudoExterno('indisponivel', 'indisponivel')).toEqual({ veredito: 'indisponivel', prova: null })
    // Nome ou nascimento diferente sem CPF não PROVA que é de outra pessoa:
    // há nascimento errado no cadastro (7 em 488 na medição de 25/11/2026).
    expect(identidadeDoLaudoExterno('indisponivel', 'diverge')).toEqual({ veredito: 'indisponivel', prova: null })
  })
})
