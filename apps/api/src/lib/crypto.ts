import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Criptografia de coluna para o dado clínico (auditoria § S-06 / Parte 3).
 *
 * O Supabase já cifra disco (at rest) e trânsito (TLS). O que falta, e é o que
 * este módulo faz, é proteger contra vazamento LÓGICO: um `pg_dump`, um backup
 * baixado, uma réplica, um staging populado com dado real, acesso indevido ao
 * Studio, ou um bug futuro de RLS. Em todos esses o Postgres entrega a linha de
 * bom grado — e é por isso que a chave precisa morar FORA do banco, na env da
 * API. Chave e cadeado na mesma gaveta não protegem de nada.
 *
 * O que ele NÃO faz, e é importante não se iludir: quem compromete o servidor
 * da API tem a chave e lê tudo, e quem está autenticado como o paciente recebe
 * o dado decifrado pela própria aplicação. Criptografia de coluna nunca foi a
 * resposta para S-01/P-01 — aqueles se resolveram com controle de acesso.
 */

const VERSAO = 'v1'
const BYTES_CHAVE = 32 // AES-256
const BYTES_IV = 12 // tamanho canônico do GCM; outros valores custam desempenho e compatibilidade

/**
 * Envelope: `v1:k1:<iv_b64>:<tag_b64>:<ciphertext_b64>`
 *
 * Autodescritivo de propósito. O `keyId` embutido é o que permite rotacionar
 * sem reescrever a base inteira num único golpe: entra `k2` como chave de
 * escrita, `k1` continua só para leitura, e o backfill re-cifra em segundo
 * plano. Sem o id no envelope, rotação vira parada programada.
 *
 * O separador `:` é seguro porque base64 padrão não o produz.
 */
const PARTES_ENVELOPE = 5

interface Chaves {
  mapa: Map<string, Buffer>
  atual: string | null
}

/**
 * Lê as chaves de `PII_KEY_K1`, `PII_KEY_K2`, … (base64 de 32 bytes).
 *
 * Sem estado de módulo: a env é lida a cada chamada. É barato no volume deste
 * projeto (dezenas de linhas por request) e evita a classe de bug em que o
 * processo memoriza uma configuração que mudou — inclusive nos testes, onde
 * memoização exigiria um reset exportado só para eles.
 */
function lerChaves(): Chaves {
  const mapa = new Map<string, Buffer>()

  for (const [nome, valor] of Object.entries(process.env)) {
    const match = /^PII_KEY_(K\d+)$/.exec(nome)
    if (!match || !valor?.trim()) continue

    const id = match[1]!.toLowerCase()
    const bytes = Buffer.from(valor.trim(), 'base64')
    if (bytes.length !== BYTES_CHAVE) {
      // Falha alto: uma chave truncada só apareceria como "não decifra" muito
      // depois, quando o dado já estivesse gravado com ela.
      throw new Error(
        `${nome} não é uma chave AES-256 válida: esperados ${BYTES_CHAVE} bytes em base64, ` +
          `veio ${bytes.length}. Gere com: openssl rand -base64 32`,
      )
    }
    mapa.set(id, bytes)
  }

  // Chave de ESCRITA. Explícita via env quando há rotação em curso; por padrão,
  // a de maior número — assim acrescentar PII_KEY_K2 já promove a nova sem
  // precisar de um segundo ajuste de configuração no meio da rotação.
  const explicita = process.env.PII_CHAVE_ATUAL?.trim().toLowerCase()
  if (explicita && !mapa.has(explicita)) {
    throw new Error(`PII_CHAVE_ATUAL="${explicita}" não corresponde a nenhuma PII_KEY_* configurada`)
  }
  const atual =
    explicita ??
    [...mapa.keys()].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).pop() ??
    null

  return { mapa, atual }
}

/** Há pelo menos uma chave utilizável? */
export function criptografiaConfigurada(): boolean {
  return lerChaves().atual !== null
}

/**
 * Validação de boot, no espírito do `resolverCorsOrigin()` (P-03): configuração
 * de segurança que depende de lembrança é configuração que um dia falta.
 *
 * Em produção a ausência da chave DERRUBA o boot. É deliberado, e a alternativa
 * é pior: seguir de pé gravando laudo em claro é exatamente o "temos lint" desta
 * base — um controle que todos acreditam existir e que não existe. API fora do
 * ar é ruidoso e se resolve em um minuto; laudo em claro por três meses é
 * silencioso.
 *
 * ORDEM DO DEPLOY, que isto impõe: primeiro a env no VPS, depois o `up -d
 * --build`. Ao contrário, a API não sobe.
 */
export function validarCriptografia(): void {
  const { atual } = lerChaves() // lança se alguma chave estiver malformada

  if (atual) return

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'PII_KEY_K1 é obrigatória em produção: sem ela o dado clínico seria gravado em texto puro ' +
        '(auditoria § S-06). Gere com `openssl rand -base64 32`, guarde em cofre SEPARADO do backup ' +
        'do banco e defina no .env antes de subir o container.',
    )
  }
  // Depois do corte do S-06 a coluna em claro não é mais escrita: sem chave o
  // dado não vai para lugar nenhum, então a escrita FALHA em vez de degradar
  // para texto puro. O aviso mudou junto — dizer "será gravado em texto puro"
  // agora seria mentira, e mentira em aviso de segurança é pior que silêncio.
  console.warn(
    '[cripto] PII_KEY_K1 ausente: gravar dado clínico vai FALHAR (a coluna em ' +
      'claro deixou de ser escrita — auditoria § S-06). Leitura de linha antiga ' +
      'continua funcionando. Em produção o boot falharia aqui.',
  )
}

/**
 * AAD (dado autenticado, não cifrado) = `tabela:coluna:id_da_linha`.
 *
 * É a peça que mais se esquece e a que impede o ataque menos óbvio: sem AAD,
 * quem tem escrita no banco COPIA o ciphertext do laudo do paciente A para a
 * linha do paciente B — a decifragem funciona perfeitamente e o prontuário
 * aparece sob o dono errado, sem nenhum erro em lugar nenhum. Amarrando o texto
 * cifrado à sua posição, o GCM rejeita a linha movida.
 */
export function aadDe(tabela: string, coluna: string, id: string): string {
  return `${tabela}:${coluna}:${id}`
}

export function cifrar(texto: string, aad: string): string {
  const { mapa, atual } = lerChaves()
  if (!atual) throw new Error('Nenhuma chave de criptografia configurada (PII_KEY_K1)')

  const iv = randomBytes(BYTES_IV)
  const cipher = createCipheriv('aes-256-gcm', mapa.get(atual)!, iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const ct = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()])

  return [
    VERSAO,
    atual,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ct.toString('base64'),
  ].join(':')
}

export function decifrar(envelope: string, aad: string): string {
  const partes = envelope.split(':')
  if (partes.length !== PARTES_ENVELOPE) {
    throw new Error('Envelope de criptografia malformado')
  }
  const [versao, keyId, iv, tag, ct] = partes as [string, string, string, string, string]
  if (versao !== VERSAO) {
    throw new Error(`Envelope de criptografia desconhecido: ${versao}`)
  }

  const { mapa } = lerChaves()
  const chave = mapa.get(keyId)
  if (!chave) {
    // Cenário real: chave rotacionada e a antiga removida da env cedo demais,
    // antes de o backfill re-cifrar tudo. Dizer QUAL chave falta economiza a
    // investigação inteira.
    throw new Error(`Chave ${keyId} indisponível: o dado foi cifrado com ela e ela não está na env`)
  }

  const decipher = createDecipheriv('aes-256-gcm', chave, Buffer.from(iv, 'base64'))
  decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  // `final()` lança se a tag não conferir — dado adulterado, linha movida (AAD
  // errado) ou chave errada. Deixar propagar é o comportamento certo: melhor
  // 500 do que devolver algo em que não se pode confiar.
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString(
    'utf8',
  )
}

export function cifrarJson(valor: unknown, aad: string): string {
  return cifrar(JSON.stringify(valor), aad)
}

export function decifrarJson<T>(envelope: string, aad: string): T {
  return JSON.parse(decifrar(envelope, aad)) as T
}

/**
 * Versão para o caminho de ESCRITA durante a migração: devolve `null` quando não
 * há chave, em vez de lançar.
 *
 * Existe só para o desenvolvimento sem chave configurada continuar rodando os
 * fluxos completos. Em produção nunca devolve `null` — `validarCriptografia()`
 * já derrubou o boot antes que qualquer request chegasse aqui.
 */
export function cifrarJsonSeConfigurado(valor: unknown, aad: string): string | null {
  return criptografiaConfigurada() ? cifrarJson(valor, aad) : null
}

export function cifrarSeConfigurado(texto: string, aad: string): string | null {
  return criptografiaConfigurada() ? cifrar(texto, aad) : null
}
