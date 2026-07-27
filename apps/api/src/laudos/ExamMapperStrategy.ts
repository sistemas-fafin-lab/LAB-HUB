import type { AolExam, AplisExam, Laudo } from './types.js'
import type { PerfilPaciente } from './mapperHelpers.js'

// Cada tipo de exame vira um Laudo de um jeito diferente: análises clínicas têm
// analitos quantitativos com faixa de referência, enquanto citologia e biópsia
// têm um texto de laudo só. A estratégia isola essa diferença.
//
// `canHandle` sobrou do desenho original: hoje quem escolhe a estratégia é o
// registry (registry.ts), por código ou nome do exame. As estratégias criadas em
// fábrica devolvem `false` justamente por isso.
//
// `perfil` (idade/sexo) é opcional e só a estratégia de análises clínicas usa —
// para reduzir a referência estratificada da AOL à linha do paciente.
//
// `map` NÃO recebe o CPF. Recebia, e nenhuma implementação usava (todas o
// declaravam como `_cpf`): a assinatura prometia uma conferência de identidade
// que ninguém fazia, o que é pior que não prometer nada num caminho crítico. A
// conferência real acontece uma vez, na fronteira do serviço, antes de qualquer
// mapeamento — ver laudos/identidade.ts.
export interface ExamMapperStrategy {
  canHandle(examType: string): boolean
  map(aol: AolExam, aplis: AplisExam | null, perfil?: PerfilPaciente): Laudo
}
