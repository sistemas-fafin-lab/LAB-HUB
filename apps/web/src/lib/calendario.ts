import type { Agendamento } from '@lab-hub/shared'
import { JEJUM_LABEL } from './preparo'
import { partesNoFuso } from './regiao'

// ---------------------------------------------------------------------------
// "Adicionar ao calendário": um evento iCalendar (RFC 5545) para a coleta,
// que o paciente abre no app de agenda do aparelho.
// ---------------------------------------------------------------------------

/** 20261112T103000Z — instante em UTC, sem separadores. */
const emUtc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** Texto de propriedade: barra, vírgula, ponto e vírgula e quebra de linha escapados. */
const texto = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

export function eventoDaColeta(
  { id, postoNome, dataHora }: Pick<Agendamento, 'id' | 'postoNome' | 'dataHora'>,
  endereco: string | undefined,
  agora: Date = new Date(),
): string {
  const local = endereco ? `${postoNome}, ${endereco}` : postoNome
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lab Hub//Portal do paciente//PT-BR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${id}@labhub`,
    `DTSTAMP:${emUtc(agora)}`,
    `DTSTART:${emUtc(new Date(dataHora))}`,
    'DURATION:PT30M',
    `SUMMARY:${texto('Coleta · Lab Hub')}`,
    `LOCATION:${texto(local)}`,
    `DESCRIPTION:${texto(`Jejum de ${JEJUM_LABEL}. Leve o pedido médico e um documento com foto.`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

/** coleta-AAAA-MM-DD.ics, com o dia da coleta no fuso escolhido nas Configurações. */
export function nomeDoArquivoIcs(dataHora: string): string {
  const { ano, mes, dia } = partesNoFuso(new Date(dataHora))
  return `coleta-${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}.ics`
}
