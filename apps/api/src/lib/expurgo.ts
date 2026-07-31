import { supabase } from './supabase.js'
import { numeroEnv } from './env.js'

// Bucket dos documentos que o PACIENTE envia (identidade, carteirinha, pedido
// médico). O bucket 'laudos' guarda output do laboratório e NÃO entra em
// expurgo nenhum aqui: é prontuário, retido por obrigação legal (ver o cabeçalho
// da migration 20260731170000).
const BUCKET = 'documentos'

// O Storage aceita uma lista por chamada, mas listas gigantes viram um request
// enorme que falha inteiro. Em lotes, uma falha custa 100 objetos, não todos.
const LOTE = 100

/** Só o que usamos do logger — assim a mesma função serve à rota (request.log) e ao script. */
export interface Log {
  info: (obj: object, msg: string) => void
  warn: (obj: object, msg: string) => void
  error: (obj: object, msg: string) => void
}

interface DocumentoAlvo {
  id: string
  storage_path: string
}

export interface ResultadoExpurgo {
  documentosRemovidos: number
  pacientesAfetados: number
}

/**
 * Remove os objetos do Storage e SÓ ENTÃO as linhas.
 *
 * A ordem é a mesma do `DELETE /documentos/:id` e pelo mesmo motivo: apagar os
 * bytes é a parte irreversível e juridicamente relevante, então vem primeiro. Se
 * o Storage falhar, abortamos e as linhas ficam — o próximo ciclo tenta de novo
 * (`storage.remove` é idempotente: path inexistente não é erro). A ordem inversa
 * trocaria isso por bytes órfãos, invisíveis e sem caminho de retry, porque a
 * linha que apontava para eles já teria sumido.
 */
async function removerDocumentos(docs: DocumentoAlvo[], log: Log): Promise<number> {
  let removidos = 0

  for (let i = 0; i < docs.length; i += LOTE) {
    const lote = docs.slice(i, i + LOTE)

    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove(lote.map((d) => d.storage_path))
    if (storageError) {
      // Não jogamos fora os lotes já concluídos: o que foi apagado, foi.
      log.error({ err: storageError, lote: lote.length }, 'Falha ao remover objetos do Storage')
      throw new Error('Falha ao remover arquivos do Storage')
    }

    const { error: delError } = await supabase
      .from('documentos')
      .delete()
      .in(
        'id',
        lote.map((d) => d.id),
      )
    if (delError) {
      // Risco residual conhecido e aceito: linha viva apontando para objeto já
      // removido. Feio (a signed URL 404), mas retriável — o próximo ciclo
      // encontra as mesmas linhas e refaz o par.
      log.error({ err: delError, lote: lote.length }, 'Objetos removidos, mas linhas permaneceram')
      throw new Error('Falha ao remover registros de documento')
    }

    removidos += lote.length
  }

  return removidos
}

/** Apaga todos os documentos de um paciente. Usado pela exclusão de conta. */
export async function expurgarDocumentosDoPaciente(pacienteId: string, log: Log): Promise<number> {
  const { data, error } = await supabase
    .from('documentos')
    .select('id, storage_path')
    .eq('paciente_id', pacienteId)
  if (error) {
    throw new Error('Falha ao listar documentos do paciente')
  }
  return removerDocumentos((data ?? []) as DocumentoAlvo[], log)
}

function corte(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Rotina de retenção (LGPD art. 15/16: eliminar ao fim da finalidade).
 *
 * Dois prazos, porque as duas finalidades acabam em momentos diferentes:
 *
 *   Documento DE COLETA (`agendamento_id` preenchido — na prática o pedido
 *   médico). A finalidade acaba quando a coleta acontece; o prazo extra existe
 *   só para conferência e reprocessamento. Contado a partir do `data_hora` do
 *   agendamento, não do upload: o que importa é quando a coleta ocorreu.
 *
 *   Documento PERENE (`agendamento_id` null — identidade, carteirinha). A
 *   finalidade é identificar a pessoa no balcão, e ela dura enquanto durar a
 *   relação. Por isso o critério NÃO é a idade do arquivo sozinha: é o paciente
 *   estar inativo — sem nenhuma coleta na janela. Um paciente que vem todo mês
 *   nunca tem a identidade apagada, e é o certo.
 *
 * Os prazos são configuráveis porque são decisão do laboratório, não do código.
 * Os padrões (90 dias / 24 meses) são conservadores: erram para o lado de reter
 * um pouco mais, que é o lado recuperável — apagar cedo demais é irreversível.
 */
export async function expurgarDocumentosVencidos(log: Log): Promise<ResultadoExpurgo> {
  const diasColeta = numeroEnv('RETENCAO_DOC_COLETA_DIAS', 90, 1)
  const mesesPerenes = numeroEnv('RETENCAO_DOC_PERENE_MESES', 24, 1)
  const diasPerenes = Math.round(mesesPerenes * 30.44) // média do mês gregoriano

  const alvos: DocumentoAlvo[] = []
  const pacientes = new Set<string>()

  // --- 1) Documentos de coleta já passada -----------------------------------
  // `agendamentos!inner` faz o PostgREST gerar um INNER JOIN, então o filtro por
  // data_hora do agendamento é aplicado no banco, não aqui.
  const { data: deColeta, error: erroColeta } = await supabase
    .from('documentos')
    .select('id, storage_path, paciente_id, agendamentos!inner(data_hora)')
    .not('agendamento_id', 'is', null)
    .lt('agendamentos.data_hora', corte(diasColeta))
  if (erroColeta) {
    log.error({ err: erroColeta }, 'Falha ao listar documentos de coleta vencidos')
    throw new Error('Falha ao listar documentos de coleta vencidos')
  }
  for (const d of (deColeta ?? []) as unknown as (DocumentoAlvo & { paciente_id: string })[]) {
    alvos.push({ id: d.id, storage_path: d.storage_path })
    pacientes.add(d.paciente_id)
  }

  // --- 2) Documentos perenes de paciente inativo ----------------------------
  // Feito em dois passos de propósito: "paciente SEM agendamento recente" é um
  // anti-join, que o PostgREST não expressa. Com o volume de um laboratório
  // (milhares, não milhões) o filtro em memória é honesto e legível; se um dia
  // não for, isto vira uma view no banco.
  const { data: perenes, error: erroPerenes } = await supabase
    .from('documentos')
    .select('id, storage_path, paciente_id')
    .is('agendamento_id', null)
    .lt('criado_em', corte(diasPerenes))
  if (erroPerenes) {
    log.error({ err: erroPerenes }, 'Falha ao listar documentos perenes')
    throw new Error('Falha ao listar documentos perenes')
  }

  const candidatos = (perenes ?? []) as (DocumentoAlvo & { paciente_id: string })[]
  if (candidatos.length > 0) {
    const idsCandidatos = [...new Set(candidatos.map((d) => d.paciente_id))]

    const { data: ativos, error: erroAtivos } = await supabase
      .from('agendamentos')
      .select('paciente_id')
      .in('paciente_id', idsCandidatos)
      .gte('data_hora', corte(diasPerenes))
    if (erroAtivos) {
      log.error({ err: erroAtivos }, 'Falha ao verificar atividade dos pacientes')
      throw new Error('Falha ao verificar atividade dos pacientes')
    }
    const ativo = new Set(((ativos ?? []) as { paciente_id: string }[]).map((a) => a.paciente_id))

    for (const d of candidatos) {
      if (ativo.has(d.paciente_id)) continue
      alvos.push({ id: d.id, storage_path: d.storage_path })
      pacientes.add(d.paciente_id)
    }
  }

  if (alvos.length === 0) {
    log.info({ diasColeta, mesesPerenes }, 'Expurgo: nada vencido')
    return { documentosRemovidos: 0, pacientesAfetados: 0 }
  }

  const documentosRemovidos = await removerDocumentos(alvos, log)
  log.info(
    { documentosRemovidos, pacientesAfetados: pacientes.size, diasColeta, mesesPerenes },
    'Expurgo concluído',
  )
  return { documentosRemovidos, pacientesAfetados: pacientes.size }
}

/**
 * Exclusão de conta a pedido do titular (LGPD art. 18, VI).
 *
 * A ordem abaixo não é arbitrária — cada passo só pode falhar de um jeito que o
 * seguinte consiga consertar:
 *
 *   1. Documentos (Storage e depois linhas). Antes de tudo, porque é a parte
 *      irreversível; se falhar aqui, nada mais aconteceu e o paciente reclica.
 *   2. RPC: desvincula a conta, anonimiza contato e abre a trilha. É o passo que
 *      DESARMA O CASCADE — com `auth_user_id` já null, apagar o usuário do Auth
 *      não derruba prontuário nem trilha (ver a migration).
 *   3. `deleteUser` no Auth. Só agora, e por isso mesmo com segurança.
 *   4. Fecha a trilha.
 *
 * Se (3) falhar, a conta fica órfã no Auth: sem `pacientes.auth_user_id`, o
 * `middlewares/auth.ts` não resolve mais paciente nenhum, então ela não dá
 * acesso a nada — mas ainda existe, e `exclusoes_conta.auth_removido_em` fica
 * null justamente para alguém terminar o serviço. É o único estado intermediário
 * possível, e ele é seguro por construção.
 */
export async function excluirContaPaciente(pacienteId: string, log: Log): Promise<void> {
  const documentosRemovidos = await expurgarDocumentosDoPaciente(pacienteId, log)

  const { data, error } = await supabase
    .rpc('excluir_conta_paciente', { p_paciente_id: pacienteId })
    .single()
  if (error || !data) {
    log.error({ err: error, pacienteId }, 'Falha ao desvincular a conta do paciente')
    throw new Error('Falha ao excluir conta')
  }
  const { exclusao_id: exclusaoId, auth_user_id: authUserId } = data as {
    exclusao_id: string
    auth_user_id: string
  }

  const { error: authError } = await supabase.auth.admin.deleteUser(authUserId)
  if (authError) {
    // NÃO relançamos: do ponto de vista do titular a conta já não existe (o
    // acesso morreu no passo 2) e os documentos já foram apagados. Falhar a
    // resposta agora faria o paciente repetir uma operação que não é mais
    // repetível — o paciente já está desvinculado. Fica o log e a trilha aberta.
    log.error(
      { err: authError, pacienteId, exclusaoId },
      'Conta desvinculada, mas usuário permanece no Auth — concluir manualmente',
    )
    return
  }

  const { error: trilhaError } = await supabase
    .from('exclusoes_conta')
    .update({ auth_removido_em: new Date().toISOString(), documentos_removidos: documentosRemovidos })
    .eq('id', exclusaoId)
  if (trilhaError) {
    log.error({ err: trilhaError, exclusaoId }, 'Exclusão concluída, mas trilha não foi fechada')
  }
}
