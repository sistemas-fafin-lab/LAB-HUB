import type { ExamMapperStrategy } from './ExamMapperStrategy.js'
import { analisesClinicasStrategy } from './strategies/AnalisesClinicasStrategy.js'
import { genericStrategy } from './strategies/GenericStrategy.js'
import {
  biopsiaComplexaStrategy,
  biopsiaFragmentosStrategy,
  biopsiaGeralStrategy,
  biopsiaSimplesStrategy,
  capturaHibridaStrategy,
  citologiaBaseLiquidaStrategy,
  citologiaDiversaStrategy,
  colpocitologiaStrategy,
  gramBacterioscopiaStrategy,
  imunohistoquimicaStrategy,
} from './strategies/LaudoTextoStrategy.js'

// Código do tipo de exame → estratégia de mapeamento.
export const STRATEGIES = new Map<string, ExamMapperStrategy>([
  ['0040', analisesClinicasStrategy],
  ['0085', citologiaBaseLiquidaStrategy],
  ['0031', colpocitologiaStrategy],
  ['0032', gramBacterioscopiaStrategy],
  ['0049', citologiaDiversaStrategy],
  ['0020', capturaHibridaStrategy],
  ['0100', biopsiaGeralStrategy],
  ['0101', biopsiaSimplesStrategy],
  ['0102', biopsiaFragmentosStrategy],
  ['0103', biopsiaComplexaStrategy],
  ['0300', imunohistoquimicaStrategy],
])

// Nem todo laudo traz o código do tipo — às vezes só o nome do exame. Estas
// palavras-chave são o plano B. Ordem importa: a primeira que casar vence.
const ESTRATEGIA_POR_NOME: Array<[string[], ExamMapperStrategy]> = [
  [['analise', 'analito', 'clínica', 'clinica', 'hematolog', 'bioquímic', 'bioquimic', 'hormôni', 'hormoni', 'vitamina', 'renal', 'hepátic', 'hepatic', 'metabol', 'eletról', 'eletrol', 'infecciolog', 'urinalise', 'urinális', 'parasitol', 'gastro', 'micronutri', 'lipídic', 'lipidic', 'hemograma', 'glicose', 'glicemi', 'colesterol', 'triglicerídeo', 'trigliceridio'], analisesClinicasStrategy],
  [['citologia', 'colpocitologia', 'papanicolaou'], colpocitologiaStrategy],
  [['captura híbrida', 'captura hibrida', 'hpv'], capturaHibridaStrategy],
  [['gram', 'bacterioscopia'], gramBacterioscopiaStrategy],
  [['biópsia', 'biopsia', 'histol', 'anatomopatol'], biopsiaGeralStrategy],
  [['imunohistoquímica', 'imunohistoquimica', 'imuno-histoquímica'], imunohistoquimicaStrategy],
]

/**
 * Resolve a estratégia a partir do código OU do nome do exame.
 *
 * Ordem: código exato → código com zeros à esquerda ("40" → "0040") → qualquer
 * numérico não mapeado → palavra-chave no nome → sigla curta ("TSH") → genérica.
 *
 * Numérico desconhecido cai em análises clínicas porque essa é a esmagadora
 * maioria do volume; citologia e biópsia têm códigos fixos e conhecidos.
 */
export function resolveStrategy(examType: string): ExamMapperStrategy {
  const t = examType.trim()

  if (STRATEGIES.has(t)) return STRATEGIES.get(t)!

  if (/^\d+$/.test(t)) {
    return STRATEGIES.get(t.padStart(4, '0')) ?? analisesClinicasStrategy
  }

  const lower = t.toLowerCase()
  for (const [palavras, strategy] of ESTRATEGIA_POR_NOME) {
    if (palavras.some((p) => lower.includes(p))) return strategy
  }

  // Sigla curta em caixa alta (ex.: "TSH", "PCR") é sempre análise clínica.
  if (/^[A-Z0-9]{1,10}$/.test(t)) return analisesClinicasStrategy

  return genericStrategy
}
