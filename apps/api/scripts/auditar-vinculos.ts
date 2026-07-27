import 'dotenv/config'
import { writeFileSync } from 'node:fs'
import { supabase } from '../src/lib/supabase.js'
import { AolService } from '../src/laudos/aol.js'
import { AplisService } from '../src/laudos/aplis.js'
import { conferirCpf, type Veredito } from '../src/laudos/identidade.js'

// ---------------------------------------------------------------------------
// Auditoria dos vínculos já gravados em exam_results.
//
// A barreira de identidade (laudos/identidade.ts) impede que um vínculo errado
// CHEGUE À TELA, mas não conserta o que já está no banco: uma linha ligada à OS
// de outro paciente continua ocupando o `codigo_lis` (que é UNIQUE GLOBAL) e
// retendo o laudo do dono legítimo. Este script varre as linhas, pergunta a
// identidade ao LIS e classifica cada uma.
//
// Somente LEITURA — não corrige nada. Corrigir é decisão manual: a linha errada
// pode ser a única pista de um erro de digitação na recepção.
//
// Uso:
//   npx tsx scripts/auditar-vinculos.ts [--paciente <uuid>] [--dump-xml] [--limite N]
//
// --dump-xml salva a resposta crua da AOL da primeira OS auditada. É com ela que
// se confirma em qual atributo do nó <paciente> vem o CPF, para então apertar o
// extrairCpfPaciente (hoje deliberadamente tolerante).
// ---------------------------------------------------------------------------

interface Argumentos {
  paciente?: string
  dumpXml: boolean
  limite: number
}

function lerArgumentos(argv: string[]): Argumentos {
  const paciente = argv[argv.indexOf('--paciente') + 1]
  const limiteBruto = Number(argv[argv.indexOf('--limite') + 1])
  return {
    ...(argv.includes('--paciente') && paciente ? { paciente } : {}),
    dumpXml: argv.includes('--dump-xml'),
    limite: argv.includes('--limite') && Number.isFinite(limiteBruto) ? limiteBruto : 500,
  }
}

interface LinhaAuditada {
  id: string
  pacienteId: string
  codigoOs: string | null
  codigoLis: string | null
  fonte: 'aol' | 'aplis'
  veredito: Veredito | 'erro'
  detalhe: string
}

const aol = new AolService()
const aplis = new AplisService()

/** Pergunta ao LIS de quem é aquele resultado. `null` = não deu para perguntar. */
async function identidadeNoLis(
  codigoOs: string | null,
  codigoLis: string | null,
): Promise<{ fonte: 'aol' | 'aplis'; cpf: string | null }> {
  // A AOL tem precedência: é ela que traz os valores, e é o vínculo por OS (o
  // idOsLis digitado à mão) que corre risco de casar com o paciente errado.
  if (codigoOs) {
    const exames = await aol.fetchExam(codigoOs)
    return { fonte: 'aol', cpf: exames.find((e) => e.paciente_cpf)?.paciente_cpf ?? null }
  }
  const req = await aplis.requisicaoResultado(codigoLis!)
  return { fonte: 'aplis', cpf: req.paciente?.cpf ?? null }
}

async function main(): Promise<void> {
  const args = lerArgumentos(process.argv.slice(2))

  let consulta = supabase
    .from('exam_results')
    .select('id, paciente_id, cpf, codigo_os, codigo_lis')
    .limit(args.limite)
  if (args.paciente) consulta = consulta.eq('paciente_id', args.paciente)

  const { data: linhas, error } = await consulta
  if (error) throw new Error(`Falha ao ler exam_results: ${error.message}`)
  if (!linhas?.length) {
    console.log('Nenhuma linha para auditar.')
    return
  }

  console.log(`Auditando ${linhas.length} linha(s)…\n`)

  const auditadas: LinhaAuditada[] = []
  let xmlSalvo = false

  for (const linha of linhas) {
    const codigoOs = linha.codigo_os as string | null
    const codigoLis = linha.codigo_lis as string | null
    if (!codigoOs && !codigoLis) continue // linha sem chave: nada a perguntar

    // O CPF de referência sai de `pacientes`, não da coluna `cpf` da linha: é
    // exatamente a coluna sob suspeita que estamos auditando.
    const { data: paciente } = await supabase
      .from('pacientes')
      .select('cpf')
      .eq('id', linha.paciente_id)
      .single()

    const base = {
      id: linha.id as string,
      pacienteId: linha.paciente_id as string,
      codigoOs,
      codigoLis,
    }

    if (!paciente?.cpf) {
      auditadas.push({ ...base, fonte: 'aplis', veredito: 'erro', detalhe: 'paciente sem CPF' })
      continue
    }

    try {
      const { fonte, cpf } = await identidadeNoLis(codigoOs, codigoLis)

      if (args.dumpXml && fonte === 'aol' && !xmlSalvo && codigoOs) {
        const destino = `/tmp/aol-os-${codigoOs}.xml`
        writeFileSync(destino, await aol.fetchXml(codigoOs))
        console.log(`XML cru da OS ${codigoOs} salvo em ${destino}\n`)
        xmlSalvo = true
      }

      auditadas.push({
        ...base,
        fonte,
        veredito: conferirCpf(paciente.cpf as string, cpf),
        detalhe: cpf ? `LIS informou ${cpf.slice(0, 3)}***` : 'LIS não informou CPF',
      })
    } catch (err) {
      auditadas.push({
        ...base,
        fonte: codigoOs ? 'aol' : 'aplis',
        veredito: 'erro',
        detalhe: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Divergências primeiro: é o que exige ação.
  const ordem = { diverge: 0, erro: 1, indisponivel: 2, confere: 3 } as const
  auditadas.sort((a, b) => ordem[a.veredito] - ordem[b.veredito])

  for (const l of auditadas) {
    const marca = { diverge: '✗ DIVERGE', erro: '! ERRO', indisponivel: '? SEM IDENTIDADE', confere: '✓ confere' }[
      l.veredito
    ]
    console.log(
      `${marca.padEnd(18)} ${l.fonte.padEnd(5)} os=${String(l.codigoOs ?? '-').padEnd(12)} lis=${String(l.codigoLis ?? '-').padEnd(15)} ${l.detalhe}`,
    )
    if (l.veredito === 'diverge') console.log(`   linha=${l.id} paciente=${l.pacienteId}`)
  }

  const total = (v: LinhaAuditada['veredito']) => auditadas.filter((l) => l.veredito === v).length
  console.log(
    `\nResumo: ${total('confere')} conferem · ${total('diverge')} DIVERGEM · ` +
      `${total('indisponivel')} sem identidade · ${total('erro')} com erro`,
  )

  if (total('diverge') > 0) {
    console.log(
      '\nAs linhas DIVERGE estão vinculadas ao paciente errado. A barreira já as bloqueia\n' +
        'na tela, mas elas seguem retendo o codigo_lis do dono legítimo — revise à mão.',
    )
    process.exitCode = 1
  }
  if (total('indisponivel') > 0) {
    console.log(
      '\nAs linhas SEM IDENTIDADE não puderam ser verificadas: o LIS não devolveu CPF.\n' +
        'Enquanto forem muitas, a barreira cobre só parte do universo.',
    )
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
