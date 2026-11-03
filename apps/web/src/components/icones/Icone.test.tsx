import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Icone } from './Icone'

describe('Icone', () => {
  it('desenha o ícone registrado com a classe e a espessura pedidas', () => {
    const { container } = render(<Icone name="check" className="w-4 h-4" strokeWidth={2.5} />)

    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('class')).toContain('w-4 h-4')
    expect(svg?.getAttribute('stroke-width')).toBe('2.5')
  })

  it('aceita tamanho e cor, como pedem os componentes do LAB DS', () => {
    const { container } = render(<Icone name="check" size={14} color="#fff" />)

    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('14')
    expect(svg?.getAttribute('height')).toBe('14')
    expect(svg?.getAttribute('stroke')).toBe('#fff')
  })

  it('nome fora do registro não desenha nada e avisa no console', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { container } = render(<Icone name="nao-existe" />)

    expect(container.innerHTML).toBe('')
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining('"nao-existe"'))
  })
})
