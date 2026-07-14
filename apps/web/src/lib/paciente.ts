// Derivações de exibição a partir do nome do paciente autenticado.

// Iniciais para o avatar: primeira letra do primeiro e do último nome
// (ex.: "João Madeiro" → "JM"; "João" → "J"). Vazio quando não há nome.
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return ''
  const primeira = partes[0]![0]!
  const ultima = partes.length > 1 ? partes[partes.length - 1]![0]! : ''
  return (primeira + ultima).toUpperCase()
}

// Primeiro nome, para saudações (ex.: "João Madeiro" → "João").
export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? ''
}
