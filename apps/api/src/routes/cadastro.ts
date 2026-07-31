import type { FastifyInstance } from 'fastify'
import { supabase } from '../lib/supabase.js'
import { cadastroSchema } from '../schemas/cadastro.js'
import { toPaciente } from '../lib/mappers.js'
import { mensagemZod } from '../lib/validacao.js'

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
  // O claim exige CPF **e** data de nascimento conferindo com o que a recepção
  // registrou; só o CPF não basta (ver `recusarClaim` abaixo).
  // Se a etapa do banco falhar, remove o usuário recém-criado para não deixar
  // conta órfã (mas nunca apaga uma linha de paciente que já existia).
  app.post(
    '/cadastro',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = cadastroSchema.safeParse(request.body)
      if (!parsed.success) {
        throw app.httpErrors.badRequest(mensagemZod(parsed.error))
      }
      const { email, password, nome, cpf, sexo, dataNascimento, telefone } = parsed.data

      // 1) Procura uma linha existente com este CPF (primeira chave do claim).
      //    - com auth_user_id  → já é de uma conta: CPF em uso.
      //    - sem auth_user_id  → fantasma da recepção: reivindicado abaixo, mas
      //      só se a data de nascimento conferir com a que o balcão registrou.
      const { data: existente, error: buscaErr } = await supabase
        .from('pacientes')
        .select('id, auth_user_id, data_nascimento, excluido_em')
        .eq('cpf', cpf)
        .maybeSingle()
      if (buscaErr) {
        throw app.httpErrors.internalServerError('Falha ao verificar CPF')
      }
      // Resposta ÚNICA para "CPF já tem conta" e "nascimento não confere".
      // Distinguir os dois entregaria de graça a informação que o atacante quer:
      // que aquele CPF está na base do laboratório e ainda não foi reivindicado
      // — ou seja, a lista de alvos. Com a resposta igual, quem chuta um CPF não
      // aprende nada; o único sinal que resta é o cadastro dar certo, e aí o
      // rate-limit de 5/min desta rota é o que segura a força bruta na data.
      const recusarClaim = () =>
        app.httpErrors.conflict(
          'Não foi possível cadastrar com esses dados. Se você já tem conta, use "Esqueci minha senha"; se não, procure a recepção.',
        )
      if (existente?.auth_user_id) {
        throw recusarClaim()
      }
      // Quem pediu exclusão de conta vira um "fantasma" de novo — auth_user_id
      // null, mas com o prontuário retido atrás (LGPD art. 16, I). Sem este
      // guard, esse prontuário voltaria a ser reivindicável só com CPF +
      // nascimento, e o prêmio aqui é o histórico clínico INTEIRO de alguém que
      // pediu para sair, não o único agendamento de um fantasma da recepção.
      // Mesma recusa genérica: distinguir os casos revelaria que aquele CPF já
      // teve conta neste laboratório, que é exatamente o que a mensagem única
      // acima existe para não contar. A pessoa que quiser voltar resolve no
      // balcão — decisão consciente de exigir gente no caminho de volta.
      if (existente?.excluido_em) {
        throw recusarClaim()
      }
      // Segundo fator de identidade do claim. CPF no Brasil não é segredo (nota
      // fiscal, cadastro de loja, vazamento público), então ele sozinho não pode
      // valer como prova para assumir uma linha com agendamentos e laudos de
      // outra pessoa. `data_nascimento` só é confiável aqui porque o trigger
      // trg_pacientes_identidade a tornou imutável depois do vínculo — sem isso,
      // bastaria reivindicar e corrigir a data em seguida.
      // Fantasma sem data registrada cai na recusa de propósito: sem o segundo
      // fator não há claim, a recepção resolve. Hoje a coluna é NOT NULL, então
      // o caso não acontece — o guard fica como defesa se a constraint afrouxar.
      if (existente && existente.data_nascimento !== dataNascimento) {
        throw recusarClaim()
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
      let dbError: { code?: string } | null

      if (existente) {
        // Reivindica anexando o auth e preenchendo os campos que o fantasma não
        // tinha (email/sexo) — o próprio paciente é a fonte da verdade sobre seus
        // dados. `data_nascimento` fica DE FORA: já foi conferida acima, então
        // reenviá-la só reabriria o caminho de sobrescrever o que a recepção
        // registrou. O `.is('auth_user_id', null)` garante um único vencedor sob
        // corrida: se outro cadastro reivindicou primeiro, o UPDATE não casa.
        const { data, error } = await supabase
          .from('pacientes')
          .update({
            auth_user_id: userId,
            nome,
            email,
            sexo,
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
          throw recusarClaim()
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
          // Outro cadastro inseriu este CPF entre o SELECT e o INSERT.
          throw recusarClaim()
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
