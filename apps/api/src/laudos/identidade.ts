// ---------------------------------------------------------------------------
// Barreira de identidade: o laudo que volta do LIS é do paciente que pediu?
// ---------------------------------------------------------------------------
//
// POR QUE ISTO EXISTE
//
// Nenhum dos dois LIS aceita filtro por paciente na busca que interessa:
// `aol.listOrders` pagina TODAS as OS da entidade no período e
// `aplis.requisicaoListar` varre a base inteira — o recorte por paciente
// acontece aqui, em memória, sobre um universo que contém todo mundo.
//
// Pior: o elo OS↔paciente é o `idOsLis`, digitado À MÃO pela recepção (ver o
// levantamento em aol.ts). `normalizaIdOsLis` ainda coage "O"→"0" para
// recuperar erros de digitação, o que aumenta a chance de um código errado
// normalizar exatamente para o `cod_requisicao` de OUTRO paciente. Esse vínculo
// é gravado uma vez e nunca revisto.
//
// Ou seja: o pipeline inteiro depende de um campo manual estar certo. Esta
// barreira troca essa suposição por uma verificação — os dois LIS devolvem o
// CPF do paciente no próprio payload do resultado, e é ele que decide.

export type Veredito = 'confere' | 'diverge' | 'indisponivel'

const soDigitos = (v: string | null | undefined): string => String(v ?? '').replace(/\D/g, '')

/**
 * Confere o CPF que veio no payload do LIS contra o CPF do paciente do token.
 *
 * O `esperado` é sempre o CPF resolvido de `pacientes` pelo `request.pacienteId`
 * — nunca um valor vindo do cliente. O `doPayload` é o que o LIS afirmou sobre
 * o dono daquele resultado.
 *
 * Compara só dígitos: o ApLIS devolve "52998224725" e a AOL "179.532.547-00".
 *
 * `indisponivel` quando qualquer um dos lados não tem 11 dígitos — inclui o
 * campo ausente, vazio ou truncado. NÃO é o mesmo que `diverge`: ver a política
 * em `deveBloquear`.
 */
export function conferirCpf(esperado: string, doPayload: string | null | undefined): Veredito {
  const a = soDigitos(esperado)
  const b = soDigitos(doPayload)
  if (a.length !== 11 || b.length !== 11) return 'indisponivel'
  return a === b ? 'confere' : 'diverge'
}

/**
 * A política de reação, num lugar só para não divergir entre os caminhos.
 *
 * Só `diverge` bloqueia. `indisponivel` passa DE PROPÓSITO: a instalação de
 * teste do ApLIS não preenche o CPF do paciente e o atributo de identidade da
 * AOL ainda não foi confirmado contra um XML real (ver extrairCpfPaciente em
 * aol.ts) — bloquear no escuro zeraria a tela de todo mundo em vez de proteger
 * alguém. Quem não pode ser verificado é logado em warn e contado pelo script
 * de auditoria (scripts/auditar-vinculos.ts); é essa contagem que diz quando dá
 * para apertar a regra.
 */
export function deveBloquear(veredito: Veredito): boolean {
  return veredito === 'diverge'
}

/**
 * A política FECHADA, para fonte nova que ainda não ganhou confiança: só passa
 * o que `confere`. É a do PDF "Laudo EXTERNO" (ver service.ts, FASE 2.2) — ali
 * `indisponivel` também barra, porque depois dela só resta a barreira sobre o
 * payload da AOL, que muitas vezes vem sem CPF.
 */
export function deveBloquearFechado(veredito: Veredito): boolean {
  return veredito !== 'confere'
}

/**
 * Junta dois vereditos sobre a MESMA coisa vindos de lugares diferentes (a
 * mesma O.S. em dois anexos, por exemplo): o pior vence. Basta um lugar dizer
 * que é de outra pessoa para ser de outra pessoa; basta um não saber para não
 * se saber.
 */
export function piorVeredito(a: Veredito | undefined, b: Veredito): Veredito {
  if (a === 'diverge' || b === 'diverge') return 'diverge'
  if (a === 'indisponivel' || b === 'indisponivel') return 'indisponivel'
  return 'confere'
}

// ---------------------------------------------------------------------------
// Segunda prova: nome + nascimento
// ---------------------------------------------------------------------------
//
// O CPF não fecha tudo. Medição de 25/11/2026 sobre 488 O.S. dos laudos
// anexados: 14 saíram sem CPF impresso e 3 com um CPF diferente do cadastro —
// e nessas 17 o NOME impresso era o do paciente (em 15, o nascimento também).
// Descartá-las deixava exame do próprio paciente de fora.
//
// Nome + nascimento só valem JUNTOS e EXATOS. Nome sozinho tem homônimo;
// nascimento sozinho, mais ainda. E "parecido" não serve: é a mesma tolerância
// que fez o `idOsLis` casar com o paciente errado.
//
// O que esta prova NÃO tem: evidência de que barra laudo alheio. Na medição não
// apareceu nenhum laudo com outro nome, então só se sabe que ela quase não
// barra os do próprio paciente (7 nascimentos divergentes em 488).

export interface Pessoa {
  nome: string | null | undefined
  /** "dd/mm/aaaa" (apLIS, laudo) ou "aaaa-mm-dd…" (ISO). */
  nascimento: string | null | undefined
}

/** Maiúsculas, sem acento, só letras, um espaço entre as palavras. */
function nomeNormalizado(nome: string | null | undefined): string {
  return String(nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A data como "aaaa-mm-dd", ou '' se não estiver num dos dois formatos. */
function dataNormalizada(data: string | null | undefined): string {
  const texto = String(data ?? '').trim()
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  return /^(\d{4}-\d{2}-\d{2})(?:$|[T ])/.exec(texto)?.[1] ?? ''
}

/**
 * Confere nome + nascimento do laudo contra o cadastro do paciente.
 *
 * `indisponivel` quando falta qualquer peça de qualquer lado, ou quando o nome
 * tem uma palavra só (aí ele não distingue ninguém). `confere` exige os dois
 * iguais; qualquer diferença é `diverge`.
 */
export function conferirPessoa(esperado: Pessoa, doLaudo: Pessoa): Veredito {
  const nomes = [nomeNormalizado(esperado.nome), nomeNormalizado(doLaudo.nome)] as const
  const datas = [dataNormalizada(esperado.nascimento), dataNormalizada(doLaudo.nascimento)] as const
  if (nomes.some((n) => n.split(' ').length < 2) || datas.some((d) => !d)) return 'indisponivel'
  return nomes[0] === nomes[1] && datas[0] === datas[1] ? 'confere' : 'diverge'
}

export interface IdentidadeDoLaudo {
  veredito: Veredito
  /** O que sustentou o `confere`; `null` quando não conferiu. */
  prova: 'cpf' | 'nome_nascimento' | null
}

/**
 * A identidade de uma O.S. do "Laudo EXTERNO", juntando as duas provas.
 *
 *  - CPF confere → é do paciente, e nada mais é perguntado;
 *  - senão, nome + nascimento conferem → é do paciente (inclusive quando o CPF
 *    DIVERGE: decisão do produto em 25/11/2026 — os casos reais eram o próprio
 *    paciente com outro CPF registrado naquela O.S.);
 *  - senão, CPF diverge → é de outra pessoa;
 *  - senão → não dá para afirmar. Nome ou nascimento diferente, sem CPF, não
 *    prova que é de outro: o cadastro também erra o nascimento.
 */
export function identidadeDoLaudoExterno(cpf: Veredito, pessoa: Veredito): IdentidadeDoLaudo {
  if (cpf === 'confere') return { veredito: 'confere', prova: 'cpf' }
  if (pessoa === 'confere') return { veredito: 'confere', prova: 'nome_nascimento' }
  return { veredito: cpf === 'diverge' ? 'diverge' : 'indisponivel', prova: null }
}
