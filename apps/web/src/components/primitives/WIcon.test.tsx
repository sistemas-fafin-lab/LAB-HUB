import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { WIcon } from './WIcon'

describe('WIcon', () => {
  it('desenha o ícone do registro, com a classe padrão das telas antigas', () => {
    const { container } = render(<WIcon name="calendar-plus" />)

    // O ícone vem embrulhado no mesmo <span> de quando saía do Lucide por CDN.
    const wrapper = container.firstElementChild
    expect(wrapper?.tagName).toBe('SPAN')
    const svg = wrapper?.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('class')).toContain('w-5 h-5')
    expect(svg?.getAttribute('stroke-width')).toBe('2')
  })
})
