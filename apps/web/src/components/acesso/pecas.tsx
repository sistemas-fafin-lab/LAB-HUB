import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import * as DS from '../../ds'
import { Field, IconBtn, MensagemDeErro } from '../portal'
import { ESPERA_PARA_REENVIAR_S } from '../../lib/doisFatores'
import { REGRAS_SENHA } from '../../lib/validators'

/** Título da tela de acesso (o h1 da página), com o bloco azul no fim. */
export function TituloAcesso({ titulo, sub }: { titulo: string; sub: ReactNode }) {
  return (
    <>
      <h1 className="font-display font-medium text-[32px] md:text-[34px] leading-[1.08] tracking-[-0.02em]">
        {titulo}
        <span className="lh-dot" aria-hidden="true" />
      </h1>
      <p className="text-[14px] text-muted mt-2 mb-6">{sub}</p>
    </>
  )
}

const ETAPAS_DO_CADASTRO = ['Seus dados', 'Senha', 'Confirmação'] as const

/** Indicador "01 Seus dados · 02 Senha · 03 Confirmação", acima do título do cadastro. */
export function EtapasCadastro({ atual }: { atual: 0 | 1 | 2 }) {
  return (
    <ol className="flex items-center gap-4 mb-5" aria-label="Etapas do cadastro">
      {ETAPAS_DO_CADASTRO.map((nome, i) => (
        <li key={nome} className="flex items-center gap-2" aria-current={i === atual ? 'step' : undefined}>
          <span
            className={
              'font-display font-medium text-[18px] leading-none tabular-nums ' +
              (i === atual ? 'text-brand' : i < atual ? 'text-ink' : 'text-faint')
            }
          >
            {String(i + 1).padStart(2, '0')}
          </span>
          <span className={'text-[12px] font-medium whitespace-nowrap ' + (i > atual ? 'text-muted' : 'text-ink')}>
            {nome}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** Erro que não é de um campo (resposta do Supabase ou da API). */
export function AvisoErro({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-[14px] bg-coral-soft p-3.5 text-[13px] leading-relaxed flex gap-2.5">
      <span className="lh-bl mt-[6px] shrink-0" style={{ background: 'var(--lh-coral)' }} aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}

interface CampoSenhaProps {
  id: string
  label?: string
  value: string
  onChange: (valor: string) => void
  onBlur?: () => void
  error?: string | undefined
  autoComplete: 'current-password' | 'new-password'
}

/** Campo de senha com o botão de mostrar/ocultar. */
export function CampoSenha({ id, label = 'Senha', value, onChange, onBlur, error, autoComplete }: CampoSenhaProps) {
  const [visivel, setVisivel] = useState(false)
  return (
    <Field
      id={id}
      label={label}
      type={visivel ? 'text' : 'password'}
      icon="lock"
      value={value}
      onChange={onChange}
      {...(onBlur ? { onBlur } : {})}
      error={error}
      autoComplete={autoComplete}
      trailing={
        <IconBtn
          icon={visivel ? 'eye-off' : 'eye'}
          label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
          onClick={() => setVisivel((v) => !v)}
        />
      }
    />
  )
}

/** Requisitos da senha (a mesma política de `validarSenha`), marcados conforme a digitação. */
export function RegrasSenha({ senha }: { senha: string }) {
  return (
    <ul aria-label="Requisitos da senha" className="flex flex-wrap gap-x-4 gap-y-1 -mt-1">
      {REGRAS_SENHA.map((r) => {
        const ok = r.atende(senha)
        return (
          <li key={r.rotulo} className={'flex items-center gap-1.5 text-[12px] ' + (ok ? 'text-ink' : 'text-muted')}>
            <span
              aria-hidden="true"
              className="w-4 h-4 rounded-[4px] inline-flex items-center justify-center"
              style={ok ? { background: 'var(--lh-brand)', color: '#fff' } : { boxShadow: 'inset 0 0 0 1.5px var(--lh-line-strong)' }}
            >
              {ok && <DS.Icon name="check" size={11} strokeWidth={2.4} />}
            </span>
            {r.rotulo}
            <span className="sr-only">{ok ? '(atendido)' : '(pendente)'}</span>
          </li>
        )
      })}
    </ul>
  )
}

const DIGITOS = 6

interface CodigoVerificacaoProps {
  valor: string
  onChange: (valor: string) => void
  /** Borda coral e a mensagem abaixo dos campos. */
  erro?: string | null
  disabled?: boolean
}

/**
 * Código de 6 dígitos em 6 campos. Colar distribui os dígitos, Backspace volta
 * ao campo anterior e as setas andam entre os campos. O foco começa no primeiro.
 */
export function CodigoVerificacao({ valor, onChange, erro = null, disabled = false }: CodigoVerificacaoProps) {
  const campos = useRef<(HTMLInputElement | null)[]>([])
  const idRotulo = useId()
  const idErro = useId()
  const digitos = Array.from({ length: DIGITOS }, (_, i) => valor[i] ?? '')

  useEffect(() => {
    campos.current[0]?.focus()
  }, [])

  const foca = (i: number) => campos.current[Math.max(0, Math.min(DIGITOS - 1, i))]?.focus()

  const escreve = (i: number, texto: string) => {
    const novos = texto.replace(/\D/g, '')
    if (novos === '') return
    const atual = [...digitos]
    for (let j = 0; j < novos.length && i + j < DIGITOS; j++) atual[i + j] = novos[j]!
    onChange(atual.join('').slice(0, DIGITOS))
    foca(i + novos.length)
  }

  const aoTeclar = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const atual = [...digitos]
      if (atual[i]) {
        atual[i] = ''
        onChange(atual.join(''))
      } else if (i > 0) {
        atual[i - 1] = ''
        onChange(atual.join(''))
        foca(i - 1)
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      foca(i - 1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      foca(i + 1)
    }
  }

  return (
    <div role="group" aria-labelledby={idRotulo} {...(erro ? { 'aria-describedby': idErro } : {})}>
      <div id={idRotulo} className="text-[14px] font-medium mb-2">
        Código de verificação
      </div>
      <div className="flex gap-2">
        {digitos.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              campos.current[i] = el
            }}
            value={d}
            disabled={disabled}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={DIGITOS}
            {...(i === 0 ? { autoComplete: 'one-time-code' } : { autoComplete: 'off' })}
            aria-label={`Dígito ${i + 1}`}
            aria-invalid={erro ? true : undefined}
            onChange={(e) => escreve(i, e.target.value.slice(d ? 1 : 0) || e.target.value)}
            onPaste={(e) => {
              e.preventDefault()
              escreve(0, e.clipboardData.getData('text'))
            }}
            onKeyDown={(e) => aoTeclar(i, e)}
            onFocus={(e) => e.target.select()}
            className="lh-field w-12 h-14 rounded-[12px] border-[1.5px] bg-card text-center font-display font-medium text-[24px] tabular-nums outline-none"
            style={{ borderColor: erro ? 'var(--lh-coral)' : d ? 'var(--lh-brand)' : 'var(--lh-line-strong)' }}
          />
        ))}
      </div>
      {erro && (
        <div id={idErro} className="mt-2">
          <MensagemDeErro>{erro}</MensagemDeErro>
        </div>
      )}
    </div>
  )
}

/** "Reenviar código em 0:SS" e, depois, o link para reenviar. */
export function ReenviarCodigo({ enviadoEm, onReenviar }: { enviadoEm: number | null; onReenviar: () => void }) {
  const [agora, setAgora] = useState(() => Date.now())
  const restante = enviadoEm === null ? 0 : Math.max(0, Math.ceil((enviadoEm + ESPERA_PARA_REENVIAR_S * 1000 - agora) / 1000))
  useEffect(() => {
    if (restante === 0) return
    const t = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [restante])
  if (restante > 0) {
    return (
      <p className="text-[13px] text-muted tabular-nums">
        Reenviar código em 0:{String(restante).padStart(2, '0')}
      </p>
    )
  }
  return (
    <button type="button" onClick={onReenviar} className="min-h-[44px] inline-flex items-center text-[13px] font-medium text-link hover:underline">
      Reenviar código
    </button>
  )
}
