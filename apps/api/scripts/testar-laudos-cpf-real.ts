import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { AplisService } from '../src/laudos/aplis.js'

// ---------------------------------------------------------------------------
// Script para testar o fluxo completo de laudos com CPF REAL do ApLIS.
//
// O que faz:
//   1. Busca requisicoes reais no ApLIS para encontrar CPFs de pacientes com laudos
//   2. Mostra os CPFs encontrados com nome e exame
//   3. Permite escolher um CPF (ou passar via --cpf)
//   4. Cria um usuario temporario no Supabase Auth
//   5. Cria um paciente na tabela `pacientes` vinculado a esse usuario com o CPF real
//   6. Faz login e obtem token JWT
//   7. Chama GET /laudos na API local
//   8. Mostra se os laudos apareceram!
//
// Uso:
//   npx tsx scripts/testar-laudos-cpf-real.ts [opcoes]
//
// Opções:
//   --user-id UUID     Usar um auth_user_id EXISTENTE no Supabase Auth
//   --paciente-id UUID Usar um id da tabela pacientes (resolve auth_user_id)
//   --cpf XXX          Usar CPF específico (em vez de listar do ApLIS)
//   --email EMAIL      Email para o usuario temporario (padrão: teste+XXX@labhub.test)
//   --senha SENHA      Senha para login (obrigatória se --user-id; padrão: Teste123!)
//   --api URL          URL da API local (padrão: http://localhost:3333)
//   --periodo-ini      Data inicial para busca no ApLIS (padrão: ontem)
//   --periodo-fim      Data final para busca no ApLIS (padrão: hoje)
//   --limite N         Quantas requisicoes buscar no ApLIS (padrão: 50)
//   --nao-limpar       Nao excluir o usuario/paciente temporario ao final
//   --sem-api          So prepara usuario/paciente, nao chama API
// ---------------------------------------------------------------------------

const aplis = new AplisService()

function hojeBr(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function ontemBr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
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
    cpf: get('--cpf'),
    email: get('--email'),
    senha: get('--senha') ?? 'Teste123!',
    apiUrl: get('--api') ?? 'http://localhost:3333/api/v1',
    ini: get('--periodo-ini') ?? ontemBr(),
    fim: get('--periodo-fim') ?? hojeBr(),
    limite: Number.isFinite(limiteBruto) && limiteBruto > 0 ? limiteBruto : 50,
    naoLimpar: argv.includes('--nao-limpar'),
    semApi: argv.includes('--sem-api'),
    userId: get('--user-id'),
    pacienteId: get('--paciente-id'),
  }
}

// Cliente Supabase com service role
const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  console.log(`\n🧪 Teste de laudos com CPF REAL do ApLIS`)
  console.log(`   API local: ${args.apiUrl}`)
  console.log(`   ApLIS: ${process.env.APLIS_BASE_URL ?? 'default'}`)
  console.log()

  // -------------------------------------------------------------------------
  // 1. Buscar CPFs reais no ApLIS
  // -------------------------------------------------------------------------
  let cpfEscolhido = args.cpf
  let nomePaciente = ''

  if (!cpfEscolhido) {
    console.log(`→ 1) Buscando requisicoes no ApLIS (${args.ini} → ${args.fim})...`)

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

    const listarBody = {
      ver: 2,
      cmd: 'requisicaoListar',
      dat: {
        tipoData: 2,
        periodoIni: `${args.ini} 00:00`,
        periodoFim: `${args.fim} 23:59`,
        pagina: 1,
      },
    }

    const res = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(listarBody),
    })

    if (!res.ok) {
      console.error(`❌ requisicaoListar falhou: HTTP ${res.status}`)
      process.exit(1)
    }

    const json = (await res.json()) as {
      dat?: { sucesso: number; lista?: Array<Record<string, unknown>>; msgErro?: string; codErro?: number }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dat: any = json.dat ?? {}
    if (dat.sucesso === 0) {
      console.error(`❌ Erro: ${dat.msgErro ?? 'desconhecido'}`)
      process.exit(1)
    }

    const lista: Array<Record<string, unknown>> = dat.lista ?? []
    console.log(`✅ ${lista.length} requisicoes encontradas.\n`)

    // Extrai CPFs unicos
    const cpfsMap = new Map<string, { nome: string; exames: string[] }>()
    for (const req of lista.slice(0, args.limite)) {
      const cpf = String(req.CPF ?? req.cpf ?? '').replace(/\D/g, '')
      const nome = String(req.NomPaciente ?? req.nomPaciente ?? '')
      const exame = String(req.NomExame ?? req.nomExame ?? '')
      if (cpf.length !== 11) continue
      const atual = cpfsMap.get(cpf)
      if (atual) {
        if (!atual.exames.includes(exame)) atual.exames.push(exame)
      } else {
        cpfsMap.set(cpf, { nome, exames: [exame] })
      }
    }

    const cpfs = Array.from(cpfsMap.entries())
    if (cpfs.length === 0) {
      console.log('Nenhum CPF valido encontrado nas requisicoes.')
      process.exit(1)
    }

    console.log('📋 CPFs encontrados (com laudos no ApLIS):')
    for (let i = 0; i < cpfs.length; i++) {
      const [cpf, info] = cpfs[i]
      const exames = info.exames.slice(0, 3).join(', ')
      console.log(`   ${i + 1}. ${cpf} — ${info.nome} (${exames})`)
    }

    // Se so houver um, usa ele
    if (cpfs.length === 1) {
      cpfEscolhido = cpfs[0][0]
      nomePaciente = cpfs[0][1].nome
      console.log(`\n✅ CPF unico selecionado automaticamente: ${cpfEscolhido}`)
    } else {
      console.log(`\n💡 Use --cpf ${cpfs[0][0]} para escolher um diretamente.`)
      cpfEscolhido = cpfs[0][0]
      nomePaciente = cpfs[0][1].nome
      console.log(`   (Usando o primeiro por padrao: ${cpfEscolhido})`)
    }
  }

  console.log(`\n   CPF escolhido: ${cpfEscolhido}`)
  if (nomePaciente) console.log(`   Nome: ${nomePaciente}`)

  // -------------------------------------------------------------------------
  // 2. Resolver o usuario (existente ou temporario)
  // -------------------------------------------------------------------------
  let userId: string
  let email: string
  let senha: string

  if (args.pacienteId) {
    // Modo paciente existente (resolve auth_user_id pelo id da tabela pacientes)
    console.log(`\n→ 2) Usando paciente existente: ${args.pacienteId}`)

    const { data: pacienteData, error: pacienteErr } = await supabaseAdmin
      .from('pacientes')
      .select('id, auth_user_id, nome, cpf, email')
      .eq('id', args.pacienteId)
      .single()

    if (pacienteErr || !pacienteData) {
      console.error(`❌ Paciente nao encontrado: ${pacienteErr?.message ?? 'unknown'}`)
      process.exit(1)
    }

    if (!pacienteData.auth_user_id) {
      console.error(`❌ Paciente nao tem auth_user_id (ainda nao vinculou login).`)
      process.exit(1)
    }

    userId = pacienteData.auth_user_id as string
    email = (pacienteData.email as string) ?? ''
    senha = args.senha

    console.log(`   Paciente: ${pacienteData.nome}`)
    console.log(`   auth_user_id: ${userId}`)
    console.log(`   Email cadastrado: ${email || '(nao informado)'}`)
    console.log(`   (Voce deve passar a senha real com --senha)`)
  } else if (args.userId) {
    // Modo usuario existente
    userId = args.userId
    console.log(`\n→ 2) Usando usuario existente: ${userId}`)

    const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId)
    if (userErr || !userData.user) {
      console.error(`❌ Usuario nao encontrado: ${userErr?.message ?? 'unknown'}`)
      process.exit(1)
    }
    email = (userData.user as any).email as string
    senha = args.senha
    console.log(`   Email: ${email}`)
    console.log(`   (Senha: a que voce passou com --senha, ou 'Teste123!' se omitiu)`)
  } else {
    // Modo usuario temporario
    email = args.email ?? `teste+${cpfEscolhido}@labhub.test`
    senha = args.senha
    console.log(`\n→ 2) Criando usuario temporario: ${email}`)

    const { data: listaUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existente = (listaUsers?.users as any[] | undefined)?.find((u: any) => u.email === email)

    if (existente) {
      console.log(`   Usuario ja existe. Reutilizando...`)
      userId = existente.id
      await supabaseAdmin.auth.admin.updateUserById(userId, { password: senha })
    } else {
      const { data: novo, error: errCriar } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
      })
      if (errCriar || !novo.user) {
        console.error(`❌ Falha ao criar usuario: ${errCriar?.message ?? 'unknown'}`)
        process.exit(1)
      }
      userId = novo.user.id
      console.log(`✅ Usuario criado: ${userId}`)
    }
  }

  // -------------------------------------------------------------------------
  // 3. Criar/atualizar paciente na tabela `pacientes`
  // -------------------------------------------------------------------------
  console.log(`\n→ 3) Vinculando paciente ao usuario com CPF ${cpfEscolhido}...`)

  const { data: pacienteExistente } = await supabaseAdmin
    .from('pacientes')
    .select('id')
    .eq('auth_user_id', userId)
    .maybeSingle()

  let pacienteId: string
  if (pacienteExistente?.id) {
    pacienteId = pacienteExistente.id as string
    const { error: errUp } = await supabaseAdmin
      .from('pacientes')
      .update({ cpf: cpfEscolhido, nome: nomePaciente || 'Paciente Teste' })
      .eq('id', pacienteId)
    if (errUp) {
      console.error(`❌ Falha ao atualizar paciente: ${errUp.message}`)
      process.exit(1)
    }
    console.log(`✅ Paciente atualizado: ${pacienteId}`)
  } else {
    const { data: porCpf } = await supabaseAdmin
      .from('pacientes')
      .select('id')
      .eq('cpf', cpfEscolhido)
      .is('auth_user_id', null)
      .maybeSingle()

    if (porCpf?.id) {
      // Reivindica paciente fantasma existente
      pacienteId = porCpf.id as string
      const { error: errUp } = await supabaseAdmin
        .from('pacientes')
        .update({ auth_user_id: userId })
        .eq('id', pacienteId)
      if (errUp) {
        console.error(`❌ Falha ao reivindicar paciente: ${errUp.message}`)
        process.exit(1)
      }
      console.log(`✅ Paciente fantasma reivindicado: ${pacienteId}`)
    } else {
      const { data: novoPac, error: errPac } = await supabaseAdmin
        .from('pacientes')
        .insert({
          auth_user_id: userId,
          cpf: cpfEscolhido,
          nome: nomePaciente || 'Paciente Teste',
          data_nascimento: '1990-01-01',
          sexo: 'F',
        })
        .select('id')
        .single()
      if (errPac || !novoPac) {
        console.error(`❌ Falha ao criar paciente: ${errPac?.message ?? 'unknown'}`)
        process.exit(1)
      }
      pacienteId = novoPac.id as string
      console.log(`✅ Paciente criado: ${pacienteId}`)
    }
  }

  // -------------------------------------------------------------------------
  // 4. Login para obter token JWT
  // -------------------------------------------------------------------------
  console.log(`\n→ 4) Fazendo login...`)

  // Se nao temos email (paciente sem email cadastrado), busca do Auth
  if (!email) {
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId)
    email = (userData.user as any)?.email as string
    if (!email) {
      console.error(`❌ Nao foi possivel obter o email do usuario para login.`)
      process.exit(1)
    }
    console.log(`   Email obtido do Auth: ${email}`)
  }

  const authKey = process.env.SUPABASE_ANON_KEY ?? supabaseServiceKey
  const supabaseClient = createClient(supabaseUrl, authKey)
  const { data: loginData, error: loginError } = await supabaseClient.auth.signInWithPassword({
    email,
    password: senha,
  })
  if (loginError || !loginData.session) {
    console.error(`❌ Login falhou: ${loginError?.message ?? 'unknown'}`)
    process.exit(1)
  }
  const token = loginData.session.access_token
  console.log(`✅ Login OK — token obtido`); fs.writeFileSync("/tmp/last_token.txt", token)

  // -------------------------------------------------------------------------
  // 5. Chamar GET /laudos na API local
  // -------------------------------------------------------------------------
  if (args.semApi) {
    console.log(`\n→ 5) --sem-api: pulando chamada à API local.`)
    console.log(`   Token valido. Voce pode testar manualmente:`)
    console.log(`   curl -H "Authorization: Bearer ${token}" ${args.apiUrl}/laudos?refresh=true`)
  } else {
    console.log(`\n→ 5) Chamando GET ${args.apiUrl}/laudos?refresh=true ...`)
    console.log(`   (Isso pode demorar alguns segundos — varre o ApLIS ao vivo)\n`)

    const start = Date.now()
    const resLaudos = await fetch(`${args.apiUrl}/laudos?refresh=true`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const elapsed = Date.now() - start

    console.log(`   Status: ${resLaudos.status} — ${elapsed}ms`)

    if (!resLaudos.ok) {
      const txt = await resLaudos.text().catch(() => '')
      console.error(`❌ Resposta de erro: ${txt.slice(0, 500)}`)
    } else {
      const body = (await resLaudos.json()) as {
        source?: string
        exams?: Array<Record<string, unknown>>
        total?: number
      }
      const exams = body.exams ?? []
      console.log(`✅ Laudos retornados: ${exams.length}`)
      console.log(`   Source: ${body.source ?? '?'}`)

      for (const exam of exams.slice(0, 10)) {
        const nome = String(exam.name ?? exam.nomExame ?? '-')
        const source = String(exam.source ?? '?')
        const panels = Array.isArray(exam.panels) ? exam.panels.length : 0
        console.log(`   • ${nome} (source=${source}, panels=${panels})`)
      }
      if (exams.length > 10) {
        console.log(`   ... e mais ${exams.length - 10} exames.`)
      }
    }
  }

  // -------------------------------------------------------------------------
  // 6. Limpeza (opcional)
  // -------------------------------------------------------------------------
  if (!args.naoLimpar) {
    console.log(`\n→ 6) Limpando dados temporarios...`)
    await supabaseAdmin.from('exam_results').delete().eq('paciente_id', pacienteId)
    if (args.userId) {
      // Usuario real: so limpa o CPF do paciente (restaura para nao corromper conta)
      await supabaseAdmin.from('pacientes').update({ cpf: null }).eq('id', pacienteId)
      console.log(`✅ CPF limpo do paciente ${pacienteId} (usuario real preservado).`)
    } else {
      // Usuario temporario: apaga tudo
      await supabaseAdmin.from('pacientes').delete().eq('id', pacienteId)
      await supabaseAdmin.auth.admin.deleteUser(userId)
      console.log(`✅ Usuario, paciente e exam_results temporarios removidos.`)
    }
  } else {
    console.log(`\n→ 6) --nao-limpar ativo — dados mantidos:`)
    console.log(`   Usuario: ${email} / senha: ${args.senha}`)
    console.log(`   Paciente ID: ${pacienteId}`)
    console.log(`   Token: ${token.slice(0, 40)}...`)
  }

  console.log(`\n🏁 FIM`)
}

main().catch((err: unknown) => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
