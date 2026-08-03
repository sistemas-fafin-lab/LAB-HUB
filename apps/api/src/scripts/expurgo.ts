import 'dotenv/config'
import pino from 'pino'
import { createClient } from '@supabase/supabase-js'
import { requireEnv } from '../lib/env.js'

// ---------------------------------------------------------------------------
// Configuração (sobrescrevível por variáveis de ambiente)
// ---------------------------------------------------------------------------

const DIAS_PEDIDO_MEDICO = Number(
  process.env.EXPURGO_DIAS_PEDIDO_MEDICO ?? '90',
)
const DIAS_DOCUMENTO_PERENE = Number(
  process.env.EXPURGO_DIAS_DOCUMENTO_PERENE ?? '365',
)

// ---------------------------------------------------------------------------
// Logger, cliente Supabase e tipagem local
// ---------------------------------------------------------------------------

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })

const supabase = createClient(
  requireEnv('SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false } },
)

interface ResumoDocumento {
  id: string
  storage_path: string
  paciente_id: string
  tipo: string
  agendamento_id: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function prazo(dias: number): string {
  return new Date(Date.now() - dias * 86400_000).toISOString()
}

/**
 * storage.remove **antes** do delete do banco (LGPD).
 * Ordem inversa deixaria bytes órfãos e sem caminho de retry.
 * storage.remove é idempotente (path inexistente não é erro).
 */
async function removerDocumento(doc: ResumoDocumento): Promise<boolean> {
  const { error: storageError } = await supabase.storage
    .from('documentos')
    .remove([doc.storage_path])

  if (storageError) {
    logger.error(
      { err: storageError, storagePath: doc.storage_path, documentoId: doc.id },
      'Falha ao remover arquivo do Storage',
    )
    return false
  }

  const { error: dbError } = await supabase
    .from('documentos')
    .delete()
    .eq('id', doc.id)

  if (dbError) {
    logger.error(
      { err: dbError, documentoId: doc.id },
      'Falha ao excluir linha (arquivo já removido do Storage)',
    )
    return false
  }

  logger.info(
    { documentoId: doc.id, tipo: doc.tipo, pacienteId: doc.paciente_id },
    'Documento expurgado',
  )
  return true
}

// ---------------------------------------------------------------------------
// Rotinas de expurgo
// ---------------------------------------------------------------------------

/**
 * Pedidos médicos de coletas já realizadas (ou canceladas) há
 * `DIAS_PEDIDO_MEDICO` dias. Pedidos órfãos (sem agendamento) também entram.
 */
async function expurgarPedidosMedicos(): Promise<{
  removidos: number
  falhas: number
}> {
  const { data: pedidos, error } = await supabase
    .from('documentos')
    .select('id, storage_path, tipo, paciente_id, agendamento_id')
    .eq('tipo', 'pedido_medico')
    .lt('criado_em', prazo(DIAS_PEDIDO_MEDICO))
    .limit(1000)

  if (error) {
    logger.error({ err: error }, 'Falha ao buscar pedidos médicos para expurgo')
    return { removidos: 0, falhas: 0 }
  }

  if (!pedidos || pedidos.length === 0) return { removidos: 0, falhas: 0 }

  // Agendamentos vinculados — busca em lote para evitar N+1
  const ids = pedidos
    .filter((p) => p.agendamento_id)
    .map((p) => p.agendamento_id as string)
  const unicos = [...new Set(ids)]

  const statusPorId = new Map<string, string>()
  if (unicos.length > 0) {
    // Supabase in() tem limite de 300 itens; quebra em lotes.
    for (let i = 0; i < unicos.length; i += 300) {
      const lote = unicos.slice(i, i + 300)
      const { data: ags, error: agError } = await supabase
        .from('agendamentos')
        .select('id, status')
        .in('id', lote)
      if (agError) {
        logger.warn({ err: agError }, 'Falha ao consultar agendamentos, ignorando lote')
        continue
      }
      for (const ag of ags ?? []) {
        statusPorId.set(ag.id, ag.status)
      }
    }
  }

  let removidos = 0
  let falhas = 0

  for (const pedido of pedidos) {
    if (pedido.agendamento_id && !statusPorId.has(pedido.agendamento_id)) {
      // Agendamento pode ter sumido por cascade — trata como órfão.
    } else if (pedido.agendamento_id) {
      const status = statusPorId.get(pedido.agendamento_id)
      if (status !== 'realizado' && status !== 'cancelado') continue
    }
    // Sem agendamento ou agendamento inexistente: órfão legítimo, apaga.

    const ok = await removerDocumento(pedido)
    if (ok) removidos++
    else falhas++
  }

  return { removidos, falhas }
}

/**
 * Documentos perenes (identidade, carteirinha, outro) sem vínculo com
 * agendamento e com mais de `DIAS_DOCUMENTO_PERENE` dias de criação.
 */
async function expurgarDocumentosPerenes(): Promise<{
  removidos: number
  falhas: number
}> {
  const { data: documentos, error } = await supabase
    .from('documentos')
    .select('id, storage_path, tipo, paciente_id, agendamento_id')
    .neq('tipo', 'pedido_medico')
    .is('agendamento_id', null)
    .lt('criado_em', prazo(DIAS_DOCUMENTO_PERENE))
    .limit(1000)

  if (error) {
    logger.error(
      { err: error },
      'Falha ao buscar documentos perenes para expurgo',
    )
    return { removidos: 0, falhas: 0 }
  }

  if (!documentos || documentos.length === 0) return { removidos: 0, falhas: 0 }

  let removidos = 0
  let falhas = 0

  for (const doc of documentos) {
    const ok = await removerDocumento(doc)
    if (ok) removidos++
    else falhas++
  }

  return { removidos, falhas }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  logger.info('Expurgo iniciado')

  let totalRemovidos = 0
  let totalFalhas = 0

  const pedidos = await expurgarPedidosMedicos()
  logger.info(pedidos, 'Expurgo de pedidos médicos concluído')
  totalRemovidos += pedidos.removidos
  totalFalhas += pedidos.falhas

  const perenes = await expurgarDocumentosPerenes()
  logger.info(perenes, 'Expurgo de documentos perenes concluído')
  totalRemovidos += perenes.removidos
  totalFalhas += perenes.falhas

  if (totalRemovidos === 0 && totalFalhas === 0) {
    logger.info('Expurgo: nada vencido')
  } else {
    logger.info(
      { removidos: totalRemovidos, falhas: totalFalhas },
      'Expurgo concluído',
    )
  }
}

main().catch((err: unknown) => {
  logger.error({ err }, 'Expurgo abortado com erro')
  process.exit(1)
})
