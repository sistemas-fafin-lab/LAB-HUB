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
