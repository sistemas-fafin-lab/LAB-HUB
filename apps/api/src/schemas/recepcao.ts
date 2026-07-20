import { z } from 'zod'
import { cpfValido } from '../lib/cpf.js'

// Schemas do canal de integração usado pela recepção do FlowLab
// (FlowLab → LAB-HUB, autenticado por API key — ver routes/integracao.ts).

// Query do GET /integracao/pacientes/buscar — typeahead por nome.
// `q` exige ao menos 2 caracteres para não varrer a base inteira a cada tecla.
export const buscarPacientesQuerySchema = z.object({
  q: z.string().trim().min(2, 'Busca precisa de ao menos 2 caracteres'),
})

// CPF pode chegar formatado; normalizamos para 11 dígitos e validamos os dígitos
// verificadores (não só o comprimento) — a linha de paciente é a chave do claim.
const cpfDigitos = z
  .string()
  .transform((s) => s.replace(/\D/g, ''))
  .refine((s) => /^\d{11}$/.test(s), 'CPF deve ter 11 dígitos')
  .refine(cpfValido, 'CPF inválido')

// Data de nascimento real: rejeita datas inexistentes (30/02), futuras ou
// anteriores a 1900. Recebe 'YYYY-MM-DD' (o regex externo já garante o formato).
function nascimentoValido(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(ano, mes - 1, dia))
  // Rejeita datas que "rolaram" (ex.: 2026-02-30 vira 2026-03-02).
  if (dt.getUTCFullYear() !== ano || dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== dia) {
    return false
  }
  return ano >= 1900 && dt.getTime() <= Date.now()
}

// Telefone BR: 10 (fixo) ou 11 (celular) dígitos, tolerando DDI +55 e máscara.
function telefoneValido(tel: string): boolean {
  let d = tel.replace(/\D/g, '')
  if (d.length === 12 || d.length === 13) d = d.replace(/^55/, '')
  return d.length === 10 || d.length === 11
}

// Body do POST /integracao/agendamentos. Dois modos mutuamente exclusivos:
//   - paciente EXISTENTE: `pacienteId` (escolhido no typeahead).
//   - paciente NOVO: `nome` + `cpf` + `dataNascimento` (find-or-create por CPF).
// O refine garante que ao menos um modo veio completo.
export const criarAgendamentoRecepcaoSchema = z
  .object({
    pacienteId: z.string().uuid().optional(),
    nome: z.string().trim().min(1).optional(),
    cpf: cpfDigitos.optional(),
    dataNascimento: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use YYYY-MM-DD)')
      .refine(nascimentoValido, 'Data de nascimento inválida')
      .optional(),
    telefone: z
      .string()
      .trim()
      .refine((t) => t === '' || telefoneValido(t), 'Telefone inválido (inclua o DDD)')
      .optional(),
    postoFlowlabId: z.string().uuid(),
    dataHora: z.string().datetime(),
  })
  .refine((d) => Boolean(d.pacienteId) || Boolean(d.nome && d.cpf && d.dataNascimento), {
    message: 'Informe pacienteId (existente) ou nome + cpf + dataNascimento (novo)',
  })

export type CriarAgendamentoRecepcaoInput = z.infer<typeof criarAgendamentoRecepcaoSchema>
