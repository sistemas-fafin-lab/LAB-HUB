import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Acesso (/entrar): login, cadastro, recuperação e nova senha, montados numa
// URL. Só o cliente do Supabase, o cliente `api` e o analytics são dublês —
// router, validações e componentes são os reais.
// ---------------------------------------------------------------------------

const supa = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({ supabase: { auth: supa } }))

const apiPost = vi.hoisted(() => vi.fn())
vi.mock('../lib/api', () => ({ api: { post: apiPost } }))

const track = vi.hoisted(() => vi.fn())
vi.mock('../lib/analytics', () => ({ track }))

const { AuthGate } = await import('./AuthGate')
const { TelaDeTransicao } = await import('../components/sistema/Transicoes')
const { useTransicao } = await import('../lib/transicao')

/** A tela de transição em curso, como o App a monta acima da entrada. */
function Transicao() {
  const texto = useTransicao()
  return texto === null ? null : <TelaDeTransicao texto={texto} />
}

/** A entrada numa URL, com a tela de transição ao lado. */
function abre(url: string, { comSessao = false } = {}) {
  window.history.replaceState(null, '', url)
  return render(
    <>
      <AuthGate comSessao={comSessao} />
      <Transicao />
    </>,
  )
}

/** Promessa que o teste resolve quando quiser: a chamada "em curso". */
function pendente<T>() {
  let resolve: (v: T) => void = () => {}
  let reject: (e: unknown) => void = () => {}
  const promessa = new Promise<T>((ok, falha) => {
    resolve = ok
    reject = falha
  })
  return { promessa, resolve, reject }
}

const transicao = (texto: string) => screen.queryByRole('status', { name: texto })

const caminho = () => window.location.pathname + window.location.search

/** Campo pelo rótulo exato (o de senha não inclui o botão do olho). */
const campo = (rotulo: string) => screen.getByLabelText(rotulo, { selector: 'input, select' }) as HTMLInputElement

const digita = (rotulo: string, valor: string) => fireEvent.change(campo(rotulo), { target: { value: valor } })

/** Mensagem ligada ao campo por aria-describedby — "junto ao campo". */
function erroDo(rotulo: string): string | null {
  const id = campo(rotulo).getAttribute('aria-describedby')
  return id === null ? null : (document.getElementById(id)?.textContent ?? null)
}

beforeEach(() => {
  vi.clearAllMocks()
  supa.signInWithPassword.mockResolvedValue({ error: null })
  supa.resetPasswordForEmail.mockResolvedValue({ error: null })
  supa.updateUser.mockResolvedValue({ error: null })
})

describe('login', () => {
  it('enviar vazio mostra os erros junto a cada campo e não chama o Supabase', async () => {
    abre('/entrar')
    expect(screen.getByRole('heading', { level: 1, name: 'Bem-vindo de volta' })).toBeTruthy()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Entrar' })))

    expect(erroDo('E-mail')).toBe('Email inválido')
    expect(erroDo('Senha')).toBe('Informe sua senha')
    expect(supa.signInWithPassword).not.toHaveBeenCalled()
  })

  it('blur só valida campo preenchido', () => {
    abre('/entrar')
    fireEvent.blur(campo('E-mail'))
    expect(erroDo('E-mail')).toBeNull()
    digita('E-mail', 'maria@')
    fireEvent.blur(campo('E-mail'))
    expect(erroDo('E-mail')).toBe('Email inválido')
  })

  it('entra com e-mail e senha pelo Supabase e registra login_submit', async () => {
    abre('/entrar')
    digita('E-mail', 'maria@example.com')
    digita('Senha', 'senha-legada')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Entrar' })))

    expect(supa.signInWithPassword).toHaveBeenCalledWith({ email: 'maria@example.com', password: 'senha-legada' })
    expect(track).toHaveBeenCalledWith('login_submit')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each([
    ['Invalid login credentials', 'E-mail ou senha incorretos.'],
    ['Email not confirmed', 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.'],
    ['Request rate limit reached', 'Muitas tentativas seguidas. Aguarde um instante e tente de novo.'],
    ['boom', 'Não foi possível entrar agora. Tente novamente em instantes.'],
  ])('erro "%s" do Supabase vira "%s" e login_erro leva a mensagem crua', async (original, traduzida) => {
    supa.signInWithPassword.mockResolvedValue({ error: { message: original } })
    abre('/entrar')
    digita('E-mail', 'maria@example.com')
    digita('Senha', 'x')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Entrar' })))

    expect(screen.getByRole('alert').textContent).toContain(traduzida)
    expect(track).toHaveBeenCalledWith('login_erro', { motivo: original })
  })

  it('"Preparando seus resultados" cobre a tela enquanto o login roda e some ao concluir', async () => {
    const login = pendente<{ error: null }>()
    supa.signInWithPassword.mockReturnValue(login.promessa)
    abre('/entrar')
    digita('E-mail', 'maria@example.com')
    digita('Senha', 'senha-legada')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Entrar' })))
    expect(transicao('Preparando seus resultados')).toBeTruthy()

    await act(async () => login.resolve({ error: null }))
    await waitFor(() => expect(transicao('Preparando seus resultados')).toBeNull())
  })

  it('se o login falha, a transição sai e a mensagem aparece como hoje', async () => {
    const login = pendente<{ error: { message: string } }>()
    supa.signInWithPassword.mockReturnValue(login.promessa)
    abre('/entrar')
    digita('E-mail', 'maria@example.com')
    digita('Senha', 'x')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Entrar' })))
    expect(transicao('Preparando seus resultados')).toBeTruthy()

    await act(async () => login.resolve({ error: { message: 'Invalid login credentials' } }))
    expect(screen.getByRole('alert').textContent).toContain('E-mail ou senha incorretos.')
    await waitFor(() => expect(transicao('Preparando seus resultados')).toBeNull())
  })

  it('mostra e esconde a senha', () => {
    abre('/entrar')
    expect(campo('Senha').type).toBe('password')
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(campo('Senha').type).toBe('text')
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }))
    expect(campo('Senha').type).toBe('password')
  })
})

describe('cadastro', () => {
  const vaiParaCadastro = () => fireEvent.click(screen.getByRole('tab', { name: 'Criar conta' }))
  const continua = () => act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continuar' })))
  const criaConta = () => act(async () => fireEvent.click(screen.getByRole('button', { name: 'Criar conta' })))
  const titulo = () => screen.getByRole('heading', { level: 1 }).textContent
  /** Etapa marcada como atual no indicador "01 Seus dados · 02 Senha · 03 Confirmação". */
  const etapaAtual = () =>
    screen.getByRole('list', { name: 'Etapas do cadastro' }).querySelector('[aria-current="step"]')?.textContent

  function preencheDados() {
    digita('Nome completo', 'Maria Souza')
    digita('CPF', '52998224725')
    digita('Nascimento', '14031990')
    digita('Telefone (opcional)', '61912345678')
    digita('E-mail', 'maria@example.com')
  }

  async function chegaNaSenha() {
    abre('/entrar')
    vaiParaCadastro()
    preencheDados()
    await continua()
  }

  function preencheSenha(senha = 'SenhaForte123', confirmacao = senha) {
    digita('Senha', senha)
    digita('Confirmar senha', confirmacao)
  }

  it('começa na etapa "Seus dados", com as abas, e aplica as máscaras', () => {
    abre('/entrar')
    vaiParaCadastro()
    expect(titulo()).toBe('Crie sua conta')
    expect(etapaAtual()).toBe('01Seus dados')
    expect(screen.getByRole('tab', { name: 'Criar conta' })).toBeTruthy()
    expect(screen.queryByLabelText('Senha', { selector: 'input' })).toBeNull()

    digita('CPF', '52998224725')
    digita('Nascimento', '14031990')
    digita('Telefone (opcional)', '61912345678')
    expect(campo('CPF').value).toBe('529.982.247-25')
    expect(campo('Nascimento').value).toBe('14/03/1990')
    expect(campo('Telefone (opcional)').value).toBe('(61) 9 1234-5678')
  })

  it('dados inválidos mostram os erros junto aos campos e não avançam', async () => {
    abre('/entrar')
    vaiParaCadastro()
    digita('CPF', '11111111111')
    digita('Telefone (opcional)', '6199')
    await continua()

    expect(erroDo('Nome completo')).toBe('Informe seu nome')
    expect(erroDo('CPF')).toBe('CPF inválido')
    expect(erroDo('Nascimento')).toBe('Informe a data de nascimento')
    expect(erroDo('Telefone (opcional)')).toBe('Telefone inválido')
    expect(erroDo('E-mail')).toBe('Email inválido')
    expect(titulo()).toBe('Crie sua conta')
    expect(apiPost).not.toHaveBeenCalled()
  })

  it.each(['31/02/1990', '14/13/1990', '14/03/1890', '14/03/19'])(
    'nascimento "%s" não é uma data válida e não avança',
    async (data) => {
      abre('/entrar')
      vaiParaCadastro()
      preencheDados()
      digita('Nascimento', data)
      await continua()

      expect(erroDo('Nascimento')).toBe('Data inválida')
      expect(titulo()).toBe('Crie sua conta')
    },
  )

  it('com os dados certos vai para "Senha", sem as abas; voltar mantém o que foi digitado', async () => {
    await chegaNaSenha()
    expect(titulo()).toBe('Crie uma senha')
    expect(etapaAtual()).toBe('02Senha')
    expect(screen.queryByRole('tab', { name: 'Criar conta' })).toBeNull()
    expect(apiPost).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(titulo()).toBe('Crie sua conta')
    expect(campo('Nome completo').value).toBe('Maria Souza')
    expect(campo('CPF').value).toBe('529.982.247-25')
  })

  it('senha fraca ou confirmação diferente aparecem junto ao campo e não chamam a API', async () => {
    await chegaNaSenha()
    preencheSenha('curta', 'outra')
    await criaConta()

    expect(erroDo('Senha')).toBe('Senha deve ter ao menos 12 caracteres')
    expect(erroDo('Confirmar senha')).toBe('As senhas não conferem')
    expect(apiPost).not.toHaveBeenCalled()
  })

  it('cria a conta e, com confirmação de e-mail, vai para a etapa "Confirmação"', async () => {
    apiPost.mockResolvedValue({ requiresEmailConfirmation: true, paciente: {} })
    abre('/entrar')
    vaiParaCadastro()
    preencheDados()
    fireEvent.change(campo('Sexo'), { target: { value: 'F' } })
    await continua()
    preencheSenha()
    await criaConta()

    expect(apiPost).toHaveBeenCalledWith('/cadastro', {
      nome: 'Maria Souza',
      email: 'maria@example.com',
      password: 'SenhaForte123',
      cpf: '52998224725',
      sexo: 'F',
      dataNascimento: '1990-03-14',
      telefone: '61912345678',
    })
    expect(track).toHaveBeenCalledWith('cadastro_submit')
    expect(track).toHaveBeenCalledWith('cadastro_sucesso', { confirmacao_email: true })
    expect(titulo()).toBe('Confirme seu e-mail')
    expect(etapaAtual()).toBe('03Confirmação')
    expect(screen.getByText('maria@example.com')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Ir para o login' }))
    expect(titulo()).toBe('Bem-vindo de volta')
  })

  it('sem confirmação de e-mail, entra direto', async () => {
    apiPost.mockResolvedValue({ requiresEmailConfirmation: false, paciente: {} })
    await chegaNaSenha()
    preencheSenha()
    await criaConta()

    expect(supa.signInWithPassword).toHaveBeenCalledWith({ email: 'maria@example.com', password: 'SenhaForte123' })
    expect(apiPost.mock.calls[0]![1]).toMatchObject({ sexo: 'M' })
  })

  it('erro da API aparece como veio, na etapa da senha, e vai para cadastro_erro', async () => {
    const msg = 'Não foi possível cadastrar com esses dados.'
    apiPost.mockRejectedValue(new Error(msg))
    await chegaNaSenha()
    preencheSenha()
    await criaConta()

    expect(screen.getByRole('alert').textContent).toContain(msg)
    expect(titulo()).toBe('Crie uma senha')
    expect(track).toHaveBeenCalledWith('cadastro_erro', { motivo: msg })
  })
})

describe('cadastro com a tela de transição', () => {
  async function preencheEEnvia() {
    fireEvent.click(screen.getByRole('tab', { name: 'Criar conta' }))
    digita('Nome completo', 'Maria Souza')
    digita('CPF', '52998224725')
    digita('Nascimento', '14031990')
    digita('E-mail', 'maria@example.com')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continuar' })))
    digita('Senha', 'SenhaForte123')
    digita('Confirmar senha', 'SenhaForte123')
    return act(async () => fireEvent.click(screen.getByRole('button', { name: 'Criar conta' })))
  }

  it('"Criando sua conta" cobre a tela enquanto o cadastro roda e some ao pedir a confirmação', async () => {
    const cadastro = pendente<{ requiresEmailConfirmation: boolean; paciente: object }>()
    apiPost.mockReturnValue(cadastro.promessa)
    abre('/entrar')
    await preencheEEnvia()
    expect(transicao('Criando sua conta')).toBeTruthy()

    await act(async () => cadastro.resolve({ requiresEmailConfirmation: true, paciente: {} }))
    expect(screen.getByRole('heading', { level: 1, name: 'Confirme seu e-mail' })).toBeTruthy()
    await waitFor(() => expect(transicao('Criando sua conta')).toBeNull())
  })

  it('se o cadastro falha, a transição sai e o erro da API aparece como veio', async () => {
    const cadastro = pendente<never>()
    apiPost.mockReturnValue(cadastro.promessa)
    abre('/entrar')
    await preencheEEnvia()
    expect(transicao('Criando sua conta')).toBeTruthy()

    await act(async () => cadastro.reject(new Error('CPF já cadastrado.')))
    expect(screen.getByRole('alert').textContent).toContain('CPF já cadastrado.')
    await waitFor(() => expect(transicao('Criando sua conta')).toBeNull())
  })
})

describe('tema', () => {
  it('alterna o tema com o mesmo evento do cabeçalho', () => {
    abre('/entrar')
    fireEvent.click(screen.getByRole('button', { name: /tema escuro/ }))
    expect(track).toHaveBeenCalledWith('tema_alternado', { modo: 'dark' })
    fireEvent.click(screen.getByRole('button', { name: /tema claro/ }))
    expect(track).toHaveBeenCalledWith('tema_alternado', { modo: 'light' })
  })
})

describe('modo na URL', () => {
  it('abas e "Esqueci minha senha" trocam o modo e mantêm o next', () => {
    abre('/entrar?next=%2Fresultados')
    fireEvent.click(screen.getByRole('tab', { name: 'Criar conta' }))
    expect(caminho()).toBe('/entrar?modo=cadastro&next=%2Fresultados')
    fireEvent.click(screen.getByRole('tab', { name: 'Entrar' }))
    expect(caminho()).toBe('/entrar?next=%2Fresultados')

    fireEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }))
    expect(caminho()).toBe('/entrar?modo=recuperar&next=%2Fresultados')
    expect(screen.getByRole('heading', { level: 1, name: 'Recuperar acesso' })).toBeTruthy()
  })

  it('abrir /entrar?modo=cadastro já mostra o cadastro', () => {
    abre('/entrar?modo=cadastro')
    expect(screen.getByRole('heading', { level: 1, name: 'Crie sua conta' })).toBeTruthy()
  })
})

describe('recuperar senha', () => {
  it('e-mail inválido aparece junto ao campo e não chama o Supabase', async () => {
    abre('/entrar?modo=recuperar')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Enviar instruções' })))
    expect(erroDo('E-mail')).toBe('Email inválido')
    expect(supa.resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('envia o link para a tela de nova senha e não revela se a conta existe', async () => {
    abre('/entrar?modo=recuperar')
    digita('E-mail', ' maria@example.com ')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Enviar instruções' })))

    expect(supa.resetPasswordForEmail).toHaveBeenCalledWith('maria@example.com', {
      redirectTo: `${window.location.origin}/entrar?modo=nova-senha`,
    })
    expect(screen.getByRole('heading', { level: 1, name: 'Verifique seu e-mail' })).toBeTruthy()
    expect(screen.getByText(/Se houver uma conta com/).textContent).toContain('maria@example.com')

    // Reenviar volta ao formulário com o e-mail preenchido.
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar' }))
    expect(campo('E-mail').value).toBe('maria@example.com')
  })

  it('limite de tentativas vira mensagem em português', async () => {
    supa.resetPasswordForEmail.mockResolvedValue({ error: { message: 'For security purposes, you can only request this after 40 seconds.' } })
    abre('/entrar?modo=recuperar')
    digita('E-mail', 'maria@example.com')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Enviar instruções' })))
    expect(screen.getByRole('alert').textContent).toContain('Muitas tentativas seguidas.')
    expect(screen.queryByRole('heading', { name: 'Verifique seu e-mail' })).toBeNull()
  })

  it('"Voltar para o login" volta ao login mantendo o next', () => {
    abre('/entrar?modo=recuperar&next=%2Fdocumentos')
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para o login' }))
    expect(caminho()).toBe('/entrar?next=%2Fdocumentos')
  })
})

describe('nova senha (link do e-mail)', () => {
  it('sem sessão de recuperação, avisa que o link venceu e oferece pedir outro', () => {
    abre('/entrar?modo=nova-senha')
    expect(screen.getByRole('heading', { level: 1, name: 'Link inválido ou expirado' })).toBeTruthy()
    expect(screen.queryByLabelText('Nova senha')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Pedir novo link' }))
    expect(caminho()).toBe('/entrar?modo=recuperar')
  })

  it('aplica a política de senha atual e confere a confirmação', async () => {
    abre('/entrar?modo=nova-senha', { comSessao: true })
    expect(screen.getByRole('heading', { level: 1, name: 'Crie uma nova senha' })).toBeTruthy()
    digita('Nova senha', 'semmaiuscula123')
    digita('Confirmar nova senha', 'outra')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' })))

    expect(erroDo('Nova senha')).toBe('Senha deve ter ao menos uma letra maiúscula')
    expect(erroDo('Confirmar nova senha')).toBe('As senhas não conferem.')
    expect(supa.updateUser).not.toHaveBeenCalled()
  })

  it('salva pelo Supabase e segue para o portal', async () => {
    abre('/entrar?modo=nova-senha', { comSessao: true })
    digita('Nova senha', 'SenhaNova12345')
    digita('Confirmar nova senha', 'SenhaNova12345')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' })))

    expect(supa.updateUser).toHaveBeenCalledWith({ password: 'SenhaNova12345' })
    expect(screen.getByRole('heading', { level: 1, name: 'Senha alterada' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(caminho()).toBe('/')
  })

  it('senha igual à anterior aparece junto ao campo', async () => {
    supa.updateUser.mockResolvedValue({ error: { message: 'New password should be different from the old password.' } })
    abre('/entrar?modo=nova-senha', { comSessao: true })
    digita('Nova senha', 'SenhaNova12345')
    digita('Confirmar nova senha', 'SenhaNova12345')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' })))
    expect(erroDo('Nova senha')).toBe('A nova senha precisa ser diferente da atual.')
  })

  it('sessão perdida no meio do caminho leva ao aviso de link expirado', async () => {
    supa.updateUser.mockResolvedValue({ error: { message: 'Auth session missing!' } })
    abre('/entrar?modo=nova-senha', { comSessao: true })
    digita('Nova senha', 'SenhaNova12345')
    digita('Confirmar nova senha', 'SenhaNova12345')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' })))
    expect(screen.getByRole('heading', { level: 1, name: 'Link inválido ou expirado' })).toBeTruthy()
  })
})
