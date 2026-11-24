import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { supabase } from '../src/lib/supabase.js'
import { decifrarCpfPaciente } from '../src/lib/crypto.js'
import { numeroEnv } from '../src/lib/env.js'
import { AolService } from '../src/laudos/aol.js'
import { AplisService } from '../src/laudos/aplis.js'
import { AplisSiteService, lerConfigAplisSite, type TravaLogin } from '../src/laudos/aplisSite.js'
import { classificarOs, type ClasseOs, type OsDoPdf } from '../src/laudos/auditoriaOsPdf.js'
import { IntegrationError, LaudoError } from '../src/laudos/errors.js'
import { conferirCpf, type Veredito } from '../src/laudos/identidade.js'
import { lerLaudoExterno, type LayoutLaudoExterno } from '../src/laudos/laudoExterno.js'

// ---------------------------------------------------------------------------
// Auditoria: O.S. pelo PDF "Laudo EXTERNO" × O.S. pelo `idOsLis`.
//
// Para cada requisição, percorre o caminho novo de ponta a ponta — site interno
// do apLIS → anexo tipo 14 → O.S. e CPF extraídos do PDF — e compara com o que
// o método atual acharia (o `idOsLis` digitado à mão na AOL). É a medição que
// precede ligar o vínculo pelo PDF no portal (tickets seguintes da mesma spec).
//
// Somente LEITURA: não grava no apLIS, na AOL nem no banco. O PDF é lido em
// memória e descartado.
//
// A saída traz requisição e O.S.; NUNCA nome ou CPF de paciente.
//
// Uso (a partir de apps/api):
//   npx tsx scripts/auditar-vinculos.ts --os-pdf --paciente <uuid> [--dias N]
//   npx tsx scripts/auditar-vinculos.ts --os-pdf --requisicoes <cod1,cod2,…> [--dias N]
//
// --paciente audita as requisições de Medicina Laboratorial do paciente na
// janela. --dias (padrão: APLIS_PERIODO_DIAS, 90) é a janela das duas buscas:
// requisições no apLIS e O.S. na AOL.
// ---------------------------------------------------------------------------

const EXAME_AUDITADO = /medicina laboratorial/i

interface Argumentos {
  paciente?: string
  requisicoes: string[]
  dias: number
}

function valorDe(argv: string[], nome: string): string | undefined {
  const i = argv.indexOf(nome)
  const valor = i >= 0 ? argv[i + 1] : undefined
  return valor && !valor.startsWith('--') ? valor : undefined
}

function lerArgumentos(argv: string[]): Argumentos {
  const dias = Number(valorDe(argv, '--dias'))
  const paciente = valorDe(argv, '--paciente')
  return {
    ...(paciente ? { paciente } : {}),
    requisicoes: (valorDe(argv, '--requisicoes') ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean),
    dias: Number.isFinite(dias) && dias > 0 ? dias : numeroEnv('APLIS_PERIODO_DIAS', 90, 1),
  }
}

/**
 * A trava de login guardada em arquivo. Um script termina e leva a memória
 * junto: sem isto, rodar de novo logo depois de uma recusa seria a segunda
 * recusa seguida — e recusas seguidas ativam captcha para todos que usam o
 * mesmo usuário do apLIS.
 */
class TravaLoginEmArquivo implements TravaLogin {
  readonly #arquivo = join(tmpdir(), 'lab-hub-aplis-site.login-recusado')

  recusadoEm(): number | null {
    if (!existsSync(this.#arquivo)) return null
    const quando = Number(readFileSync(this.#arquivo, 'utf8'))
    // Arquivo ilegível: na dúvida a trava fecha, contando da última escrita.
    return Number.isFinite(quando) && quando > 0 ? quando : statSync(this.#arquivo).mtimeMs
  }

  registrarRecusa(quando: number): void {
    writeFileSync(this.#arquivo, String(quando))
  }

  limpar(): void {
    rmSync(this.#arquivo, { force: true })
  }
}

/** Uma requisição a auditar, com o CPF contra o qual o PDF é conferido. */
interface Alvo {
  requisicao: string
  idRequisicao: string | null
  /** Fica só em memória, para a conferência. Não vai para a saída. */
  cpfReferencia: string
}

interface PdfAuditado {
  os: string[]
  layout: LayoutLaudoExterno | 'falha_download'
  veredito: Veredito
}

interface RequisicaoAuditada {
  requisicao: string
  pdfs: PdfAuditado[]
  erro?: string
}

/**
 * Texto de erro que pode ir para a saída. Só passam as mensagens montadas
 * neste código; a do apLIS (`msgErro`) é texto livre do servidor e pode citar
 * o paciente, então dela saem apenas o comando e o código do erro.
 */
function mensagem(err: unknown): string {
  if (err instanceof IntegrationError && err.service === 'aplis') {
    const { cmd, codErro, http_status: http } = err.context
    return `falha no apLIS (${String(cmd ?? '?')}${codErro != null ? `, erro ${String(codErro)}` : ''}${http != null ? `, HTTP ${String(http)}` : ''})`
  }
  if (err instanceof LaudoError) return err.message
  return err instanceof Error ? `${err.name}: falha inesperada` : 'falha inesperada'
}

function janela(dias: number): { inicio: string; fim: string } {
  const inicio = new Date()
  inicio.setDate(inicio.getDate() - dias)
  return { inicio: inicio.toISOString().slice(0, 10), fim: new Date().toISOString().slice(0, 10) }
}

async function alvosDoPaciente(
  aplis: AplisService,
  pacienteId: string,
  inicio: string,
  fim: string,
): Promise<{ alvos: Alvo[]; foraDoEscopo: number }> {
  const { data, error } = await supabase.from('pacientes').select('cpf_enc').eq('id', pacienteId).maybeSingle()
  if (error) throw new LaudoError(`falha ao ler o paciente no banco (${error.code ?? 'sem código'})`)
  if (!data?.cpf_enc) throw new LaudoError('paciente não encontrado ou sem CPF cifrado')

  const cpf = decifrarCpfPaciente(pacienteId, data.cpf_enc as string)
  const requisicoes = await aplis.requisicaoListar(cpf, inicio, fim)
  const noEscopo = requisicoes.filter((r) => EXAME_AUDITADO.test(r.tipo_exame ?? ''))
  return {
    alvos: noEscopo.map((r) => ({
      requisicao: r.cod_requisicao,
      idRequisicao: r.id_requisicao ?? null,
      cpfReferencia: cpf,
    })),
    foraDoEscopo: requisicoes.length - noEscopo.length,
  }
}

/**
 * Resolve cada código informado pela API de integração: o CPF vem do
 * `requisicaoResultado` e o id interno, da listagem do mesmo paciente (só ela o
 * devolve). Uma listagem por paciente, não por requisição.
 */
async function alvosDasRequisicoes(
  aplis: AplisService,
  codigos: string[],
  inicio: string,
  fim: string,
): Promise<{ alvos: Alvo[]; falhas: RequisicaoAuditada[] }> {
  const idsPorCpf = new Map<string, Map<string, string | null>>()
  const alvos: Alvo[] = []
  const falhas: RequisicaoAuditada[] = []

  for (const requisicao of codigos) {
    try {
      const cpf = (await aplis.requisicaoResultado(requisicao)).paciente.cpf.replace(/\D/g, '')
      if (cpf.length !== 11) {
        falhas.push({ requisicao, pdfs: [], erro: 'o apLIS não informou o CPF do paciente' })
        continue
      }
      if (!idsPorCpf.has(cpf)) {
        const lista = await aplis.requisicaoListar(cpf, inicio, fim)
        idsPorCpf.set(cpf, new Map(lista.map((r) => [r.cod_requisicao, r.id_requisicao ?? null])))
      }
      alvos.push({ requisicao, idRequisicao: idsPorCpf.get(cpf)!.get(requisicao) ?? null, cpfReferencia: cpf })
    } catch (err) {
      falhas.push({ requisicao, pdfs: [], erro: mensagem(err) })
    }
  }
  return { alvos, falhas }
}

async function auditarRequisicao(site: AplisSiteService, alvo: Alvo): Promise<RequisicaoAuditada> {
  const { requisicao } = alvo
  if (!alvo.idRequisicao) {
    return { requisicao, pdfs: [], erro: 'id interno não encontrado na listagem do apLIS (fora da janela? aumente --dias)' }
  }

  try {
    const anexos = await site.listarLaudosExternos(alvo.idRequisicao, requisicao)
    const pdfs: PdfAuditado[] = []
    for (const anexo of anexos) {
      try {
        const laudo = await lerLaudoExterno(await site.baixarAnexo(anexo))
        pdfs.push({ os: laudo.os, layout: laudo.layout, veredito: conferirCpf(alvo.cpfReferencia, laudo.cpf) })
      } catch {
        pdfs.push({ os: [], layout: 'falha_download', veredito: 'indisponivel' })
      }
    }
    return { requisicao, pdfs }
  } catch (err) {
    return { requisicao, pdfs: [], erro: mensagem(err) }
  }
}

const ROTULO_CLASSE: Record<ClasseOs, string> = {
  iguais: 'nas duas, iguais',
  so_pdf: 'só no PDF',
  so_idoslis: 'só no idOsLis',
  divergentes: 'nas duas, requisições DIFERENTES',
}

/**
 * Ponto de entrada do modo `--os-pdf`. Nenhum erro sobe daqui: o tratador
 * genérico de quem chama imprime o objeto inteiro, e o contexto dos erros de
 * integração pode carregar a resposta crua do LIS.
 */
export async function auditarOsPdf(argv: string[]): Promise<void> {
  try {
    await auditar(argv)
  } catch (err) {
    console.error(`Auditoria interrompida: ${mensagem(err)}`)
    process.exitCode = 1
  }
}

async function auditar(argv: string[]): Promise<void> {
  const config = lerConfigAplisSite()
  if (!config) {
    console.log(
      'Site interno do apLIS não configurado: defina APLIS_WEB_URL, APLIS_WEB_USUARIO e\n' +
        'APLIS_WEB_SENHA (ver .env.example). Nada foi auditado.',
    )
    return
  }

  const args = lerArgumentos(argv)
  if (!args.paciente && args.requisicoes.length === 0) {
    console.log('Informe --paciente <uuid> ou --requisicoes <cod1,cod2,…>.')
    process.exitCode = 1
    return
  }

  const aplis = new AplisService()
  const aol = new AolService()
  const site = new AplisSiteService(config, { trava: new TravaLoginEmArquivo() })
  const { inicio, fim } = janela(args.dias)

  let alvos: Alvo[]
  let auditadas: RequisicaoAuditada[] = []
  let foraDoEscopo = 0
  if (args.paciente) {
    ;({ alvos, foraDoEscopo } = await alvosDoPaciente(aplis, args.paciente, inicio, fim))
  } else {
    ;({ alvos, falhas: auditadas } = await alvosDasRequisicoes(aplis, args.requisicoes, inicio, fim))
  }

  if (alvos.length === 0 && auditadas.length === 0) {
    console.log(`Nenhuma requisição de Medicina Laboratorial entre ${inicio} e ${fim}.`)
    return
  }

  console.log(`Auditando ${alvos.length} requisição(ões), janela ${inicio} a ${fim}.`)
  console.log('Listando as O.S. da entidade na AOL (não filtra por paciente — leva dezenas de segundos)…')
  const ordens = await aol.listOrders(inicio, fim)
  console.log(`${ordens.length} O.S. com idOsLis preenchido.\n`)

  try {
    for (const alvo of alvos) auditadas.push(await auditarRequisicao(site, alvo))
  } finally {
    await site.encerrar()
  }

  // PDF com CPF divergente está anexado na requisição errada: a O.S. dele não é
  // deste pedido e não entra na comparação (é o que o portal também fará).
  const cpfPorRequisicao = new Map(alvos.map((a) => [a.requisicao, a.cpfReferencia]))
  const osValidas = (r: RequisicaoAuditada): string[] =>
    r.pdfs.flatMap((p) => (p.veredito !== 'diverge' ? p.os : []))
  const doPdf: OsDoPdf[] = auditadas.flatMap((r) =>
    osValidas(r).map((os) => ({ requisicao: r.requisicao, os, cpf: cpfPorRequisicao.get(r.requisicao) ?? '' })),
  )
  const classificadas = classificarOs(
    doPdf,
    ordens,
    auditadas.map((r) => r.requisicao),
  )

  // --- por requisição -------------------------------------------------------
  for (const r of auditadas) {
    const pdf = r.erro
      ? `ERRO: ${r.erro}`
      : r.pdfs.length === 0
        ? 'sem anexo tipo 14'
        : r.pdfs.map((p) => `${p.os.join('+') || `sem O.S. (${p.layout})`} [cpf ${p.veredito}]`).join(', ')
    const pelaAol = classificadas.filter((c) => c.requisicaoIdOsLis === r.requisicao).map((c) => c.os)
    console.log(`req=${r.requisicao}  pdf: ${pdf}  |  idOsLis: ${pelaAol.join(', ') || '—'}`)
  }

  // --- por O.S. -------------------------------------------------------------
  console.log('\nO.S. que não coincidem nas duas fontes:')
  const diferentes = classificadas.filter((c) => c.classe !== 'iguais')
  for (const c of diferentes) {
    console.log(
      `  os=${c.os.padEnd(12)} ${ROTULO_CLASSE[c.classe].padEnd(34)} pdf→${c.requisicaoPdf ?? '—'}  idOsLis→${c.requisicaoIdOsLis ?? '—'}`,
    )
  }
  if (diferentes.length === 0) console.log('  nenhuma')

  // --- resumo ---------------------------------------------------------------
  const pdfs = auditadas.flatMap((r) => r.pdfs)
  const comErro = auditadas.filter((r) => r.erro).length
  const semAnexo = auditadas.filter((r) => !r.erro && r.pdfs.length === 0).length
  const comOs = auditadas.filter((r) => osValidas(r).length > 0).length
  // "Só no idOsLis" de requisição cujo PDF não foi lido não diz que o PDF não
  // traz a O.S. — só que não deu para olhar.
  const semLeitura = new Set(
    auditadas.filter((r) => r.erro || r.pdfs.some((p) => p.os.length === 0)).map((r) => r.requisicao),
  )
  const soIdOsLisSemLeitura = classificadas.filter(
    (c) => c.classe === 'so_idoslis' && semLeitura.has(c.requisicaoIdOsLis ?? ''),
  ).length
  const soPdfComCpf = classificadas.filter((c) => c.idOsLisEhCpf).length
  const layout = (l: PdfAuditado['layout']): number => pdfs.filter((p) => p.layout === l).length
  const veredito = (v: Veredito): number => pdfs.filter((p) => p.veredito === v).length
  const classe = (c: ClasseOs): number => classificadas.filter((x) => x.classe === c).length

  console.log(
    `\nResumo\n` +
      `  Requisições: ${auditadas.length} auditadas · ${comOs} com O.S. pelo PDF · ` +
      `${auditadas.length - comOs - semAnexo - comErro} com PDF sem O.S. utilizável · ${semAnexo} sem anexo tipo 14 · ${comErro} com erro\n` +
      `  PDFs: ${pdfs.length} · layout atual ${layout('atual')} · antigo ${layout('antigo')} · ` +
      `desconhecido ${layout('desconhecido')} · ilegível ${layout('ilegivel')} · falha no download ${layout('falha_download')}\n` +
      `    ${pdfs.filter((p) => p.os.length > 1).length} PDF(s) trazem mais de uma O.S.\n` +
      `  CPF do PDF: ${veredito('confere')} confere · ${veredito('diverge')} DIVERGE · ${veredito('indisponivel')} indisponível\n` +
      `  O.S.: ${classificadas.length} · ${classe('iguais')} nas duas e iguais · ${classe('so_pdf')} só no PDF · ` +
      `${classe('so_idoslis')} só no idOsLis · ${classe('divergentes')} nas duas, requisições diferentes\n` +
      `    das "só no PDF", ${soPdfComCpf} têm o CPF no idOsLis: o método atual as acha, mas como card avulso, sem a requisição\n` +
      `    das "só no idOsLis", ${soIdOsLisSemLeitura} são de requisição cujo PDF não pôde ser lido`,
  )
  if (foraDoEscopo > 0) {
    console.log(`  (${foraDoEscopo} requisição(ões) de outros exames ficaram fora: só Medicina Laboratorial é auditada)`)
  }
}
