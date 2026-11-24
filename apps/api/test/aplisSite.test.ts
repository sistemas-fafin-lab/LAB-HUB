import { createDecipheriv } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AplisSiteService,
  TravaLoginEmMemoria,
  lerConfigAplisSite,
  type AnexoLaudoExterno,
} from '../src/laudos/aplisSite.js'
import { IntegrationError } from '../src/laudos/errors.js'

// O site interno do apLIS simulado por um `fetch` falso: página de login com
// os campos ocultos, autenticação, listagem e download de imagens. Nada sai
// pela rede e nenhum dado real entra aqui.

const CONFIG = { url: 'http://site.test', usuario: 'usuario.api', senha: 'segredo' }
const CK = '000102030405060708090a0b0c0d0e0f' // chave AES-128 em hex
const CI = 'f0e0d0c0b0a090807060504030201000' // IV em hex
const PDF = new TextEncoder().encode('%PDF-1.4 conteudo de mentira')

const DEZ_MINUTOS = 10 * 60 * 1000

function decifrar(base64: string): string {
  const d = createDecipheriv('aes-128-cbc', Buffer.from(CK, 'hex'), Buffer.from(CI, 'hex'))
  return Buffer.concat([d.update(Buffer.from(base64, 'base64')), d.final()]).toString('utf8')
}

interface Chamada {
  metodo: string
  caminho: string
  query: URLSearchParams
  corpo: URLSearchParams
  cookie: string
}

interface Site {
  /** Resposta do POST de autenticação. */
  login: () => Response
  /** Resposta da listagem; recebe o id pedido. */
  listar: (id: string) => Response
  /** Resposta do download. */
  baixar: () => Response
  /** Página de login. */
  index: () => Response
  /** Sessões que o servidor ainda aceita (PHPSESSID). */
  sessoesValidas: Set<string>
  chamadas: Chamada[]
  de: (caminho: string, f?: string) => Chamada[]
}

const json = (corpo: unknown, status = 200): Response =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

const item = (campos: Record<string, unknown>): Record<string, unknown> => ({
  IdRI: 1,
  NomArquivo: '0040000000001_1',
  Tipo: 14,
  DesTipo: 'Laudo EXTERNO',
  Inativo: 0,
  Retificacao: 0,
  Url: '',
  ...campos,
})

function listagem(lista: Record<string, unknown>[], codRequisicao = '0040000000001'): Response {
  return json({ Lista: lista, Info: { CodRequisicao: codRequisicao, NomPaciente: 'Paciente Exemplo' }, Percentual: '75' })
}

function montarSite(): Site {
  let serial = 0
  const site: Site = {
    sessoesValidas: new Set(),
    chamadas: [],
    index: () => {
      const sid = `sess-${++serial}`
      site.sessoesValidas.add(sid)
      return new Response(
        `<html><input type="hidden" id="ck" value="${CK}"><input type="hidden" id="ci" value="${CI}">` +
          `<input type="hidden" id="auth_token" value="au-${serial}"></html>`,
        { status: 200, headers: { 'Set-Cookie': `PHPSESSID=${sid}; path=/; HttpOnly` } },
      )
    },
    login: () => json({ sucesso: true, url: 'areas/inicio.php', tfa: 0, vc: false }),
    listar: () => listagem([item({ IdRI: 10, NomArquivo: '0040000000001_3' })]),
    baixar: () => new Response(PDF, { status: 200, headers: { 'Content-Type': 'application/pdf' } }),
    de: (caminho, f) =>
      site.chamadas.filter((c) => c.caminho === caminho && (f === undefined || c.query.get('f') === f)),
  }

  vi.stubGlobal('fetch', async (entrada: string | URL, opcoes: RequestInit = {}) => {
    const url = new URL(String(entrada))
    const cookie = String((opcoes.headers as Record<string, string> | undefined)?.Cookie ?? '')
    const chamada: Chamada = {
      metodo: opcoes.method ?? 'GET',
      caminho: url.pathname,
      query: url.searchParams,
      corpo: new URLSearchParams(String(opcoes.body ?? '')),
      cookie,
    }
    site.chamadas.push(chamada)

    if (url.pathname === '/index.php') return site.index()
    if (url.pathname === '/areas/shared/autenticar.php') {
      return url.searchParams.get('f') === 'prosseguir' ? json({ sucesso: true }) : site.login()
    }
    if (url.pathname === '/areas/shared/logoff.php') return new Response('', { status: 302 })
    if (url.pathname === '/areas/shared/imagem.php') {
      const sid = /PHPSESSID=([^;]+)/.exec(cookie)?.[1] ?? ''
      // Sem sessão válida o site responde 302 para a página de login.
      if (!site.sessoesValidas.has(sid) || !url.searchParams.get('au')) {
        return new Response('', { status: 302, headers: { Location: '../../index.php' } })
      }
      if (url.searchParams.get('f') === 'listarImagem') return site.listar(url.searchParams.get('id') ?? '')
      if (url.searchParams.get('f') === 'downloadImagem') return site.baixar()
    }
    return new Response('nao encontrado', { status: 404 })
  })

  return site
}

const ANEXO: AnexoLaudoExterno = { idAnexo: '10', nomeArquivo: '0040000000001_3', retificacao: false }

describe('AplisSiteService', () => {
  let site: Site
  let servico: AplisSiteService

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-11-24T12:00:00Z'), toFake: ['Date'] })
    site = montarSite()
    servico = new AplisSiteService(CONFIG, { trava: new TravaLoginEmMemoria() })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  describe('login e sessão', () => {
    it('faz login com usuário e senha cifrados pela chave da página e lista os anexos', async () => {
      const anexos = await servico.listarLaudosExternos('500', '0040000000001')

      expect(anexos).toEqual([{ idAnexo: '10', nomeArquivo: '0040000000001_3', retificacao: false }])

      const [autenticacao] = site.de('/areas/shared/autenticar.php').filter((c) => !c.query.get('f'))
      expect(decifrar(autenticacao!.corpo.get('l')!)).toBe('usuario.api')
      expect(decifrar(autenticacao!.corpo.get('s')!)).toBe('segredo')
      expect(autenticacao!.corpo.get('t')).toBe('au-1')

      const [chamada] = site.de('/areas/shared/imagem.php', 'listarImagem')
      expect(chamada!.query.get('id')).toBe('500')
      expect(chamada!.query.get('au')).toBe('au-1')
      expect(chamada!.cookie).toContain('PHPSESSID=sess-1')
    })

    it('reaproveita a sessão entre as chamadas: um login só', async () => {
      await servico.listarLaudosExternos('500', '0040000000001')
      await servico.baixarAnexo(ANEXO)
      await servico.listarLaudosExternos('500', '0040000000001')

      expect(site.de('/index.php')).toHaveLength(1)
    })

    it('chamadas simultâneas compartilham o mesmo login', async () => {
      await Promise.all([
        servico.listarLaudosExternos('500', '0040000000001'),
        servico.listarLaudosExternos('500', '0040000000001'),
        servico.baixarAnexo(ANEXO),
      ])

      expect(site.de('/index.php')).toHaveLength(1)
    })

    it('sessão expirada (302): refaz o login uma vez e repete a chamada', async () => {
      await servico.listarLaudosExternos('500', '0040000000001')
      site.sessoesValidas.clear() // o servidor derrubou a sessão ociosa

      const anexos = await servico.listarLaudosExternos('500', '0040000000001')

      expect(anexos).toHaveLength(1)
      expect(site.de('/index.php')).toHaveLength(2)
    })

    it('302 mesmo depois de relogar vira IntegrationError, sem laço de login', async () => {
      site.index = () =>
        new Response(
          `<input id="ck" value="${CK}"><input id="ci" value="${CI}"><input id="auth_token" value="au-x">`,
          { status: 200 }, // sem cookie de sessão: toda chamada seguinte dá 302
        )

      await expect(servico.listarLaudosExternos('500', '0040000000001')).rejects.toBeInstanceOf(IntegrationError)
      expect(site.de('/index.php')).toHaveLength(2)
    })

    it('encerrar faz logoff e a chamada seguinte loga de novo', async () => {
      await servico.listarLaudosExternos('500', '0040000000001')
      await servico.encerrar()
      expect(site.de('/areas/shared/logoff.php')).toHaveLength(1)

      await servico.listarLaudosExternos('500', '0040000000001')
      expect(site.de('/index.php')).toHaveLength(2)
    })
  })

  describe('trava após recusa de login', () => {
    const recusas = () => site.de('/areas/shared/autenticar.php').filter((c) => !c.query.get('f'))

    it('login recusado vira IntegrationError e não é repetido por 10 minutos', async () => {
      site.login = () => json({ sucesso: false, msg: 'Usuário ou senha inválidos' })

      await expect(servico.listarLaudosExternos('500', '0040000000001')).rejects.toBeInstanceOf(IntegrationError)
      expect(recusas()).toHaveLength(1)

      // Dentro da janela: nenhuma chamada ao site, nem a página de login.
      const antes = site.chamadas.length
      vi.advanceTimersByTime(DEZ_MINUTOS - 1000)
      await expect(servico.listarLaudosExternos('500', '0040000000001')).rejects.toThrow(/recusado/i)
      await expect(servico.baixarAnexo(ANEXO)).rejects.toBeInstanceOf(IntegrationError)
      expect(site.chamadas).toHaveLength(antes)
    })

    it('passados os 10 minutos, tenta de novo', async () => {
      site.login = () => json({ sucesso: false, msg: 'Usuário ou senha inválidos' })
      await expect(servico.listarLaudosExternos('500', '0040000000001')).rejects.toThrow()

      vi.advanceTimersByTime(DEZ_MINUTOS + 1000)
      site.login = () => json({ sucesso: true, tfa: 0, vc: false })

      await expect(servico.listarLaudosExternos('500', '0040000000001')).resolves.toHaveLength(1)
      expect(recusas()).toHaveLength(2)
    })

    it('a trava vale para outra instância que use o mesmo registro de recusa', async () => {
      const trava = new TravaLoginEmMemoria()
      site.login = () => json({ sucesso: false, msg: 'x' })
      await expect(
        new AplisSiteService(CONFIG, { trava }).listarLaudosExternos('500', '0040000000001'),
      ).rejects.toThrow()

      const antes = site.chamadas.length
      await expect(
        new AplisSiteService(CONFIG, { trava }).listarLaudosExternos('500', '0040000000001'),
      ).rejects.toThrow(/recusado/i)
      expect(site.chamadas).toHaveLength(antes)
    })

    it.each([
      ['pedido de 2FA', () => json({ sucesso: true, tfa: 1, vc: false })],
      ['captcha ativado', () => json({ sucesso: false, vc: true })],
      ['resposta que não é JSON', () => new Response('<html>erro</html>', { status: 200 })],
      ['HTTP 500 na autenticação', () => new Response('boom', { status: 500 })],
    ])('%s conta como recusa e ativa a trava', async (_nome, resposta) => {
      site.login = resposta
      await expect(servico.listarLaudosExternos('500', '0040000000001')).rejects.toBeInstanceOf(IntegrationError)

      const antes = site.chamadas.length
      await expect(servico.listarLaudosExternos('500', '0040000000001')).rejects.toThrow(/recusado/i)
      expect(site.chamadas).toHaveLength(antes)
    })

    it('página de login sem os campos ocultos: erro, sem tentar autenticar e sem trava', async () => {
      site.index = () => new Response('<html>manutenção</html>', { status: 200 })

      await expect(servico.listarLaudosExternos('500', '0040000000001')).rejects.toBeInstanceOf(IntegrationError)
      expect(recusas()).toHaveLength(0)

      // Nenhuma credencial foi enviada, então não houve recusa: pode tentar de novo.
      await expect(servico.listarLaudosExternos('500', '0040000000001')).rejects.toBeInstanceOf(IntegrationError)
      expect(site.de('/index.php')).toHaveLength(2)
    })

    it('a mensagem de erro não carrega usuário nem senha', async () => {
      site.login = () => json({ sucesso: false, msg: 'Usuário ou senha inválidos' })
      const erro = await servico.listarLaudosExternos('500', '0040000000001').catch((e: unknown) => e)

      const texto = JSON.stringify([(erro as IntegrationError).message, (erro as IntegrationError).context])
      expect(texto).not.toContain('usuario.api')
      expect(texto).not.toContain('segredo')
    })
  })

  describe('listarLaudosExternos', () => {
    it('devolve só os anexos tipo 14 ativos', async () => {
      site.listar = () =>
        listagem([
          item({ IdRI: 1, Tipo: 1, DesTipo: 'Imagem do PEDIDO' }),
          item({ IdRI: 2, Tipo: 14, NomArquivo: 'a_2' }),
          item({ IdRI: 3, Tipo: 14, NomArquivo: 'a_3', Inativo: 1 }),
          item({ IdRI: 4, Tipo: '14', NomArquivo: 'a_4', Retificacao: 1 }),
          item({ IdRI: 5, Tipo: 5, DesTipo: 'Documento' }),
        ])

      expect(await servico.listarLaudosExternos('500', '0040000000001')).toEqual([
        { idAnexo: '2', nomeArquivo: 'a_2', retificacao: false },
        { idAnexo: '4', nomeArquivo: 'a_4', retificacao: true },
      ])
    })

    it('requisição sem anexo tipo 14 devolve lista vazia', async () => {
      site.listar = () => listagem([item({ Tipo: 2 })])
      expect(await servico.listarLaudosExternos('500', '0040000000001')).toEqual([])
    })

    it('recusa a listagem de OUTRA requisição (id que não corresponde ao código)', async () => {
      site.listar = () => listagem([item({})], '0040000009999')
      await expect(servico.listarLaudosExternos('500', '0040000000001')).rejects.toBeInstanceOf(IntegrationError)
    })

    it('o nome do paciente que vem na listagem não aparece em erro', async () => {
      site.listar = () => listagem([item({})], '0040000009999')
      const erro = (await servico.listarLaudosExternos('500', '0040000000001').catch((e: unknown) => e)) as IntegrationError
      expect(JSON.stringify([erro.message, erro.context])).not.toContain('Paciente Exemplo')
    })

    it.each([
      ['HTTP 404', () => new Response('nao existe', { status: 404 })],
      ['HTTP 500', () => new Response('boom', { status: 500 })],
      ['corpo que não é JSON', () => new Response('<html></html>', { status: 200 })],
      ['JSON em outro formato', () => json({ sucesso: false, msg: 'erro' })],
      ['item sem identificador', () => listagem([item({ IdRI: null })])],
    ])('%s vira IntegrationError do serviço aplis-site', async (_nome, resposta) => {
      site.listar = resposta
      const erro = await servico.listarLaudosExternos('500', '0040000000001').catch((e: unknown) => e)
      expect(erro).toBeInstanceOf(IntegrationError)
      expect((erro as IntegrationError).service).toBe('aplis-site')
    })

    it('falha de rede vira IntegrationError', async () => {
      await servico.listarLaudosExternos('500', '0040000000001')
      vi.stubGlobal('fetch', async () => {
        throw new TypeError('fetch failed')
      })
      await expect(servico.listarLaudosExternos('500', '0040000000001')).rejects.toBeInstanceOf(IntegrationError)
    })
  })

  describe('baixarAnexo', () => {
    it('devolve os bytes do PDF em memória', async () => {
      const bytes = await servico.baixarAnexo(ANEXO)

      expect(Buffer.from(bytes).toString()).toBe('%PDF-1.4 conteudo de mentira')
      const [chamada] = site.de('/areas/shared/imagem.php', 'downloadImagem')
      expect(chamada!.metodo).toBe('GET')
      expect(chamada!.query.get('id')).toBe('10')
      expect(chamada!.query.get('nom')).toBe('0040000000001_3')
    })

    it.each([
      ['conteúdo que não é PDF', () => new Response('<html>erro</html>', { status: 200 })],
      ['arquivo vazio', () => new Response(new Uint8Array(), { status: 200 })],
      ['HTTP 404', () => new Response('', { status: 404 })],
      ['HTTP 500', () => new Response('', { status: 500 })],
    ])('%s vira IntegrationError', async (_nome, resposta) => {
      site.baixar = resposta
      await expect(servico.baixarAnexo(ANEXO)).rejects.toBeInstanceOf(IntegrationError)
    })

    it('anexo declarado acima do tamanho máximo é recusado sem ler o corpo', async () => {
      let corpoLido = false
      site.baixar = () => {
        const res = new Response(PDF, { status: 200, headers: { 'Content-Length': String(26 * 1024 * 1024) } })
        Object.defineProperty(res, 'arrayBuffer', {
          value: async () => {
            corpoLido = true
            return PDF.buffer
          },
        })
        return res
      }

      await expect(servico.baixarAnexo(ANEXO)).rejects.toThrow(/tamanho máximo/)
      expect(corpoLido).toBe(false)
    })

    it('timeout vira IntegrationError', async () => {
      await servico.listarLaudosExternos('500', '0040000000001')
      vi.stubGlobal('fetch', async () => {
        throw Object.assign(new Error('expirou'), { name: 'TimeoutError' })
      })
      await expect(servico.baixarAnexo(ANEXO)).rejects.toThrow(/timeout/i)
    })
  })

  it('só usa GET nas leituras e POST apenas na autenticação', async () => {
    await servico.listarLaudosExternos('500', '0040000000001')
    await servico.baixarAnexo(ANEXO)

    const posts = site.chamadas.filter((c) => c.metodo !== 'GET')
    expect(posts.every((c) => c.caminho === '/areas/shared/autenticar.php')).toBe(true)
    const funcoes = site.de('/areas/shared/imagem.php').map((c) => c.query.get('f'))
    expect(new Set(funcoes)).toEqual(new Set(['listarImagem', 'downloadImagem']))
  })
})

describe('lerConfigAplisSite', () => {
  const completo = { APLIS_WEB_URL: 'http://site.test/', APLIS_WEB_USUARIO: 'u', APLIS_WEB_SENHA: 's' }

  it('lê as três variáveis e tira a barra final da URL', () => {
    expect(lerConfigAplisSite(completo)).toEqual({ url: 'http://site.test', usuario: 'u', senha: 's' })
  })

  it.each(['APLIS_WEB_URL', 'APLIS_WEB_USUARIO', 'APLIS_WEB_SENHA'] as const)(
    'sem %s o caminho fica inerte (null)',
    (faltando) => {
      expect(lerConfigAplisSite({ ...completo, [faltando]: ' ' })).toBeNull()
    },
  )

  it('não cai nas credenciais da API de integração', () => {
    expect(lerConfigAplisSite({ APLIS_WEB_URL: 'http://site.test', APLIS_USUARIO: 'u', APLIS_SENHA: 's' })).toBeNull()
  })
})
