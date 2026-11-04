import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import * as DS from '../ds'
import type { IconName } from '../ds'
import { Btn, IconTile, Ico, PageHeader, Panel, PanelHead, Pill } from '../components/portal'
import type { IconTileTone } from '../components/portal'
import { MOSTRAR_NOVIDADES, MOSTRAR_PRIVACIDADE_EXTRAS } from '../lib/flags'

interface SettingsPageProps {
  dark: boolean
  onSetDark: (dark: boolean) => void
}

// Preferências sem backend: só existem nos cartões atrás de flag e não saem
// desta tela (nada é salvo).
interface Prefs {
  emailResults: boolean
  smsResults: boolean
  pushResults: boolean
  marketing: boolean
  sharing: boolean
  twoFA: boolean
}

const PREFS_INICIAIS: Prefs = {
  emailResults: true,
  smsResults: false,
  pushResults: true,
  marketing: false,
  sharing: true,
  twoFA: true,
}

/** Cartão com título; a região leva o nome do cartão a quem navega por regiões. */
function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  const id = useId()
  return (
    <Panel>
      <section aria-labelledby={id}>
        <PanelHead title={<span id={id}>{titulo}</span>} className="mb-2" />
        {children}
      </section>
    </Panel>
  )
}

interface LinhaProps {
  icon: IconName
  title: string
  sub: string
  tone?: IconTileTone
  /** Controle à direita (interruptor ou botão) */
  children: ReactNode
}

function Linha({ icon, title, sub, tone, children }: LinhaProps) {
  return (
    <div className="flex items-center gap-3 py-3 border-t border-line first:border-t-0">
      <IconTile name={icon} size={36} {...(tone ? { tone } : {})} />
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold">{title}</div>
        <div className="text-[12px] text-muted">{sub}</div>
      </div>
      {children}
    </div>
  )
}

// Aparelho atual, derivado do navegador. Sem backend de sessões, listamos só o
// aparelho em uso (sistema + navegador). A ordem dos testes importa: Edge e Opera
// contêm "Chrome" na UA, e o Chrome contém "Safari"; a UA do iOS contém
// "Mac OS X" e a do Android contém "Linux".
function aparelhoAtual(): { nome: string; icon: IconName } {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const celular = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
  const sistema = /Windows/i.test(ua)
    ? 'Windows'
    : /Android/i.test(ua)
      ? 'Android'
      : /iPhone|iPad|iPod/i.test(ua)
        ? 'iOS'
        : /Mac OS X|Macintosh/i.test(ua)
          ? 'macOS'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'Sistema desconhecido'
  const navegador = /Edg\//i.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/i.test(ua)
      ? 'Opera'
      : /Chrome\//i.test(ua)
        ? 'Chrome'
        : /Firefox\//i.test(ua)
          ? 'Firefox'
          : /Safari\//i.test(ua)
            ? 'Safari'
            : 'Navegador'
  return { nome: `${navegador} · ${sistema}`, icon: celular ? 'smartphone' : 'monitor' }
}

// Miniaturas do OUTRO tema também: não dá para usar --lh-*, que segue o tema
// atual. Valores de tema.css (fundo e cartão de cada modo).
const TEMAS = [
  { escuro: false, rotulo: 'Claro', page: '#eef2f6', card: '#ffffff' },
  { escuro: true, rotulo: 'Escuro', page: '#0b1a33', card: '#1c3c6b' },
] as const

// Só leitura: idioma, fuso e unidades ainda não mudam nada no portal.
const REGIAO = [
  { rotulo: 'Idioma', valor: 'Português (Brasil)' },
  { rotulo: 'Fuso horário', valor: 'Brasília (GMT-3)' },
  { rotulo: 'Unidades', valor: 'Convencionais (mg/dL)' },
] as const

export function SettingsPage({ dark, onSetDark }: SettingsPageProps) {
  const [pref, setPref] = useState<Prefs>(PREFS_INICIAIS)
  const aparelho = aparelhoAtual()

  const alternar = (k: keyof Prefs, titulo: string) => (
    <DS.Switch label={titulo} checked={pref[k]} onChange={(v) => setPref((p) => ({ ...p, [k]: v }))} />
  )

  return (
    <div className="lh-alvos">
      <PageHeader title="Configurações" sub="Preferências, notificações, privacidade e segurança da conta." />

      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-5">
          {/* "Receber novidades" sem backend: oculto por flag. */}
          {MOSTRAR_NOVIDADES && (
            <Secao titulo="Como você quer receber novidades">
              <p className="text-[12px] text-muted mb-2">
                Avisamos quando seu exame fica pronto, quando há documentos novos e lembretes de coleta.
              </p>
              <div>
                <Linha icon="mail" title="Por e-mail" sub="No e-mail da conta">
                  {alternar('emailResults', 'Por e-mail')}
                </Linha>
                <Linha icon="message-square" title="Por SMS" sub="No telefone do cadastro">
                  {alternar('smsResults', 'Por SMS')}
                </Linha>
                <Linha icon="bell" title="Notificação push" sub="No celular e no navegador">
                  {alternar('pushResults', 'Notificação push')}
                </Linha>
                <Linha icon="megaphone" title="Novidades e promoções" sub="Comunicações de marketing">
                  {alternar('marketing', 'Novidades e promoções')}
                </Linha>
              </div>
            </Secao>
          )}

          <Secao titulo="Privacidade">
            <div>
              {/* Compartilhar e duas etapas sem backend: ocultos por flag. */}
              {MOSTRAR_PRIVACIDADE_EXTRAS && (
                <>
                  <Linha icon="share-2" title="Compartilhar com médicos" sub="Permite que profissionais cadastrados acessem seus laudos">
                    {alternar('sharing', 'Compartilhar com médicos')}
                  </Linha>
                  <Linha icon="shield-check" title="Verificação em duas etapas" sub="Exige código por SMS no login">
                    {alternar('twoFA', 'Verificação em duas etapas')}
                  </Linha>
                </>
              )}
              {/* Como hoje: o botão ainda não chama a exclusão (DELETE /pacientes/me). */}
              <Linha icon="trash-2" tone="coral" title="Excluir minha conta" sub="Apaga todos os seus dados após 30 dias">
                <Btn variant="secondary" size="sm">
                  Solicitar
                </Btn>
              </Linha>
            </div>
          </Secao>
        </div>

        <div className="col-span-12 lg:col-span-4 flex flex-col gap-5">
          <Secao titulo="Aparência">
            <div className="grid grid-cols-2 gap-2 mt-1">
              {TEMAS.map((t) => {
                const marcado = dark === t.escuro
                return (
                  <button
                    key={t.rotulo}
                    type="button"
                    onClick={() => onSetDark(t.escuro)}
                    aria-pressed={marcado}
                    className="rounded-[14px] p-2.5 text-left border-2 transition-colors"
                    style={{ borderColor: marcado ? 'var(--lh-action)' : 'var(--lh-line)' }}
                  >
                    <span aria-hidden="true" className="h-12 rounded-[8px] mb-2 p-1.5 flex items-end" style={{ background: t.page }}>
                      <span className="block h-5 w-3/4 rounded-[5px]" style={{ background: t.card }} />
                    </span>
                    <span className="block text-[13px] font-semibold">{t.rotulo}</span>
                  </button>
                )
              })}
            </div>
          </Secao>

          <Secao titulo="Idioma e região">
            <dl className="flex flex-col gap-2 mt-1">
              {REGIAO.map((r) => (
                <div key={r.rotulo} className="flex items-center justify-between gap-3 p-3 rounded-[12px] bg-subtle">
                  <dt className="text-[14px]">{r.rotulo}</dt>
                  <dd className="text-[14px] font-semibold text-right">{r.valor}</dd>
                </div>
              ))}
            </dl>
          </Secao>

          <Secao titulo="Dispositivos conectados">
            <p className="text-[12px] text-muted mb-3">Você está conectado neste aparelho.</p>
            <div className="flex items-center gap-3 p-2.5 rounded-[12px] bg-subtle">
              <span className="h-8 w-8 rounded-[8px] bg-card text-ink inline-flex items-center justify-center shrink-0">
                <Ico name={aparelho.icon} size={16} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold truncate">{aparelho.nome}</div>
                <div className="text-[12px] text-muted">Este aparelho · sessão atual</div>
              </div>
              <Pill tone="brand">Ativo</Pill>
            </div>
          </Secao>
        </div>
      </div>
    </div>
  )
}
