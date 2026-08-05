import { supabase } from './supabase.js'
import { expurgarDocumentosDoPaciente, type Log } from './expurgo.js'

// Apagamento TOTAL de um paciente — imagens, resultados, agendamentos e cadastro.
//
// Isto NÃO é a exclusão de conta do titular (LGPD art. 18, VI). Aquela é
// `excluirContaPaciente` em expurgo.ts, e ela RETÉM o prontuário de propósito:
// resultado e laudo são registro que a Resolução CFM 1.821/2007 manda guardar
// por 20 anos (ver o cabeçalho da migration 20260731170000). Se o que você tem
// na mão é um pedido de paciente real, o caminho é aquele, não este.
//
// Este arquivo existe para LIMPAR DADO DE TESTE: o paciente que sujou o banco
// durante um teste de integração, um seed, uma conferência com login real. Aí
// não há prontuário para reter — há lixo para tirar do caminho, incluindo os
// bytes no Storage, que são justamente o que um `delete from pacientes` no
// painel do Supabase NÃO leva junto.
//
// O QUE O CASCADE FAZ E O QUE ELE NÃO FAZ
// `agendamentos`, `resultados`, `exam_results`, `documentos` e
// `correcoes_identidade` referenciam `pacientes(id) on delete cascade`, então
// apagar a linha do paciente derruba as cinco. O Storage não tem cascade: os
// objetos dos buckets `documentos` e `laudos` ficam órfãos, invisíveis e sem
// caminho de retry — a linha que apontava para eles já sumiu. Por isso a ordem
// aqui é a mesma do expurgo: bytes primeiro, linha depois.
//
// O QUE SOBREVIVE, DE PROPÓSITO
// `exclusoes_conta` e `auditoria_acesso` não têm foreign key para `pacientes`
// (migrations 20260803120000 e 20260803140000): trilha que morre junto com o
// objeto auditado não prova nada. As duas guardam só metadado e UUID opaco, e
// continuam lá depois deste apagamento. É o desenho certo, não sobra.

const BUCKET_DOCUMENTOS = 'documentos'
const BUCKET_LAUDOS = 'laudos'

// Mesmo motivo do expurgo: lista gigante vira um request enorme que falha
// inteiro. Em lotes, uma falha custa 100 objetos, não todos.
const LOTE = 100

// Paginação do `list` do Storage. O default da API é 100; explicitar deixa
// claro que o laço abaixo existe por causa dele.
const PAGINA = 100

export interface PacienteAlvo {
  id: string
  nome: string
  authUserId: string | null
  excluidoEm: string | null
}

export interface InventarioPaciente {
  paciente: PacienteAlvo
  /** Objetos do bucket `documentos` — as imagens que o paciente enviou. */
  objetosDocumentos: string[]
  /** Objetos presentes no bucket sem linha correspondente em `documentos`. */
  objetosOrfaos: string[]
  /** Paths de `resultados.laudo_url` / `declaracao_url` no bucket `laudos`. */
  objetosLaudos: string[]
  documentos: number
  resultados: number
  examResults: number
  agendamentos: number
}

export interface ResultadoApagamento {
  objetosRemovidos: number
  documentosRemovidos: number
  orfaosRemovidos: number
  laudosRemovidos: number
  authRemovido: boolean
}

/**
 * Acha o paciente por CPF ou por id.
 *
 * CPF continua em claro em `pacientes.cpf` — é a chave única e o que sobrou de
 * legível depois do corte do S-06, então é por ele que um operador escolhe.
 * Devolve `null` quando não existe; quem chama decide se isso é erro.
 */
export async function resolverPaciente(seletor: {
  cpf?: string
  id?: string
}): Promise<PacienteAlvo | null> {
  const consulta = supabase.from('pacientes').select('id, nome, auth_user_id, excluido_em')

  const { data, error } = await (seletor.id
    ? consulta.eq('id', seletor.id)
    : consulta.eq('cpf', (seletor.cpf ?? '').replace(/\D/g, ''))
  ).maybeSingle()

  if (error) {
    throw new Error('Falha ao localizar o paciente')
  }
  if (!data) return null

  return {
    id: data.id as string,
    nome: data.nome as string,
    authUserId: (data.auth_user_id as string | null) ?? null,
    excluidoEm: (data.excluido_em as string | null) ?? null,
  }
}

/** Lista tudo que existe no bucket sob o prefixo `{pacienteId}/`. */
async function listarObjetosDoPaciente(pacienteId: string, log: Log): Promise<string[]> {
  const paths: string[] = []

  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await supabase.storage
      .from(BUCKET_DOCUMENTOS)
      .list(pacienteId, { limit: PAGINA, offset })
    if (error) {
      log.error({ err: error, pacienteId }, 'Falha ao listar objetos do paciente no Storage')
      throw new Error('Falha ao listar objetos do Storage')
    }

    const pagina = (data ?? []) as { name: string }[]
    // `list` devolve o nome relativo ao prefixo; o path completo é o que o
    // `remove` espera.
    for (const obj of pagina) paths.push(`${pacienteId}/${obj.name}`)

    if (pagina.length < PAGINA) break
  }

  return paths
}

/**
 * Levanta tudo que este paciente tem, sem apagar nada.
 *
 * É o que o `--dry-run` imprime, e é a razão de o script ser dry-run por
 * padrão: apagar é irreversível, e conferir a lista contra o paciente que você
 * TINHA EM MENTE é a única barreira entre limpar dado de teste e limpar o de
 * outra pessoa.
 */
export async function inventariarPaciente(
  paciente: PacienteAlvo,
  log: Log,
): Promise<InventarioPaciente> {
  const [docs, resultados, exames, agendamentos, noBucket] = await Promise.all([
    linhas('documentos', paciente.id, 'id, storage_path', log),
    linhas('resultados', paciente.id, 'id, laudo_url, declaracao_url', log),
    linhas('exam_results', paciente.id, 'id', log),
    linhas('agendamentos', paciente.id, 'id', log),
    listarObjetosDoPaciente(paciente.id, log),
  ])

  const objetosDocumentos = docs.map((d) => d.storage_path as string)

  // Órfão = está no bucket e nenhuma linha aponta para ele. Acontece quando um
  // teste derruba a linha sem passar pelo Storage — exatamente o histórico que
  // a migration 20260803120000 registrou. Sem esta varredura, o apagamento
  // "completo" deixaria os bytes lá.
  const conhecidos = new Set(objetosDocumentos)
  const objetosOrfaos = noBucket.filter((p) => !conhecidos.has(p))

  // Um mesmo PDF pode ser laudo de um resultado e declaração de outro; o Set
  // evita mandar o path duas vezes no mesmo `remove`.
  const objetosLaudos = [
    ...new Set(
      resultados
        .flatMap((r) => [r.laudo_url, r.declaracao_url])
        .filter((p): p is string => typeof p === 'string' && p.length > 0),
    ),
  ]

  return {
    paciente,
    objetosDocumentos,
    objetosOrfaos,
    objetosLaudos,
    documentos: docs.length,
    resultados: resultados.length,
    examResults: exames.length,
    agendamentos: agendamentos.length,
  }
}

async function linhas(
  tabela: string,
  pacienteId: string,
  colunas: string,
  log: Log,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.from(tabela).select(colunas).eq('paciente_id', pacienteId)
  if (error) {
    log.error({ err: error, tabela, pacienteId }, 'Falha ao inventariar tabela do paciente')
    throw new Error(`Falha ao listar ${tabela} do paciente`)
  }
  return (data ?? []) as unknown as Record<string, unknown>[]
}

/** Remove objetos em lotes. Idempotente: path inexistente não é erro no Storage. */
async function removerObjetos(bucket: string, paths: string[], log: Log): Promise<number> {
  let removidos = 0

  for (let i = 0; i < paths.length; i += LOTE) {
    const lote = paths.slice(i, i + LOTE)
    const { error } = await supabase.storage.from(bucket).remove(lote)
    if (error) {
      // Não jogamos fora os lotes já concluídos: o que foi apagado, foi.
      log.error({ err: error, bucket, lote: lote.length }, 'Falha ao remover objetos do Storage')
      throw new Error(`Falha ao remover objetos do bucket ${bucket}`)
    }
    removidos += lote.length
  }

  return removidos
}

/**
 * Apaga o paciente inteiro. Irreversível.
 *
 * A ordem, e o porquê de cada passo poder falhar sem estragar o seguinte:
 *
 *   1. Documentos (Storage e depois as linhas), via a mesma função que a
 *      exclusão de conta usa. Falhar aqui não mexeu em mais nada.
 *   2. Órfãos do bucket `documentos` e PDFs do bucket `laudos`. Ainda antes de
 *      qualquer delete de linha, porque é da linha que sai o path: apagá-la
 *      primeiro cegaria o retry.
 *   3. A linha de `pacientes` — e com ela, por cascade, agendamentos,
 *      resultados, exam_results, documentos e correcoes_identidade.
 *   4. O usuário no Auth, se houver. Por último de propósito: se falhar, sobra
 *      uma conta que não resolve paciente nenhum (o middlewares/auth.ts procura
 *      por `auth_user_id` e não acha linha), então ela não dá acesso a nada — o
 *      mesmo estado intermediário seguro que a S-09 documenta.
 */
export async function apagarPacienteCompleto(
  paciente: PacienteAlvo,
  inventario: InventarioPaciente,
  log: Log,
): Promise<ResultadoApagamento> {
  const documentosRemovidos = await expurgarDocumentosDoPaciente(paciente.id, log)
  const orfaosRemovidos = await removerObjetos(BUCKET_DOCUMENTOS, inventario.objetosOrfaos, log)
  const laudosRemovidos = await removerObjetos(BUCKET_LAUDOS, inventario.objetosLaudos, log)

  const { error: delError } = await supabase.from('pacientes').delete().eq('id', paciente.id)
  if (delError) {
    log.error({ err: delError, pacienteId: paciente.id }, 'Falha ao apagar a linha do paciente')
    throw new Error('Falha ao apagar o paciente')
  }

  let authRemovido = false
  if (paciente.authUserId) {
    const { error: authError } = await supabase.auth.admin.deleteUser(paciente.authUserId)
    if (authError) {
      // Não relançamos: o paciente já não existe e a conta órfã não abre porta
      // nenhuma. Falhar agora faria o operador repetir uma operação que já não
      // é repetível — não há mais linha para reencontrar.
      log.error(
        { err: authError, pacienteId: paciente.id },
        'Paciente apagado, mas o usuário permanece no Auth — remover à mão',
      )
    } else {
      authRemovido = true
    }
  }

  return {
    objetosRemovidos: documentosRemovidos + orfaosRemovidos + laudosRemovidos,
    documentosRemovidos,
    orfaosRemovidos,
    laudosRemovidos,
    authRemovido,
  }
}
