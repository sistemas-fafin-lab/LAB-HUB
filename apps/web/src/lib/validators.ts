// Validadores de campo e máscaras para os formulários de cadastro/login.
// Cada validador retorna a mensagem de erro (string) ou null se o valor é válido.

export function apenasDigitos(v: string): string {
  return v.replace(/\D/g, '')
}

export function validarNome(nome: string): string | null {
  return nome.trim() ? null : 'Informe seu nome'
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validarEmail(email: string): string | null {
  return emailRegex.test(email.trim()) ? null : 'Email inválido'
}

export function validarCpf(cpf: string): string | null {
  const digits = apenasDigitos(cpf)
  if (digits.length !== 11) return 'CPF inválido'
  // Rejeita sequências repetidas (000.000.000-00, 111.111.111-11, etc.).
  if (/^(\d)\1{10}$/.test(digits)) return 'CPF inválido'

  const calcDigito = (base: string, pesoInicial: number): number => {
    let soma = 0
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * (pesoInicial - i)
    }
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }

  const dv1 = calcDigito(digits.slice(0, 9), 10)
  const dv2 = calcDigito(digits.slice(0, 10), 11)
  if (dv1 !== Number(digits[9]) || dv2 !== Number(digits[10])) return 'CPF inválido'

  return null
}

// Telefone é opcional: vazio é válido. Se preenchido, exige DDD + número (10 ou 11 dígitos).
export function validarTelefone(tel: string): string | null {
  const digits = apenasDigitos(tel)
  if (!digits) return null
  return digits.length === 10 || digits.length === 11 ? null : 'Telefone inválido'
}

// Espelha a política do Supabase Auth (S-04): mínimo de 12 e ao menos uma
// minúscula, uma maiúscula e um dígito. Precisa bater com a do projeto — o Auth
// recusa depois, e a mensagem dele vem em inglês e sem contexto. Uma regra a
// mais aqui é melhor que uma recusa opaca lá.
export function validarSenha(senha: string): string | null {
  if (senha.length < 12) return 'Senha deve ter ao menos 12 caracteres'
  if (!/[a-z]/.test(senha)) return 'Senha deve ter ao menos uma letra minúscula'
  if (!/[A-Z]/.test(senha)) return 'Senha deve ter ao menos uma letra maiúscula'
  if (!/\d/.test(senha)) return 'Senha deve ter ao menos um número'
  return null
}

// Espera o formato YYYY-MM-DD emitido pelo <input type="date">.
export function validarDataNascimento(data: string): string | null {
  if (!data) return 'Informe a data de nascimento'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return 'Data inválida'
  return null
}

// Converte YYYY-MM-DD em DD/MM/YYYY para exibição.
export function formatarData(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

// Máscara progressiva de CPF: 000.000.000-00
export function formatarCpf(v: string): string {
  const d = apenasDigitos(v).slice(0, 11)
  let out = d.slice(0, 3)
  if (d.length > 3) out += '.' + d.slice(3, 6)
  if (d.length > 6) out += '.' + d.slice(6, 9)
  if (d.length > 9) out += '-' + d.slice(9, 11)
  return out
}

// Máscara progressiva de telefone: (61) 9 0000-0000 (celular, 11 dígitos)
// ou (61) 0000-0000 (fixo, 10 dígitos).
export function formatarTelefone(v: string): string {
  const d = apenasDigitos(v).slice(0, 11)
  if (d.length === 0) return ''
  let out = '(' + d.slice(0, 2)
  if (d.length < 2) return out
  out += ') '
  if (d.length <= 6) {
    // Sem o 9 inicial ainda: agrupa o que houver.
    return out + d.slice(2)
  }
  if (d.length <= 10) {
    // Fixo: (61) 0000-0000
    out += d.slice(2, 6)
    if (d.length > 6) out += '-' + d.slice(6, 10)
    return out
  }
  // Celular: (61) 9 0000-0000
  out += d.slice(2, 3) + ' ' + d.slice(3, 7) + '-' + d.slice(7, 11)
  return out
}
