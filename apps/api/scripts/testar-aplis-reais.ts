import 'dotenv/config'
import { writeFileSync } from 'node:fs'
import { AplisService } from '../src/laudos/aplis.js'

// ---------------------------------------------------------------------------
// Script de teste com dados REAIS do ApLIS.
//
// Faz requisicaoListar para buscar requisicoes de um periodo,
// depois consulta requisicaoResultado de algumas requisicoes.
//
// Uso:
//   npx tsx scripts/testar-aplis-reais.ts [opcoes]
//
// Exemplo:
//   npx tsx scripts/testar-aplis-reais.ts --periodo-ini 01/06/2026 --periodo-fim 27/07/2026 --limite 5 --salvar
// ---------------------------------------------------------------------------

const aplis = new AplisService()

function hojeBr(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function parseArgs(argv: string[]) {
  const idx = (flag: string) => argv.indexOf(flag)
  const get = (flag: string) => {
    const i = idx(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const limiteBruto = Number(get('--limite'))
  return {
    ini: get('--periodo-ini') ?? hojeBr(),
    fim: get('--periodo-fim') ?? hojeBr(),
    limite: Number.isFinite(limiteBruto) && limiteBruto > 0 ? limiteBruto : 5,
    cpf: get('--cpf'),
    salvar: argv.includes('--salvar'),
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  console.log(`\n🧪 Testando ApLIS REAIS`)
  console.log(`   URL: ${process.env.APLIS_BASE_URL ?? 'https://lab.aplis.inf.br/api/integracao.php'}`)
  console.log(`   Periodo: ${args.ini} → ${args.fim}`)
  console.log(`   Limite de detalhes: ${args.limite}`)
  if (args.cpf) console.log(`   Filtro CPF: ${args.cpf}`)
  console.log()

  const baseUrl = process.env.APLIS_BASE_URL ?? 'https://lab.aplis.inf.br/api/integracao.php'
  const usuario = process.env.APLIS_USUARIO ?? ''
  const senha = process.env.APLIS_SENHA ?? ''

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(usuario
      ? { Authorization: `Basic ${Buffer.from(`${usuario}:${senha}`).toString('base64')}` }
      : {}),
  }

  const periodoIni = `${args.ini} 00:00`
  const periodoFim = `${args.fim} 23:59`

  // -------------------------------------------------------------------------
  // 1. requisicaoListar
  // -------------------------------------------------------------------------
  console.log('→ 1) requisicaoListar (listando requisicoes do periodo)...')

  let lista: Array<Record<string, unknown>> = []
  let totalRegistros = '0'
  let totalPaginas = 1

  if (args.cpf) {
    const reqs = await aplis.requisicaoListar(args.cpf, periodoIni, periodoFim)
    lista = reqs.map((r) => ({
      CodRequisicao: r.cod_requisicao,
      NomPaciente: r.paciente.nome,
      NomExame: r.tipo_exame,
      StatusExame: 1,
    }))
    totalRegistros = String(lista.length)
    totalPaginas = 1
  } else {
    const listarBody = {
      ver: 2,
      cmd: 'requisicaoListar',
      dat: {
        tipoData: 2,
        periodoIni,
        periodoFim,
        pagina: 1,
      },
    }

    const resListar = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(listarBody),
    })

    if (!resListar.ok) {
      console.error(`❌ requisicaoListar falhou: HTTP ${resListar.status}`)
      const txt = await resListar.text().catch(() => '')
      console.error(txt)
      process.exit(1)
    }

    const jsonListar = (await resListar.json()) as {
      dat?: {
        sucesso: number
        qtdPaginas?: number
        registros?: string
        lista?: Array<Record<string, unknown>>
        msgErro?: string
        codErro?: number
      }
    }

    // Partial<>: sem isso o `?? {}` alarga o tipo para `{}` e nenhum campo
    // abaixo existe para o compilador.
    const dat: Partial<NonNullable<typeof jsonListar.dat>> = jsonListar.dat ?? {}
    if (dat.sucesso === 0) {
      console.error(`❌ requisicaoListar erro logico: ${dat.msgErro ?? 'desconhecido'} (codErro=${dat.codErro ?? '?'})`)
      process.exit(1)
    }

    lista = dat.lista ?? []
    totalRegistros = dat.registros ?? String(lista.length)
    totalPaginas = dat.qtdPaginas ?? 1
  }

  console.log(`✅ requisicaoListar OK — ${totalRegistros} registros (${totalPaginas} paginas)`)
  console.log(`   Amostra atual: ${lista.length} requisicoes.\n`)

  if (!lista.length) {
    console.log('Nenhuma requisicao encontrada no periodo.')
    return
  }

  console.log('📋 Resumo das requisicoes:')
  for (const req of lista.slice(0, 20)) {
    const cod = String(req.CodRequisicao ?? req.codRequisicao ?? '-')
    const nome = String(req.NomPaciente ?? req.nomPaciente ?? '-')
    const exame = String(req.NomExame ?? req.nomExame ?? '-')
    const status = String(req.StatusExame ?? req.statusExame ?? '-')
    console.log(`   • ${cod} | ${nome} | ${exame} | status=${status}`)
  }
  if (lista.length > 20) {
    console.log(`   ... e mais ${lista.length - 20} requisicoes.`)
  }
  console.log()

  // -------------------------------------------------------------------------
  // 2. requisicaoResultado
  // -------------------------------------------------------------------------
  const amostra = lista.slice(0, args.limite)
  const resultados: Array<{
    codRequisicao: string
    resultado: Awaited<ReturnType<AplisService['requisicaoResultado']>> | null
    erro?: string
  }> = []

  console.log(`→ 2) requisicaoResultado (detalhando ${amostra.length} requisicoes)...\n`)

  for (const req of amostra) {
    const cod = String(req.CodRequisicao ?? req.codRequisicao ?? '')
    if (!cod) continue

    process.stdout.write(`   Consultando ${cod} ... `)
    try {
      const resultado = await aplis.requisicaoResultado(cod)
      resultados.push({ codRequisicao: cod, resultado })

      const paineis = resultado.paineis?.length ?? 0
      const texto = resultado.laudo_texto ? 'com texto' : 'sem texto'
      console.log(`✅ OK — ${resultado.procedimentos.length} proc(s) · ${paineis} painel(s) · ${texto}`)

      for (const p of resultado.procedimentos.slice(0, 5)) {
        const ref = p.valor_referencia ? ` (ref: ${p.valor_referencia})` : ''
        console.log(`      └─ ${p.nome}: ${p.resultado ?? '-'} ${p.unidade ?? ''}${ref}`)
      }
      if (resultado.procedimentos.length > 5) {
        console.log(`      └─ ... e mais ${resultado.procedimentos.length - 5} procedimentos`)
      }

      for (const painel of (resultado.paineis ?? []).slice(0, 3)) {
        console.log(`      📦 Painel "${painel.nome}":`)
        for (const r of painel.resultados.slice(0, 4)) {
          console.log(`         • ${r.nome}: ${r.conclusao ?? '-'}`)
        }
        if (painel.resultados.length > 4) {
          console.log(`         ... e mais ${painel.resultados.length - 4}`)
        }
      }

      if (resultado.laudo_texto) {
        const preview = resultado.laudo_texto.replace(/\n/g, ' ').slice(0, 120)
        console.log(`      📝 Texto: ${preview}...`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      resultados.push({ codRequisicao: cod, resultado: null, erro: msg })
      console.log(`❌ ERRO — ${msg}`)
    }
  }

  console.log()

  // -------------------------------------------------------------------------
  // 3. requisicaoLaudo (PDF)
  // -------------------------------------------------------------------------
  const primeiraOk = resultados.find((r) => r.resultado)
  if (primeiraOk) {
    console.log(`→ 3) requisicaoLaudo (PDF da primeira requisicao OK: ${primeiraOk.codRequisicao})...`)
    const laudoBody = {
      ver: 2,
      cmd: 'requisicaoLaudo',
      dat: {
        codRequisicao: primeiraOk.codRequisicao,
        formato: 'pdf',
      },
    }
    const resLaudo = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(laudoBody),
    })
    if (resLaudo.ok) {
      const jsonLaudo = (await resLaudo.json()) as { dat?: { sucesso: number; laudoPDF?: string; msgErro?: string } }
      if (jsonLaudo.dat?.sucesso === 1 && jsonLaudo.dat.laudoPDF) {
        console.log(`✅ Laudo PDF recebido — ${jsonLaudo.dat.laudoPDF.length} caracteres base64`)
        if (args.salvar) {
          const nomeArquivo = `/tmp/aplis-laudo-${primeiraOk.codRequisicao}.pdf`
          writeFileSync(nomeArquivo, Buffer.from(jsonLaudo.dat.laudoPDF, 'base64'))
          console.log(`   💾 Salvo em: ${nomeArquivo}`)
        }
      } else {
        console.log(`⚠️  Laudo nao disponivel: ${jsonLaudo.dat?.msgErro ?? 'sem mensagem'}`)
      }
    } else {
      console.log(`❌ requisicaoLaudo falhou: HTTP ${resLaudo.status}`)
    }
    console.log()
  }

  // -------------------------------------------------------------------------
  // 4. Resumo final
  // -------------------------------------------------------------------------
  console.log('📊 RESUMO')
  console.log(`   Requisicoes listadas : ${lista.length} (pagina 1 de ${totalPaginas})`)
  console.log(`   Total no periodo     : ${totalRegistros}`)
  console.log(`   Detalhadas (resultado) : ${resultados.length}`)
  console.log(`   Com sucesso            : ${resultados.filter((r) => r.resultado).length}`)
  console.log(`   Com erro               : ${resultados.filter((r) => r.erro).length}`)

  if (args.salvar) {
    const nomeJson = `/tmp/aplis-teste-${Date.now()}.json`
    writeFileSync(
      nomeJson,
      JSON.stringify(
        {
          periodo: { ini: periodoIni, fim: periodoFim },
          requisicaoListar: { total: totalRegistros, paginas: totalPaginas, lista },
          requisicaoResultado: resultados,
        },
        null,
        2,
      ),
    )
    console.log(`\n💾 JSON completo salvo em: ${nomeJson}`)
  }

  console.log()
}

main().catch((err: unknown) => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
