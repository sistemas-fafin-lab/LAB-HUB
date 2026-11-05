// ---------------------------------------------------------------------------
// Nome do exame para exibição. Os sistemas do laboratório cadastram os nomes
// em MAIÚSCULAS ("PCR EM TEMPO REAL DE HPV"); a tela mostra só a primeira
// letra maiúscula ("PCR em tempo real de HPV"). Siglas conhecidas e termos com
// número (T4, B12) ficam como vieram. Nome que já vem em maiúsculas e
// minúsculas é respeitado: alguém já o escreveu como deve ser lido.
// ---------------------------------------------------------------------------

// Siglas que aparecem em nomes de exame. Acrescente aqui as que surgirem.
const SIGLAS = new Set([
  'ABO', 'ACTH', 'ADH', 'AFP', 'ALT', 'ANA', 'ANCA', 'ASLO', 'AST', 'BHCG', 'BNP', 'CA', 'CEA', 'CK', 'CKMB',
  'CMV', 'CPK', 'DHEA', 'DHL', 'DNA', 'EAS', 'EBV', 'FAN', 'FSH', 'GGT', 'HBSAG', 'HBV', 'HCG', 'HCV', 'HDL',
  'HIV', 'HLA', 'HPV', 'HTLV', 'IGA', 'IGE', 'IGF', 'IGG', 'IGM', 'INR', 'LDH', 'LDL', 'LH', 'PAAF', 'PCR',
  'PSA', 'PTH', 'RNA', 'SHBG', 'SOE', 'TGO', 'TGP', 'TP', 'TSH', 'TTPA', 'VDRL', 'VHS', 'VLDL',
])

const PALAVRA = /[\p{L}\p{N}]+/gu

function ehSigla(palavra: string): boolean {
  return SIGLAS.has(palavra) || (/\p{N}/u.test(palavra) && /\p{L}/u.test(palavra))
}

export function nomeDoExame(nome: string): string {
  // Só mexe no que está todo em maiúsculas.
  if (nome !== nome.toUpperCase()) return nome
  let primeira = true
  return nome.replace(PALAVRA, (palavra) => {
    const era = primeira
    primeira = false
    if (ehSigla(palavra)) return palavra
    const minuscula = palavra.toLowerCase()
    return era ? minuscula.charAt(0).toUpperCase() + minuscula.slice(1) : minuscula
  })
}
