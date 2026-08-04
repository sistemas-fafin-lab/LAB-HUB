import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { supabase } from '../lib/supabase.js'
import type { AgendamentoStatus } from '@lab-hub/shared'
import { aadDe, cifrarJsonSeConfigurado, cifrarSeConfigurado } from '../lib/crypto.js'
import { verifyHmac } from '../lib/hmac.js'
import { requireEnv } from '../lib/env.js'
import { resultadoWebhookSchema } from '../schemas/resultado.js'
import { coletaStatusWebhookSchema } from '../schemas/coletaStatus.js'
import { mensagemZod } from '../lib/validacao.js'

const WEBHOOK_SECRET = requireEnv('FLOWLAB_WEBHOOK_SECRET')

// Mapeia o status do FlowLab para o status do agendamento no LAB-HUB.
const STATUS_FLOWLAB_LABHUB: Record<
  'em_coleta' | 'coletado' | 'bloqueado',
  AgendamentoStatus
> = {
  em_coleta: 'em_coleta',
  coletado: 'realizado',
  bloqueado: 'bloqueado',
}

export async function webhooksRoutes(app: FastifyInstance): Promise<void> {
  // Mantém o corpo cru (string) p/ validar o HMAC — escopo deste plugin apenas.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      done(null, body)
    },
  )

  // POST /webhooks/resultados — recebe o resultado liberado pelo FlowLab.
  app.post('/webhooks/resultados', async (request, reply) => {
    const rawBody = request.body as string
    const signature = request.headers['x-webhook-signature']
    if (typeof signature !== 'string' || !verifyHmac(rawBody, signature, WEBHOOK_SECRET)) {
      throw app.httpErrors.unauthorized('Assinatura inválida')
    }

    let json: unknown
    try {
      json = JSON.parse(rawBody)
    } catch {
      throw app.httpErrors.badRequest('JSON inválido')
    }

    const parsed = resultadoWebhookSchema.safeParse(json)
    if (!parsed.success) {
      // O chamador aqui é o FlowLab, não uma pessoa: quem depura a integração lê
      // ESTE log, não a tela. A mensagem curta vai na resposta e o detalhe fica
      // aqui. As issues do zod carregam `path` e `code`, não os valores enviados.
      request.log.warn({ issues: parsed.error.issues }, 'payload inválido')
      throw app.httpErrors.badRequest(mensagemZod(parsed.error))
    }
    const payload = parsed.data

    // Resolve o agendamento para descobrir o paciente dono do resultado.
    // maybeSingle + checagem de error: um erro de DB devolve data=null igual a
    // "não encontrado". Se tratássemos os dois iguais, uma falha transitória
    // viraria um 200 'ignored' e o FlowLab pararia de retentar — perda do resultado.
    const { data: agendamento, error: agendamentoError } = await supabase
      .from('agendamentos')
      .select('id, paciente_id')
      .eq('id', payload.agendamentoLabhubId)
      .maybeSingle()
    if (agendamentoError) {
      // Falha transitória: não damos ack (lança 5xx) p/ o FlowLab retentar.
      throw app.httpErrors.internalServerError('Falha ao carregar agendamento')
    }
    if (!agendamento) {
      // Agendamento desconhecido é falha permanente: um 404 faria o FlowLab
      // (webhook at-least-once) retentar para sempre. Respondemos 200 'ignored'
      // para encerrar os retries e logamos como erro p/ manter rastro.
      request.log.error(
        { agendamentoLabhubId: payload.agendamentoLabhubId },
        'Webhook de resultado p/ agendamento desconhecido — ignorado',
      )
      return reply.code(200).send({ ok: true, ignored: 'agendamento_nao_encontrado' })
    }

    // O id sai daqui, e não do `gen_random_uuid()` do banco, porque o AAD da
    // criptografia é `tabela:coluna:id` (S-06) — ele precisa existir ANTES de
    // cifrar. É o preço de amarrar o texto cifrado à sua linha, e o que impede
    // que alguém com escrita no banco mova o resultado de um paciente para a
    // linha de outro sem que nada acuse.
    const id = randomUUID()
    const paineisEnc = cifrarJsonSeConfigurado(
      payload.paineis,
      aadDe('resultados', 'paineis', id),
    )
    const resumoEnc = payload.resumo
      ? cifrarSeConfigurado(payload.resumo, aadDe('resultados', 'resumo', id))
      : null
    // Fase 2a: o rótulo vale tanto quanto o valor. "TESTE RÁPIDO COVID-19" ao
    // lado do nome do paciente já é a revelação, sem nenhum painel medido.
    const exameNomeEnc = cifrarSeConfigurado(
      payload.exameNome,
      aadDe('resultados', 'exame_nome', id),
    )
    const categoriaEnc = payload.categoria
      ? cifrarSeConfigurado(payload.categoria, aadDe('resultados', 'categoria', id))
      : null

    const { error } = await supabase.from('resultados').insert({
      id,
      paciente_id: agendamento.paciente_id,
      agendamento_id: agendamento.id,
      exame_nome: payload.exameNome,
      categoria: payload.categoria ?? null,
      status: 'ready',
      resumo: payload.resumo ?? null,
      paineis: payload.paineis,
      ...(paineisEnc ? { paineis_enc: paineisEnc } : {}),
      ...(resumoEnc ? { resumo_enc: resumoEnc } : {}),
      ...(exameNomeEnc ? { exame_nome_enc: exameNomeEnc } : {}),
      ...(categoriaEnc ? { categoria_enc: categoriaEnc } : {}),
      laudo_url: payload.laudoUrl ?? null,
      declaracao_url: payload.declaracaoUrl ?? null,
      liberado_em: payload.liberadoEm,
    })
    if (error) {
      // Webhook é at-least-once: reentrega do mesmo (agendamento, exame) viola a
      // unique constraint (uq_resultado_agendamento_exame, SQLSTATE 23505).
      // Tratamos como idempotente — o resultado já foi gravado, então respondemos OK
      // para o FlowLab parar de reenviar.
      if (error.code === '23505') {
        return reply.code(200).send({ ok: true, idempotency: 'ignored' })
      }
      throw app.httpErrors.internalServerError('Falha ao gravar resultado')
    }

    return reply.code(201).send({ ok: true })
  })

  // POST /webhooks/coletas — recebe do FlowLab a mudança de status da coleta
  // (check-in, coleta feita, bloqueio) e reflete no agendamento do LAB-HUB.
  app.post('/webhooks/coletas', async (request, reply) => {
    const rawBody = request.body as string
    const signature = request.headers['x-webhook-signature']
    if (typeof signature !== 'string' || !verifyHmac(rawBody, signature, WEBHOOK_SECRET)) {
      throw app.httpErrors.unauthorized('Assinatura inválida')
    }

    let json: unknown
    try {
      json = JSON.parse(rawBody)
    } catch {
      throw app.httpErrors.badRequest('JSON inválido')
    }

    const parsed = coletaStatusWebhookSchema.safeParse(json)
    if (!parsed.success) {
      // O chamador aqui é o FlowLab, não uma pessoa: quem depura a integração lê
      // ESTE log, não a tela. A mensagem curta vai na resposta e o detalhe fica
      // aqui. As issues do zod carregam `path` e `code`, não os valores enviados.
      request.log.warn({ issues: parsed.error.issues }, 'payload inválido')
      throw app.httpErrors.badRequest(mensagemZod(parsed.error))
    }
    const payload = parsed.data
    const novoStatus = STATUS_FLOWLAB_LABHUB[payload.status]

    // Carrega o agendamento. maybeSingle + checagem de error: distinguir "não
    // encontrado" de falha transitória (mesma razão do /webhooks/resultados).
    const { data: agendamento, error: agendamentoError } = await supabase
      .from('agendamentos')
      .select('id, status, exames, exames_enc')
      .eq('id', payload.agendamentoLabhubId)
      .maybeSingle()
    if (agendamentoError) {
      // Falha transitória: não damos ack (5xx) p/ o FlowLab retentar.
      throw app.httpErrors.internalServerError('Falha ao carregar agendamento')
    }
    if (!agendamento) {
      // Agendamento desconhecido é falha permanente: 200 'ignored' encerra os
      // retries do webhook at-least-once (evita retry infinito); logamos p/ rastro.
      request.log.error(
        { agendamentoLabhubId: payload.agendamentoLabhubId },
        'Webhook de coleta p/ agendamento desconhecido — ignorado',
      )
      return reply.code(200).send({ ok: true, ignored: 'agendamento_nao_encontrado' })
    }

    const atual = agendamento.status as AgendamentoStatus
    // Exames coletados vêm junto do 'coletado' (snapshot p/ a timeline). Só
    // gravamos quando a lista chega não-vazia.
    const exames = payload.exames
    const temExames = Array.isArray(exames) && exames.length > 0
    // Guardas de ordenação/idempotência — o webhook é at-least-once e pode chegar
    // fora de ordem. Não revivemos um cancelado nem regredimos de um já realizado.
    if (atual === 'cancelado') {
      return reply.code(200).send({ ok: true, ignored: 'cancelado' })
    }
    if (atual === 'realizado' && novoStatus !== 'realizado') {
      return reply.code(200).send({ ok: true, ignored: 'ja_realizado' })
    }
    if (atual === novoStatus) {
      // Status já é o alvo. Ainda assim, uma reentrega/reconciliação pode trazer os
      // exames que faltavam (ex.: curl no deliver-coleta sobre uma coleta já
      // 'realizado' cujo snapshot ficou null). Grava só os exames nesse caso.
      // "Ainda não tem snapshot" passa a olhar as DUAS colunas (S-06 fase 2a):
      // checar só a em claro faria esta reconciliação sobrescrever um snapshot
      // que já existe cifrado.
      if (temExames && agendamento.exames == null && agendamento.exames_enc == null) {
        const examesEnc = cifrarJsonSeConfigurado(
          exames,
          aadDe('agendamentos', 'exames', agendamento.id as string),
        )
        const { error } = await supabase
          .from('agendamentos')
          .update({
            exames,
            ...(examesEnc ? { exames_enc: examesEnc } : {}),
            atualizado_em: new Date().toISOString(),
          })
          .eq('id', agendamento.id)
        if (error) {
          throw app.httpErrors.internalServerError('Falha ao gravar exames do agendamento')
        }
        return reply.code(200).send({ ok: true, exames: exames.length })
      }
      return reply.code(200).send({ ok: true, idempotency: 'ignored' })
    }

    const patch: Record<string, unknown> = {
      status: novoStatus,
      atualizado_em: new Date().toISOString(),
    }
    if (temExames) {
      patch.exames = exames
      const examesEnc = cifrarJsonSeConfigurado(
        exames,
        aadDe('agendamentos', 'exames', agendamento.id as string),
      )
      if (examesEnc) patch.exames_enc = examesEnc
    }

    const { error } = await supabase.from('agendamentos').update(patch).eq('id', agendamento.id)
    if (error) {
      throw app.httpErrors.internalServerError('Falha ao atualizar status do agendamento')
    }

    return reply.code(200).send({ ok: true, status: novoStatus })
  })
}
