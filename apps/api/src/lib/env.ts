// Helper para ler variáveis de ambiente obrigatórias com erro claro.
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`)
  }
  return value
}

/**
 * Lê uma env NUMÉRICA opcional, caindo no padrão quando ela falta ou não é um
 * número utilizável.
 *
 * Sem o guard, `Number('')` vira 0 e `Number('90 dias')` vira NaN — e um NaN
 * escapando para o resto do código falha de formas que não parecem erro de
 * configuração: `setDate(getDate() - NaN)` produz Invalid Date e derruba o
 * `toISOString()` com RangeError, e um TTL NaN faz toda comparação de validade
 * dar `false`, ou seja, o cache nunca vence. Um erro de digitação no `.env` não
 * pode virar laudo congelado na tela do paciente.
 *
 * `minimo` existe porque zero significa coisas diferentes por variável: num
 * timeout aborta a chamada na hora (inaceitável, minimo 1), num TTL só desliga
 * o cache (legítimo, minimo 0).
 */
export function numeroEnv(name: string, padrao: number, minimo = 0): number {
  const bruto = process.env[name]
  if (bruto === undefined || bruto.trim() === '') return padrao

  const valor = Number(bruto)
  if (Number.isFinite(valor) && valor >= minimo) return valor

  // Config quebrada é silenciosa por natureza — quem configurou não está olhando
  // o comportamento, está olhando o .env. Avisar no boot é a única chance.
  console.warn(`[env] ${name}="${bruto}" é inválido (mínimo ${minimo}); usando ${padrao}`)
  return padrao
}

/**
 * Lê a chave do Supabase aceitando o nome NOVO e, como reserva, o LEGADO.
 *
 * As chaves antigas (`anon`/`service_role`) são JWTs assinados com o segredo do
 * projeto: não dá para revogar uma sem rotacionar o segredo inteiro, o que
 * derruba todas as sessões de todo mundo. As novas (`sb_publishable_…`,
 * `sb_secret_…`) são opacas e revogáveis uma a uma — é o achado S-10.
 *
 * Aceitar os dois nomes é o que torna a migração reversível numa infra que não
 * se implanta por push (a API roda em docker-compose num VPS): sobe-se o código
 * que entende os dois, depois troca-se a env, e só então a chave velha é
 * desativada no painel. Cada passo é revertido sozinho; a ordem inversa deixaria
 * a API sem chave válida entre o deploy e o ajuste do ambiente.
 *
 * O aviso existe para a migração não parar no meio e ser esquecida: enquanto a
 * chave for JWT (`eyJ…`), o boot diz isso em voz alta.
 */
export function chaveSupabase(nomeNovo: string, nomeLegado: string): string {
  const novo = process.env[nomeNovo]?.trim()
  if (novo) return novo

  const legado = process.env[nomeLegado]?.trim()
  if (!legado) {
    throw new Error(
      `Variável de ambiente obrigatória ausente: ${nomeNovo} (ou ${nomeLegado}, legada)`,
    )
  }

  // Só avisa se de fato for o formato antigo: quem já colocou a chave nova na
  // variável de nome legado não precisa ouvir nada.
  if (legado.startsWith('eyJ')) {
    console.warn(
      `[env] ${nomeLegado} está no formato JWT legado, que não é revogável isoladamente. ` +
        `Migre para ${nomeNovo} com a chave sb_… do painel (auditoria § S-10).`,
    )
  }
  return legado
}

/**
 * Lê uma env BOOLEANA opcional. Só 'true' e 'false' (em qualquer caixa) contam;
 * ausente ou vazia cai no padrão.
 *
 * O aviso no valor não reconhecido é o ponto: o atalho `=== 'true'` transforma
 * um `LAUDOS_SOMENTE_ALVARO=False` em `false` sem reclamar, e uma flag que
 * decide o que o paciente VÊ não pode mudar de lado por causa de digitação.
 * Aqui o valor estranho não é obedecido nem engolido — mantém o padrão e diz.
 */
export function booleanEnv(name: string, padrao: boolean): boolean {
  const bruto = process.env[name]
  if (bruto === undefined || bruto.trim() === '') return padrao

  const valor = bruto.trim().toLowerCase()
  if (valor === 'true') return true
  if (valor === 'false') return false

  console.warn(`[env] ${name}="${bruto}" não é 'true' nem 'false'; usando ${padrao}`)
  return padrao
}
