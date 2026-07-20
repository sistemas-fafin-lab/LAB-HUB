import type { FastifyInstance } from 'fastify'
import { supabase } from '../lib/supabase.js'
import { cadastroSchema } from '../schemas/cadastro.js'
import { toPaciente } from '../lib/mappers.js'

// Toggle do fluxo de confirmação de e-mail.
//  - false (default, fase de testes): NÃO dispara e-mail; o front loga direto.
//  - true (produção): dispara o e-mail e o front mostra "confirme seu e-mail".
// A lógica e as telas dos dois caminhos ficam preservadas; só este flag muda.
const REQUIRE_EMAIL_CONFIRMATION = process.env.REQUIRE_EMAIL_CONFIRMATION === 'true'

export async function cadastroRoutes(app: FastifyInstance): Promise<void> {
  // POST /cadastro — auto-cadastro do paciente (sem auth; rate-limit estrito).
  // Cria o usuário no Auth e vincula a linha em `pacientes`. Se a recepção do
  // FlowLab já tiver pré-criado um paciente "fantasma" com este CPF (sem
  // auth_user_id), o cadastro REIVINDICA essa linha em vez de criar outra — assim
  // o histórico (agendamentos feitos no balcão) já aparece para a conta nova.
  // Se a etapa do banco falhar, remove o usuário recém-criado para não deixar
  // conta órfã (mas nunca apaga uma linha de paciente que já existia).
  app.post(
    '/cadastro',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = cadastroSchema.safeParse(request.body)
      if (!parsed.success) {
        throw app.httpErrors.badRequest(parsed.error.message)
      }
      const { email, password, nome, cpf, sexo, dataNascimento, telefone } = parsed.data

      // 1) Procura uma linha existente com este CPF (chave do claim).
      //    - com auth_user_id  → já é de uma conta: CPF em uso.
      //    - sem auth_user_id  → fantasma da recepção: será reivindicado abaixo.
      const { data: existente, error: buscaErr } = await supabase
        .from('pacientes')
        .select('id, auth_user_id')
        .eq('cpf', cpf)
        .maybeSingle()
      if (buscaErr) {
        throw app.httpErrors.internalServerError('Falha ao verificar CPF')
      }
      if (existente?.auth_user_id) {
        throw app.httpErrors.conflict('CPF já cadastrado')
      }

      // 2) Cria o usuário no Auth alinhado ao flag: em dev
      //    (REQUIRE_EMAIL_CONFIRMATION=false) já cria confirmado para o front logar
      //    direto; em produção cria não confirmado (login só após confirmar o e-mail).
      const { data: created, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: !REQUIRE_EMAIL_CONFIRMATION,
      })
      if (authError || !created?.user) {
        // E-mail já em uso normalmente cai aqui.
        throw app.httpErrors.badRequest(authError?.message ?? 'Falha ao criar usuário')
      }
      const userId = created.user.id

      // 3) Grava o paciente: reivindica o fantasma (UPDATE) ou insere novo. Em
      //    qualquer falha, faz rollback do usuário do Auth.
      let paciente: unknown
      let dbError: { code?: string } | null = null

      if (existente) {
        // Reivindica anexando o auth e preenchendo os campos que o fantasma não
        // tinha (email/sexo) — o próprio paciente é a fonte da verdade sobre seus
        // dados. O `.is('auth_user_id', null)` garante um único vencedor sob
        // corrida: se outro cadastro reivindicou primeiro, o UPDATE não casa.
        const { data, error } = await supabase
          .from('pacientes')
          .update({
            auth_user_id: userId,
            nome,
            email,
            sexo,
            data_nascimento: dataNascimento,
            ...(telefone ? { telefone } : {}),
          })
          .eq('id', existente.id)
          .is('auth_user_id', null)
          .select()
          .maybeSingle()
        paciente = data
        dbError = error
        if (!error && !data) {
          // A linha foi reivindicada por outro cadastro entre o SELECT e o UPDATE.
          await supabase.auth.admin.deleteUser(userId)
          throw app.httpErrors.conflict('CPF já cadastrado')
        }
      } else {
        const { data, error } = await supabase
          .from('pacientes')
          .insert({
            auth_user_id: userId,
            nome,
            email,
            cpf,
            sexo,
            data_nascimento: dataNascimento,
            ...(telefone ? { telefone } : {}),
          })
          .select()
          .single()
        paciente = data
        dbError = error
      }
      if (dbError || !paciente) {
        await supabase.auth.admin.deleteUser(userId)
        if (dbError?.code === '23505') {
          throw app.httpErrors.conflict('CPF já cadastrado')
        }
        throw app.httpErrors.internalServerError('Falha ao criar paciente')
      }

      // 4) Em produção, dispara o e-mail de confirmação (best-effort; exige SMTP
      //    e "Confirm email" habilitado no projeto). Em testes, pula esta etapa.
      if (REQUIRE_EMAIL_CONFIRMATION) {
        const { error: mailError } = await supabase.auth.resend({ type: 'signup', email })
        if (mailError) {
          request.log.warn({ err: mailError }, 'Falha ao enviar e-mail de confirmação')
        }
      }

      return reply.code(201).send({
        requiresEmailConfirmation: REQUIRE_EMAIL_CONFIRMATION,
        paciente: toPaciente(paciente as Parameters<typeof toPaciente>[0]),
      })
    },
  )
}
