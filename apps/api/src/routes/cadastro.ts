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
  // Cria o usuário no Auth e a linha em `pacientes`. Se a 2ª etapa falhar,
  // remove o usuário recém-criado para não deixar conta órfã.
  app.post(
    '/cadastro',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = cadastroSchema.safeParse(request.body)
      if (!parsed.success) {
        throw app.httpErrors.badRequest(parsed.error.message)
      }
      const { email, password, nome, cpf, sexo, dataNascimento, telefone } = parsed.data

      // 1) Cria o usuário no Auth alinhado ao flag: em dev
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

      // 2) Insere o paciente; em falha, faz rollback do usuário.
      const { data: paciente, error: dbError } = await supabase
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
      if (dbError || !paciente) {
        await supabase.auth.admin.deleteUser(userId)
        if (dbError?.code === '23505') {
          throw app.httpErrors.conflict('CPF já cadastrado')
        }
        throw app.httpErrors.internalServerError('Falha ao criar paciente')
      }

      // 3) Em produção, dispara o e-mail de confirmação (best-effort; exige SMTP
      //    e "Confirm email" habilitado no projeto). Em testes, pula esta etapa.
      if (REQUIRE_EMAIL_CONFIRMATION) {
        const { error: mailError } = await supabase.auth.resend({ type: 'signup', email })
        if (mailError) {
          request.log.warn({ err: mailError }, 'Falha ao enviar e-mail de confirmação')
        }
      }

      return reply.code(201).send({
        requiresEmailConfirmation: REQUIRE_EMAIL_CONFIRMATION,
        paciente: toPaciente(paciente),
      })
    },
  )
}
