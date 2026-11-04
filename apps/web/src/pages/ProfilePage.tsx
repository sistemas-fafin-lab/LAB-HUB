import { useState } from 'react'
import type { AtualizarPacientePayload, Paciente } from '@lab-hub/shared'
import { Avatar, Btn, FalhaAoCarregar, Field, MensagemDeErro, Node, Panel, PanelHead, Pill, Skel } from '../components/portal'
import { api } from '../lib/api'
import { track } from '../lib/analytics'
import { avisar } from '../lib/avisos'
import { MOSTRAR_NOTIFICACOES } from '../lib/flags'
import { iniciais } from '../lib/paciente'
import {
  apenasDigitos,
  formatarCpf,
  formatarData,
  formatarTelefone,
  validarNome,
  validarTelefone,
} from '../lib/validators'

interface ProfilePageProps {
  paciente: Paciente | null
  /** GET /pacientes/me em curso */
  carregando: boolean
  /** Falha do GET /pacientes/me (mensagem da API) */
  erro: string | null
  onRecarregar: () => void
  onLogout: () => void | Promise<void>
  onSaved: (p: Paciente) => void
}

interface Formulario {
  nome: string
  telefone: string
  operadora: string
  plano: string
}

interface ErrosDeCampo {
  nome?: string
  telefone?: string
}

const CAMPOS_VALIDADOS: Record<keyof ErrosDeCampo, true> = { nome: true, telefone: true }

// "Operadora · Plano" quando há convênio; "Não informado" sem convênio.
function rotuloConvenio(p: Paciente): string {
  return p.convenio ? [p.convenio.operadora, p.convenio.plano].filter(Boolean).join(' · ') : 'Não informado'
}

function formularioDe(p: Paciente): Formulario {
  return {
    nome: p.nome,
    telefone: p.telefone ? formatarTelefone(p.telefone) : '',
    operadora: p.convenio?.operadora ?? '',
    plano: p.convenio?.plano ?? '',
  }
}

// Mesmo corpo do PUT de antes: nome e telefone (só dígitos) sempre; convênio
// nulo sem operadora (limpa), e plano só quando preenchido.
function payloadDe(f: Formulario): AtualizarPacientePayload {
  const operadora = f.operadora.trim()
  const plano = f.plano.trim()
  return {
    nome: f.nome.trim(),
    telefone: apenasDigitos(f.telefone),
    convenio: operadora ? { operadora, ...(plano ? { plano } : {}) } : null,
  }
}

export function ProfilePage({ paciente, carregando, erro: erroAoCarregar, onRecarregar, onLogout, onSaved }: ProfilePageProps) {
  const [form, setForm] = useState<Formulario | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [errosDeCampo, setErrosDeCampo] = useState<ErrosDeCampo>({})

  if (!paciente) {
    return (
      <div className="lh-alvos max-w-4xl mx-auto">
        {erroAoCarregar && !carregando ? (
          <Panel pad={0}>
            <FalhaAoCarregar titulo="Não foi possível carregar seu perfil" erro={erroAoCarregar} onTentar={onRecarregar} />
          </Panel>
        ) : (
          <Panel pad={24}>
            <div role="status" aria-busy="true" aria-label="Carregando perfil" className="flex items-center gap-5">
              <Node loading size={40} />
              <div className="flex-1">
                <Skel className="h-6 w-1/2" />
                <Skel className="h-3.5 w-1/3 mt-3" />
              </div>
            </div>
          </Panel>
        )}
      </div>
    )
  }

  const editando = form !== null
  const muda = (campo: keyof Formulario, mascara?: (v: string) => string) => (valor: string) => {
    setForm((f) => (f ? { ...f, [campo]: mascara ? mascara(valor) : valor } : f))
    if (campo in CAMPOS_VALIDADOS) setErrosDeCampo((e) => ({ ...e, [campo]: undefined }))
  }

  const comecarEdicao = () => {
    setForm(formularioDe(paciente))
    setErrosDeCampo({})
    setErro(null)
  }

  const salvar = async () => {
    if (!form || salvando) return
    const nome = validarNome(form.nome)
    const telefone = validarTelefone(form.telefone)
    if (nome || telefone) {
      setErrosDeCampo({ ...(nome ? { nome } : {}), ...(telefone ? { telefone } : {}) })
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      const atualizado = await api.put<Paciente>('/pacientes/me', payloadDe(form))
      track('perfil_salvo')
      onSaved(atualizado)
      setForm(null)
      avisar({ title: 'Dados atualizados' })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  const dados: [string, string][] = [
    ['Nome completo', paciente.nome],
    ['CPF', formatarCpf(paciente.cpf)],
    ['Data de nascimento', formatarData(paciente.dataNascimento)],
    ['E-mail', paciente.email],
    ['Telefone', paciente.telefone ? formatarTelefone(paciente.telefone) : '—'],
    ['Convênio', rotuloConvenio(paciente)],
  ]

  return (
    <div className="lh-alvos max-w-4xl mx-auto">
      <Panel pad={24} style={{ marginBottom: 20 }} className="flex items-center gap-5 flex-wrap">
        <Avatar initials={iniciais(paciente.nome)} size={80} />
        <div className="flex-1 min-w-0">
          <h1 className="font-display font-medium text-[28px] md:text-[30px] leading-[1.1] tracking-[-0.02em] break-words">
            {paciente.nome}
          </h1>
          <p className="text-[14px] text-muted mt-1">
            {paciente.convenio ? `Titular · ${rotuloConvenio(paciente)}` : 'Titular da conta'}
          </p>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Pill tone="brand" icon="shield-check">
              Conta verificada
            </Pill>
            {/* Sem backend de notificações: oculto por flag. */}
            {MOSTRAR_NOTIFICACOES && <Pill icon="bell">Notificações ativas</Pill>}
          </div>
        </div>
        {!editando && (
          <div className="flex items-center gap-2 flex-wrap">
            <Btn icon="pencil" onClick={comecarEdicao}>
              Editar
            </Btn>
            <Btn
              variant="secondary"
              icon="log-out"
              onClick={() => {
                track('logout')
                void onLogout()
              }}
            >
              Sair
            </Btn>
          </div>
        )}
      </Panel>

      <Panel pad={24}>
        <PanelHead title="Dados pessoais" className="mb-5" />
        {editando ? (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              void salvar()
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                className="sm:col-span-2"
                label="Nome completo"
                autoComplete="name"
                placeholder="Seu nome completo"
                value={form.nome}
                onChange={muda('nome')}
                error={errosDeCampo.nome}
              />
              <Field label="CPF" value={formatarCpf(paciente.cpf)} disabled hint="Não editável" />
              <Field label="Data de nascimento" value={formatarData(paciente.dataNascimento)} disabled hint="Não editável" />
              <Field className="sm:col-span-2" label="E-mail" icon="mail" value={paciente.email} disabled hint="Altere pelo login" />
              <Field
                className="sm:col-span-2"
                label="Telefone"
                icon="phone"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(61) 9 0000-0000"
                value={form.telefone}
                onChange={muda('telefone', formatarTelefone)}
                error={errosDeCampo.telefone}
              />
              <Field label="Convênio" placeholder="Ex.: Unimed" value={form.operadora} onChange={muda('operadora')} />
              <Field label="Plano" placeholder="Ex.: Premium" value={form.plano} onChange={muda('plano')} />
            </div>
            {erro && (
              <div className="mt-4">
                <MensagemDeErro>{erro}</MensagemDeErro>
              </div>
            )}
            <div className="flex justify-end gap-2 mt-6 flex-wrap">
              <Btn variant="secondary" type="button" disabled={salvando} onClick={() => setForm(null)}>
                Cancelar
              </Btn>
              <Btn type="submit" loading={salvando}>
                {salvando ? 'Salvando…' : 'Salvar alterações'}
              </Btn>
            </div>
          </form>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
            {dados.map(([rotulo, valor]) => (
              <div key={rotulo} className="min-w-0">
                <dt className="lh-ov mb-1.5">{rotulo}</dt>
                <dd className="text-[14px] font-medium break-words">{valor}</dd>
              </div>
            ))}
          </dl>
        )}
      </Panel>
    </div>
  )
}
