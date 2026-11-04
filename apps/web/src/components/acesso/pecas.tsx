import { useState } from 'react'
import type { ReactNode } from 'react'
import * as DS from '../../ds'
import { Field, IconBtn } from '../portal'
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
