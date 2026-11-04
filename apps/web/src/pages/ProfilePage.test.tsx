import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Paciente } from '@lab-hub/shared'
import { ProfilePage } from './ProfilePage'
import { api } from '../lib/api'
import { track } from '../lib/analytics'
import { aoAvisar } from '../lib/avisos'
import type { Aviso } from '../lib/avisos'

// A tela renderizada: só o cliente `api` e o analytics são dublês. Validadores e
// máscaras ficam reais.
vi.mock('../lib/api', () => ({ api: { put: vi.fn() } }))
vi.mock('../lib/analytics', () => ({ track: vi.fn() }))

const put = vi.mocked(api.put)

const PACIENTE: Paciente = {
  id: 'p-1',
  authUserId: 'u-1',
  nome: 'Maria Souza',
  email: 'maria@exemplo.com',
  cpf: '52998224725',
  sexo: 'F',
  dataNascimento: '1990-03-15',
  telefone: '61981234567',
  convenio: { operadora: 'Unimed', plano: 'Premium' },
}

let avisos: Aviso[]
let pararDeOuvir: () => void

beforeEach(() => {
  avisos = []
  pararDeOuvir = aoAvisar((a) => avisos.push(a))
  put.mockReset()
  vi.mocked(track).mockClear()
})

afterEach(() => pararDeOuvir())

interface Props {
  paciente?: Paciente | null
  carregando?: boolean
  erro?: string | null
  onRecarregar?: () => void
  onLogout?: () => void
  onSaved?: (p: Paciente) => void
}

function renderiza(p: Props = {}) {
  const props = {
    paciente: p.paciente === undefined ? PACIENTE : p.paciente,
    carregando: p.carregando ?? false,
    erro: p.erro ?? null,
    onRecarregar: p.onRecarregar ?? vi.fn(),
    onLogout: p.onLogout ?? vi.fn(),
    onSaved: p.onSaved ?? vi.fn(),
  }
  render(<ProfilePage {...props} />)
  return props
}

/** Valor exibido abaixo de um rótulo, no modo leitura. */
const valorDe = (rotulo: string) => screen.getByText(rotulo).nextElementSibling?.textContent

describe('leitura', () => {
  it('mostra nome, iniciais e os dados pessoais formatados', () => {
    renderiza()
    expect(screen.getByRole('heading', { level: 1, name: 'Maria Souza' })).toBeTruthy()
    expect(screen.getByText('MS')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Dados pessoais' })).toBeTruthy()
    expect(valorDe('Nome completo')).toBe('Maria Souza')
    expect(valorDe('CPF')).toBe('529.982.247-25')
    expect(valorDe('Data de nascimento')).toBe('15/03/1990')
    expect(valorDe('E-mail')).toBe('maria@exemplo.com')
    expect(valorDe('Telefone')).toBe('(61) 9 8123-4567')
    expect(valorDe('Convênio')).toBe('Unimed · Premium')
  })
})

const campo = (rotulo: string) => screen.getByLabelText(rotulo) as HTMLInputElement
const digita = (rotulo: string, valor: string) => fireEvent.change(campo(rotulo), { target: { value: valor } })
const editar = () => fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
const salvar = () => fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

describe('edição', () => {
  it('abre com os dados atuais; CPF, nascimento e e-mail ficam bloqueados', () => {
    renderiza()
    editar()
    expect(campo('Nome completo').value).toBe('Maria Souza')
    expect(campo('Telefone').value).toBe('(61) 9 8123-4567')
    expect(campo('Convênio').value).toBe('Unimed')
    expect(campo('Plano').value).toBe('Premium')
    expect(campo('CPF').disabled).toBe(true)
    expect(campo('CPF').value).toBe('529.982.247-25')
    expect(campo('Data de nascimento').disabled).toBe(true)
    expect(campo('E-mail').disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
  })

  it('salva pelo PUT /pacientes/me com o mesmo payload de hoje', async () => {
    const salvo = { ...PACIENTE, nome: 'Maria S. Lima', telefone: '6132345678', convenio: { operadora: 'Amil' } }
    put.mockResolvedValue(salvo)
    const props = renderiza()
    editar()
    digita('Nome completo', '  Maria S. Lima ')
    digita('Telefone', '6132345678')
    expect(campo('Telefone').value).toBe('(61) 3234-5678')
    digita('Convênio', ' Amil ')
    digita('Plano', '  ')
    salvar()

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(salvo))
    expect(put).toHaveBeenCalledWith('/pacientes/me', {
      nome: 'Maria S. Lima',
      telefone: '6132345678',
      convenio: { operadora: 'Amil' },
    })
    expect(track).toHaveBeenCalledWith('perfil_salvo')
    expect(avisos).toContainEqual(expect.objectContaining({ title: 'Dados atualizados' }))
    expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy()
  })

  it('sem operadora, envia convênio nulo (limpa o convênio)', async () => {
    put.mockResolvedValue(PACIENTE)
    renderiza()
    editar()
    digita('Convênio', '')
    salvar()
    await waitFor(() => expect(put).toHaveBeenCalled())
    expect(put.mock.calls[0]?.[1]).toMatchObject({ convenio: null })
  })

  it('Cancelar descarta o que foi digitado', () => {
    renderiza()
    editar()
    digita('Nome completo', 'Outro nome')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(put).not.toHaveBeenCalled()
    expect(valorDe('Nome completo')).toBe('Maria Souza')
    editar()
    expect(campo('Nome completo').value).toBe('Maria Souza')
  })
})

describe('validações e erros', () => {
  it('nome vazio e telefone incompleto não chegam à API; a mensagem fica junto do campo', () => {
    renderiza()
    editar()
    digita('Nome completo', '   ')
    digita('Telefone', '6198')
    salvar()
    expect(put).not.toHaveBeenCalled()
    expect(campo('Nome completo').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Informe seu nome')).toBeTruthy()
    expect(screen.getByText('Telefone inválido')).toBeTruthy()

    digita('Nome completo', 'Maria')
    expect(screen.queryByText('Informe seu nome')).toBeNull()
  })

  it('telefone vazio é aceito (é opcional)', async () => {
    put.mockResolvedValue(PACIENTE)
    renderiza()
    editar()
    digita('Telefone', '')
    salvar()
    await waitFor(() => expect(put).toHaveBeenCalled())
    expect(put.mock.calls[0]?.[1]).toMatchObject({ telefone: '' })
  })

  it('erro da API aparece com a mensagem dela e mantém a edição aberta', async () => {
    put.mockRejectedValue(new Error('Telefone já usado por outra conta'))
    const props = renderiza()
    editar()
    salvar()
    expect((await screen.findByRole('alert')).textContent).toBe('Telefone já usado por outra conta')
    expect(props.onSaved).not.toHaveBeenCalled()
    expect(track).not.toHaveBeenCalledWith('perfil_salvo')
    expect(campo('Nome completo')).toBeTruthy()
  })

  it('enquanto salva, os botões ficam bloqueados e um segundo clique não reenvia', async () => {
    let resolve: (p: Paciente) => void = () => {}
    put.mockReturnValue(new Promise<Paciente>((r) => (resolve = r)) as never)
    renderiza()
    editar()
    salvar()
    const salvandoBtn = await screen.findByRole('button', { name: 'Salvando…' })
    expect((salvandoBtn as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled).toBe(true)
    // Enter no campo envia o formulário mesmo com o botão bloqueado.
    fireEvent.submit(salvandoBtn.closest('form') as HTMLFormElement)
    expect(put).toHaveBeenCalledTimes(1)
    resolve(PACIENTE)
    await screen.findByRole('button', { name: 'Editar' })
  })
})

describe('conta', () => {
  it('Sair registra o logout e chama a saída', () => {
    const props = renderiza()
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }))
    expect(track).toHaveBeenCalledWith('logout')
    expect(props.onLogout).toHaveBeenCalled()
  })

  it('mostra "Titular da conta" e "Não informado" sem convênio, e "—" sem telefone', () => {
    renderiza({ paciente: { ...PACIENTE, convenio: undefined, telefone: undefined } as unknown as Paciente })
    expect(screen.getByText('Titular da conta')).toBeTruthy()
    expect(valorDe('Convênio')).toBe('Não informado')
    expect(valorDe('Telefone')).toBe('—')
  })

  it('com convênio, o subtítulo traz operadora e plano; a pílula de notificações segue a flag (desligada)', () => {
    renderiza()
    expect(screen.getByText('Titular · Unimed · Premium')).toBeTruthy()
    expect(screen.getByText('Conta verificada')).toBeTruthy()
    expect(screen.queryByText('Notificações ativas')).toBeNull()
  })
})

describe('carregando e erro', () => {
  it('enquanto o perfil não chega, mostra o carregamento e não deixa editar', () => {
    renderiza({ paciente: null, carregando: true })
    expect(screen.getByRole('status', { name: 'Carregando perfil' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
  })

  it('falha ao carregar mostra a mensagem da API e tenta de novo', () => {
    const props = renderiza({ paciente: null, erro: 'Erro ao carregar perfil' })
    expect(screen.getByText('Não foi possível carregar seu perfil')).toBeTruthy()
    expect(screen.getByText('Erro ao carregar perfil')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(props.onRecarregar).toHaveBeenCalled()
  })
})
