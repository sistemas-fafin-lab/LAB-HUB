import { createHmac, timingSafeEqual } from 'node:crypto'

// Valida a assinatura HMAC-SHA256 de um webhook contra o corpo cru recebido.
export function verifyHmac(body: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  const received = Buffer.from(signature)
  const computed = Buffer.from(expected)
  // timingSafeEqual exige buffers do mesmo tamanho.
  if (received.length !== computed.length) return false
  return timingSafeEqual(received, computed)
}
