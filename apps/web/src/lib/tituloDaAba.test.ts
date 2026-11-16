import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { resolveRota } from './rotas'
import { tituloDaEntrada, tituloDaRota, useTituloDaAba } from './tituloDaAba'

describe('título da aba', () => {
  it.each([
    ['/', 'Visão geral'],
    ['/resultados', 'Resultados'],
    ['/exame/abc', 'Exame'],
    ['/laudo/abc', 'Laudo'],
    ['/coletas', 'Minhas coletas'],
    ['/coleta/c-1', 'Coleta'],
    ['/agendar', 'Agendar coleta'],
    ['/tendencias', 'Tendências'],
    ['/documentos', 'Documentos'],
    ['/configuracoes', 'Configurações'],
    ['/perfil', 'Perfil'],
    ['/nao-existe', 'Página não encontrada'],
  ])('%s → %s', (caminho, titulo) => {
    expect(tituloDaRota(resolveRota(caminho))).toBe(titulo)
  })

  it('telas de entrada', () => {
    expect(['login', 'cadastro', 'recuperar', 'nova-senha'].map((m) => tituloDaEntrada(m as never))).toEqual([
      'Entrar',
      'Criar conta',
      'Recuperar acesso',
      'Nova senha',
    ])
  })

  it('escreve "{Tela} · Lab Hub" no documento', () => {
    renderHook(() => useTituloDaAba('Resultados'))
    expect(document.title).toBe('Resultados · Lab Hub')
  })
})
