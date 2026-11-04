import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Documento } from '@lab-hub/shared'
import { DocumentsPage } from './DocumentsPage'
import { api } from '../lib/api'
import { track } from '../lib/analytics'
import { aoAvisar } from '../lib/avisos'
import type { Aviso } from '../lib/avisos'

// A tela renderizada: só o cliente `api` e o analytics são dublês. useDocumentos
// fica real, para a lista reagir a enviar, excluir e às falhas da API.
vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), upload: vi.fn(), del: vi.fn(), documentoUrl: vi.fn() },
}))
vi.mock('../lib/analytics', () => ({ track: vi.fn() }))

const get = vi.mocked(api.get)
const upload = vi.mocked(api.upload)
const del = vi.mocked(api.del)
const documentoUrl = vi.mocked(api.documentoUrl)

const doc = (over: Partial<Documento> = {}): Documento => ({
  id: 'd-1',
  pacienteId: 'p',
  tipo: 'identidade',
  nomeArquivo: 'rg.pdf',
  mimeType: 'application/pdf',
  tamanhoBytes: 2048,
  criadoEm: '2026-10-20T11:00:00Z',
  ...over,
})

const RG = doc()
const PEDIDO = doc({ id: 'd-2', tipo: 'pedido_medico', nomeArquivo: 'pedido.pdf' })

const abas = () => screen.getByRole('group', { name: 'Filtrar por tipo' })
/** O do estado vazio vem depois do que fica no cabeçalho, com o mesmo rótulo. */
const botaoDoVazio = () => screen.getAllByRole('button', { name: 'Enviar documentos' })[1] as HTMLElement

let lista: Documento[]
let avisos: Aviso[]
let pararDeOuvir: () => void

beforeEach(() => {
  lista = []
  avisos = []
  pararDeOuvir = aoAvisar((a) => avisos.push(a))
  vi.mocked(track).mockClear()
  get.mockReset()
  upload.mockReset()
  del.mockReset()
  documentoUrl.mockReset()
  get.mockImplementation(async () => lista as never)
})

afterEach(() => {
  pararDeOuvir()
  vi.unstubAllGlobals()
})

describe('lista e abas', () => {
  it('mostra título, descrição atual e os documentos com nome, formato e tamanho', async () => {
    lista = [RG]
    render(<DocumentsPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Documentos' })).toBeTruthy()
    expect(screen.getByText(/Identidade, carteirinha e pedidos médicos num só lugar/)).toBeTruthy()
    expect(await screen.findByText('rg.pdf')).toBeTruthy()
    expect(screen.getByText(/PDF · 2 KB/)).toBeTruthy()
    expect(get).toHaveBeenCalledWith('/documentos')
  })

  it('separa por tipo, com a contagem de cada aba', async () => {
    lista = [RG, PEDIDO]
    render(<DocumentsPage />)
    await screen.findByText('rg.pdf')
    expect(within(abas()).getByRole('button', { name: 'Todos 2' }).getAttribute('aria-pressed')).toBe('true')
    within(abas()).getByRole('button', { name: 'Carteirinha 0' })
    within(abas()).getByRole('button', { name: 'Outro 0' })

    fireEvent.click(within(abas()).getByRole('button', { name: 'Pedido médico 1' }))
    expect(screen.getByText('pedido.pdf')).toBeTruthy()
    expect(screen.queryByText('rg.pdf')).toBeNull()
  })

  it('aba sem documentos: diz que não há e oferece o envio', async () => {
    lista = [RG]
    render(<DocumentsPage />)
    await screen.findByText('rg.pdf')
    fireEvent.click(within(abas()).getByRole('button', { name: 'Carteirinha 0' }))
    expect(screen.getByText('Nenhum documento aqui')).toBeTruthy()
    fireEvent.click(botaoDoVazio())
    expect(screen.getByRole('dialog', { name: 'Enviar documentos' })).toBeTruthy()
  })

  it('sem nenhum documento: orienta o primeiro envio', async () => {
    render(<DocumentsPage />)
    expect(await screen.findByText('Nenhum documento aqui')).toBeTruthy()
    fireEvent.click(botaoDoVazio())
    expect(screen.getByRole('dialog', { name: 'Enviar documentos' })).toBeTruthy()
    expect(track).toHaveBeenCalledWith('documento_modal_abrir')
  })

  it('carregando: indica o carregamento, sem fingir lista vazia', async () => {
    get.mockImplementation(() => new Promise(() => {}))
    render(<DocumentsPage />)
    expect(screen.getByRole('status', { name: 'Carregando' })).toBeTruthy()
    expect(screen.queryByText('Nenhum documento aqui')).toBeNull()
  })

  it('falha ao carregar: mostra a mensagem da API e tenta de novo', async () => {
    get.mockRejectedValueOnce(new Error('API fora do ar'))
    lista = [RG]
    render(<DocumentsPage />)
    expect(await screen.findByText('API fora do ar')).toBeTruthy()
    expect(screen.queryByText('Nenhum documento aqui')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('rg.pdf')).toBeTruthy()
  })

  it('não promete o que não existe', async () => {
    lista = [RG]
    render(<DocumentsPage />)
    await screen.findByText('rg.pdf')
    expect(screen.queryByText(/Declaraç|Atestado|Receita|Enviar ao médico/i)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Enviar ao médico' })).toBeNull()
  })
})

const arquivo = (nome: string, tipo = 'application/pdf', tamanho?: number) => {
  const f = new File(['x'], nome, { type: tipo })
  if (tamanho !== undefined) Object.defineProperty(f, 'size', { value: tamanho })
  return f
}

const entrada = () => screen.getByLabelText<HTMLInputElement>('Arquivos')
const escolher = (...files: File[]) => fireEvent.change(entrada(), { target: { files } })
const caixaEnviar = () => screen.getByRole('dialog', { name: 'Enviar documentos' })

/** Abre a caixa de envio e adiciona os arquivos à fila, passando pela confirmação. */
const naFila = async (...files: File[]) => {
  render(<DocumentsPage />)
  await waitFor(() => expect(get).toHaveBeenCalled())
  fireEvent.click((await screen.findAllByRole('button', { name: 'Enviar documentos' }))[0] as HTMLElement)
  escolher(...files)
  const rotulo = files.length > 1 ? 'Adicionar arquivos' : 'Adicionar arquivo'
  fireEvent.click(screen.getByRole('button', { name: rotulo }))
}

describe('enviar', () => {
  beforeEach(() => {
    upload.mockImplementation(async (_url, form) => {
      const f = (form as FormData).get('file') as File
      return doc({ id: `novo-${f.name}`, nomeArquivo: f.name, tipo: (form as FormData).get('tipo') as Documento['tipo'] }) as never
    })
  })

  it('aceita os mesmos formatos de hoje', async () => {
    render(<DocumentsPage />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Enviar documentos' }))[0] as HTMLElement)
    expect(entrada().accept).toBe('image/jpeg,image/png,image/webp,application/pdf')
    expect(entrada().multiple).toBe(true)
    expect(screen.getByText('JPG, PNG, WEBP ou PDF · até 10 MB por arquivo')).toBeTruthy()
    expect(track).toHaveBeenCalledWith('documento_modal_abrir')
  })

  it('confirma antes de adicionar: nada entra na fila até o paciente aceitar', async () => {
    render(<DocumentsPage />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Enviar documentos' }))[0] as HTMLElement)
    escolher(arquivo('exame.pdf'))

    const confirmacao = screen.getByRole('dialog', { name: 'Adicionar este arquivo?' })
    expect(within(confirmacao).getByText('exame.pdf')).toBeTruthy()
    expect(within(caixaEnviar()).queryByText('exame.pdf')).toBeNull()

    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog', { name: 'Adicionar este arquivo?' })).toBeNull()
    expect(within(caixaEnviar()).queryByText('exame.pdf')).toBeNull()

    escolher(arquivo('exame.pdf'))
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar arquivo' }))
    expect(within(caixaEnviar()).getByText('exame.pdf')).toBeTruthy()
    expect(upload).not.toHaveBeenCalled()
  })

  it('vários arquivos: confirma todos e envia em série com o tipo de cada linha', async () => {
    await naFila(arquivo('a.pdf'), arquivo('b.pdf'))
    expect(screen.queryByRole('dialog', { name: 'Adicionar 2 arquivos?' })).toBeNull()
    fireEvent.change(screen.getByRole('combobox', { name: 'Tipo de b.pdf' }), { target: { value: 'carteirinha' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar (2)' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Enviar documentos' })).toBeNull())
    const enviados = upload.mock.calls.map(([, form]) => [(form as FormData).get('tipo'), ((form as FormData).get('file') as File).name])
    expect(enviados).toEqual([
      ['identidade', 'a.pdf'],
      ['carteirinha', 'b.pdf'],
    ])
    expect(upload.mock.calls[0]?.[0]).toBe('/documentos')
    expect(track).toHaveBeenCalledWith('documento_upload_lote', { total: 2, sucessos: 2, falhas: 0 })
    expect(avisos).toEqual([{ title: '2 documentos enviados' }])
    expect(await screen.findByText('a.pdf')).toBeTruthy()
  })

  it('um arquivo: avisa com o nome dele', async () => {
    await naFila(arquivo('a.pdf'))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar (1)' }))
    await waitFor(() => expect(avisos).toEqual([{ title: 'Documento enviado', message: 'a.pdf' }]))
  })

  it.each([
    ['grande demais', arquivo('g.pdf', 'application/pdf', 10 * 1024 * 1024 + 1), 'Arquivo muito grande (10.1 MB). O limite é 10 MB.'],
    ['de formato não aceito', arquivo('v.mp4', 'video/mp4'), 'Formato não aceito. Envie JPG, PNG, WEBP ou PDF.'],
  ])('arquivo %s: fica na linha com a mesma mensagem e não sobe', async (_nome, file, mensagem) => {
    await naFila(file)
    const caixa = caixaEnviar()
    expect(within(caixa).getByText(mensagem)).toBeTruthy()
    expect(within(caixa).queryByRole('combobox')).toBeNull()
    expect((within(caixa).getByRole('button', { name: 'Enviar' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(within(caixa).getByRole('button', { name: `Remover ${file.name}` }))
    expect(within(caixa).queryByText(mensagem)).toBeNull()
  })

  it('recusa um arquivo mas envia outro: fica aberta mostrando o que sobrou', async () => {
    await naFila(arquivo('ok.pdf'), arquivo('v.mp4', 'video/mp4'))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar (1)' }))
    expect(await screen.findByText('Enviado como Identidade')).toBeTruthy()
    expect(caixaEnviar()).toBeTruthy()
    expect(screen.getByText('1 enviado')).toBeTruthy()
    expect(avisos).toEqual([])
  })

  it('falha da API: a mensagem fica na linha e o próximo clique retenta só ela', async () => {
    upload.mockRejectedValueOnce(new Error('Limite de envios atingido'))
    await naFila(arquivo('a.pdf'))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar (1)' }))

    expect(await within(caixaEnviar()).findByText('Limite de envios atingido')).toBeTruthy()
    expect(screen.getAllByText('Limite de envios atingido')).toHaveLength(1)
    expect(screen.queryByText('Não foi possível carregar seus documentos')).toBeNull()
    expect(track).toHaveBeenCalledWith('documento_upload_lote', { total: 1, sucessos: 0, falhas: 1 })

    fireEvent.click(screen.getByRole('button', { name: 'Enviar (1)' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Enviar documentos' })).toBeNull())
    expect(upload).toHaveBeenCalledTimes(2)
  })

  it('fechar depois de uma falha de envio não deixa erro na tela', async () => {
    upload.mockRejectedValueOnce(new Error('Limite de envios atingido'))
    await naFila(arquivo('a.pdf'))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar (1)' }))
    await within(caixaEnviar()).findByText('Limite de envios atingido')
    fireEvent.click(within(caixaEnviar()).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByText('Limite de envios atingido')).toBeNull()
    expect(screen.getByText('Nenhum documento aqui')).toBeTruthy()
  })

  it('durante o envio nada fecha a caixa', async () => {
    upload.mockImplementation(() => new Promise(() => {}))
    await naFila(arquivo('a.pdf'))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar (1)' }))
    await screen.findByRole('status', { name: 'Enviando a.pdf' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(caixaEnviar()).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Fechar' })).toBeNull()
    expect((screen.getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Esc fecha só a confirmação; o segundo Esc fecha a caixa de envio', async () => {
    render(<DocumentsPage />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Enviar documentos' }))[0] as HTMLElement)
    escolher(arquivo('a.pdf'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Adicionar este arquivo?' })).toBeNull()
    expect(caixaEnviar()).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Enviar documentos' })).toBeNull()
  })

  it('o fundo não rola enquanto houver caixa aberta, nem ao fechar só a de cima', async () => {
    render(<DocumentsPage />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Enviar documentos' }))[0] as HTMLElement)
    expect(document.body.style.overflow).toBe('hidden')
    escolher(arquivo('a.pdf'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.body.style.overflow).toBe('')
  })

  it('Tab fica na confirmação enquanto ela está por cima', async () => {
    render(<DocumentsPage />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Enviar documentos' }))[0] as HTMLElement)
    escolher(arquivo('a.pdf'))
    const confirmacao = screen.getByRole('dialog', { name: 'Adicionar este arquivo?' })
    const cancelar = within(confirmacao).getByRole('button', { name: 'Cancelar' })
    cancelar.focus()
    fireEvent.keyDown(cancelar, { key: 'Tab' })
    expect(document.activeElement).toBe(cancelar)
    const adicionar = within(confirmacao).getByRole('button', { name: 'Adicionar arquivo' })
    adicionar.focus()
    fireEvent.keyDown(adicionar, { key: 'Tab' })
    expect(confirmacao.contains(document.activeElement)).toBe(true)
  })

  it('lista que não carregou continua sem fingir vazio depois de abrir e fechar a caixa', async () => {
    get.mockRejectedValueOnce(new Error('API fora do ar'))
    lista = [RG]
    render(<DocumentsPage />)
    await screen.findByText('API fora do ar')
    fireEvent.click(screen.getByRole('button', { name: 'Enviar documentos' }))
    fireEvent.click(within(caixaEnviar()).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByText('Nenhum documento aqui')).toBeNull()
    expect(await screen.findByText('rg.pdf')).toBeTruthy()
  })
})

describe('visualizar e baixar', () => {
  it('pede a URL assinada sob demanda e abre em nova aba', async () => {
    const abrir = vi.fn()
    vi.stubGlobal('open', abrir)
    documentoUrl.mockResolvedValue({ url: 'https://assinada/rg' } as never)
    lista = [RG]
    render(<DocumentsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Visualizar' }))
    await waitFor(() => expect(abrir).toHaveBeenCalledWith('https://assinada/rg', '_blank', 'noopener'))
    expect(documentoUrl).toHaveBeenLastCalledWith('d-1', false)

    fireEvent.click(screen.getByRole('button', { name: 'Baixar' }))
    await waitFor(() => expect(documentoUrl).toHaveBeenLastCalledWith('d-1', true))
    await waitFor(() => expect(abrir).toHaveBeenCalledTimes(2))
  })

  it('não abre duas vezes com clique duplo', async () => {
    vi.stubGlobal('open', vi.fn())
    documentoUrl.mockResolvedValue({ url: 'u' } as never)
    lista = [RG]
    render(<DocumentsPage />)
    const ver = await screen.findByRole('button', { name: 'Visualizar' })
    fireEvent.click(ver)
    fireEvent.click(ver)
    await waitFor(() => expect(window.open).toHaveBeenCalledTimes(1))
    expect(documentoUrl).toHaveBeenCalledTimes(1)
  })

  it('falha ao abrir: mostra a mensagem da API no próprio cartão', async () => {
    documentoUrl.mockRejectedValue(new Error('Documento não encontrado'))
    lista = [RG]
    render(<DocumentsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Baixar' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Documento não encontrado')
  })

  describe('miniatura', () => {
    let aparecer: () => void
    beforeEach(() => {
      vi.stubGlobal(
        'IntersectionObserver',
        class {
          constructor(cb: IntersectionObserverCallback) {
            aparecer = () => cb([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
          }
          observe() {}
          disconnect() {}
        },
      )
    })
    const FOTO = doc({ id: 'd-3', nomeArquivo: 'foto.png', mimeType: 'image/png' })

    it('só busca a imagem quando o cartão entra na tela', async () => {
      documentoUrl.mockResolvedValue({ url: 'https://assinada/foto' } as never)
      lista = [FOTO]
      render(<DocumentsPage />)
      await screen.findByText('foto.png')
      expect(documentoUrl).not.toHaveBeenCalled()
      act(() => aparecer())
      expect((await screen.findByRole('img', { name: 'foto.png' })).getAttribute('src')).toBe('https://assinada/foto')
      expect(documentoUrl).toHaveBeenCalledWith('d-3')
    })

    it('imagem que não abre volta para o ícone', async () => {
      documentoUrl.mockResolvedValue({ url: 'https://assinada/foto' } as never)
      lista = [FOTO]
      render(<DocumentsPage />)
      await screen.findByText('foto.png')
      act(() => aparecer())
      fireEvent.error(await screen.findByRole('img', { name: 'foto.png' }))
      expect(screen.queryByRole('img', { name: 'foto.png' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Visualizar foto.png' })).toBeTruthy()
    })
  })
})

describe('excluir', () => {
  const pedirExclusao = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    return screen.getByRole('dialog', { name: 'Excluir documento?' })
  }

  it('confirma antes: "Manter" não chama a API', async () => {
    lista = [RG]
    render(<DocumentsPage />)
    const caixa = await pedirExclusao()
    expect(within(caixa).getByText(/rg\.pdf/)).toBeTruthy()
    fireEvent.click(within(caixa).getByRole('button', { name: 'Manter' }))
    expect(del).not.toHaveBeenCalled()
    expect(screen.getByText('rg.pdf')).toBeTruthy()
  })

  it('confirmado: remove da lista e chama a API', async () => {
    del.mockResolvedValue(undefined as never)
    lista = [RG]
    render(<DocumentsPage />)
    fireEvent.click(within(await pedirExclusao()).getByRole('button', { name: 'Excluir' }))
    expect(del).toHaveBeenCalledWith('/documentos/d-1')
    await waitFor(() => expect(screen.queryByText('rg.pdf')).toBeNull())
    expect(screen.getByText('Nenhum documento aqui')).toBeTruthy()
  })

  it('falha da API: o documento volta e a mensagem da API aparece em aviso', async () => {
    del.mockRejectedValue(new Error('Falha ao remover o arquivo'))
    lista = [RG]
    render(<DocumentsPage />)
    fireEvent.click(within(await pedirExclusao()).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(avisos).toContainEqual({ tone: 'alert', title: 'Não foi possível concluir', message: 'Falha ao remover o arquivo' }))
    expect(await screen.findByText('rg.pdf')).toBeTruthy()
  })
})
