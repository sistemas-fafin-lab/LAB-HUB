// Gerador do caminho do grafismo LAB: forma em degrau com TODOS os cantos
// arredondados, inclusive a junção côncava onde os dois blocos se encontram.
// Caixa W×H; (sx, sy) = tamanho do retângulo recortado; r = raio de todos os
// cantos. Devolve um path SVG/CSS em px, já espelhado para o canto pedido.

export type CantoRecorte = 'bottom-right' | 'top-right' | 'bottom-left' | 'top-left'

export function grafismoPath(W: number, H: number, sx: number, sy: number, r: number, notch: CantoRecorte = 'bottom-right'): string {
  const c = Math.min(r, sx / 2, sy / 2, W / 2, H / 2)
  const mx = notch.includes('left')
  const my = notch.includes('top')
  const X = (x: number) => (mx ? W - x : x)
  const Y = (y: number) => (my ? H - y : y)
  // Espelhar num só eixo inverte o sentido dos arcos.
  const sw = (s: 0 | 1): 0 | 1 => (mx !== my ? (s ? 0 : 1) : s)
  const x1 = W - sx
  const y1 = H - sy
  const A = (s: 0 | 1, x: number, y: number) => `A ${c} ${c} 0 0 ${sw(s)} ${X(x)} ${Y(y)}`
  return [
    `M ${X(c)} ${Y(0)}`,
    `L ${X(W - c)} ${Y(0)}`,
    A(1, W, c),
    `L ${X(W)} ${Y(y1 - c)}`,
    A(1, W - c, y1),
    `L ${X(x1 + c)} ${Y(y1)}`,
    A(0, x1, y1 + c),
    `L ${X(x1)} ${Y(H - c)}`,
    A(1, x1 - c, H),
    `L ${X(c)} ${Y(H)}`,
    A(1, 0, H - c),
    `L ${X(0)} ${Y(c)}`,
    A(1, c, 0),
    'Z',
  ].join(' ')
}

/** Valor CSS para clip-path. */
export function grafismoClip(W: number, H: number, sx: number, sy: number, r: number, notch?: CantoRecorte): string {
  return `path('${grafismoPath(W, H, sx, sy, r, notch)}')`
}
