import type { ReactNode } from 'react'
import * as DS from '../../ds'
import type { IconName } from '../../ds'
import { IconBtn, Ico } from '../portal'

// Destaques do painel da marca. Texto conservador de propósito: só promete o
// que o portal entrega hoje — o design trazia "Resultados em 24h" e "Família
// em um só perfil", e o painel antigo "status em tempo real", que não existem.
const DESTAQUES: readonly { icone: IconName; texto: string }[] = [
  { icone: 'lock', texto: 'Dados protegidos e criptografados' },
  { icone: 'activity', texto: 'Acompanhe o andamento dos exames' },
  { icone: 'history', texto: 'Histórico completo dos exames' },
]

/** Painel azul com o recorte em L da marca (Grafismo). Só de 1024 px para cima. */
function PainelMarca() {
  return (
    <div className="hidden lg:block sticky top-0 h-screen self-start w-[46%] max-w-[640px] p-4 shrink-0">
      <DS.Grafismo
        fill="var(--lh-brand)"
        notch="top-right"
        step={[0.3, 0.14]}
        radius={32}
        height="100%"
        contentStyle={{ padding: 48 }}
      >
        <div className="h-full flex flex-col text-white">
          <img src="/assets/labhub/labhub-wordmark-white.svg" alt="Lab Hub" className="h-[28px] w-auto self-start" />
          <div className="mt-auto max-w-md">
            <div className="text-[11px] font-semibold uppercase tracking-[.08em] mb-4">Plataforma do paciente</div>
            {/* Não é heading: o título da página é o do formulário. */}
            <p className="font-display font-medium text-[44px] xl:text-[48px] leading-[1.04] tracking-[-0.02em]">
              Seus resultados na palma da mão.
            </p>
            <p className="text-[16px] leading-relaxed mt-4">
              {/* Sem "compartilhe laudos com seu médico": compartilhar não existe (issue 18). */}
              Acesse exames, agende coletas e baixe seus laudos — com a segurança de um laboratório clínico de
              referência.
            </p>
            <ul className="mt-8 flex flex-col gap-3">
              {DESTAQUES.map((d) => (
                <li key={d.texto} className="flex items-center gap-3 text-[15px]">
                  <span
                    aria-hidden="true"
                    className="w-8 h-8 rounded-[8px] inline-flex items-center justify-center"
                    style={{ boxShadow: 'inset 0 0 0 1.5px #fff' }}
                  >
                    <Ico name={d.icone} size={16} />
                  </span>
                  {d.texto}
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-10 text-[12px]">© 2026 Lab Hub Diagnósticos</p>
        </div>
      </DS.Grafismo>
    </div>
  )
}

interface MolduraAcessoProps {
  dark: boolean
  onToggleDark: () => void
  children: ReactNode
}

// ---------------------------------------------------------------------------
// MolduraAcesso — cromo das telas sem sessão (portal v2, raiz `.lh-v2`):
// painel da marca à esquerda (≥ 1024 px) e a coluna do formulário. Login,
// cadastro, recuperação e confirmação de e-mail compartilham a moldura.
// ---------------------------------------------------------------------------
export function MolduraAcesso({ dark, onToggleDark, children }: MolduraAcessoProps) {
  return (
    <div className="lh-v2 min-h-screen w-full flex bg-page text-ink" data-screen-label="00 Acesso">
      <PainelMarca />
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-6 sm:p-6 md:p-10 relative">
        <div className="absolute top-4 right-4 sm:top-5 sm:right-5">
          <IconBtn
            icon={dark ? 'sun' : 'moon'}
            label={dark ? 'Usar tema claro' : 'Usar tema escuro'}
            size="md"
            onClick={onToggleDark}
          />
        </div>
        <div className="w-full max-w-[400px] py-8">
          <img
            src={dark ? '/assets/labhub/labhub-wordmark-white.svg' : '/assets/labhub/labhub-wordmark-black.svg'}
            alt="Lab Hub"
            className="lg:hidden h-[24px] w-auto mb-10"
          />
          {children}
          <p className="text-[12px] text-muted mt-8 flex items-center justify-center gap-1.5">
            <Ico name="shield" size={14} />
            Conexão segura · Conformidade com a LGPD
          </p>
        </div>
      </main>
    </div>
  )
}
