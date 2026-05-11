import { useState } from 'react'
import { WIcon } from '../components/primitives/WIcon'

interface SettingsPageProps {
  dark: boolean
}

interface Prefs {
  emailResults: boolean
  smsResults:   boolean
  pushResults:  boolean
  marketing:    boolean
  sharing:      boolean
  twoFA:        boolean
}

// ---------------------------------------------------------------------------
// Inline sub-components (Toggle + Row) — kept inline per project convention
// ---------------------------------------------------------------------------

interface ToggleProps {
  on:       boolean
  onChange: () => void
  dark:     boolean
}

function Toggle({ on, onChange, dark }: ToggleProps) {
  return (
    <button
      onClick={onChange}
      className={`relative h-6 w-11 rounded-full transition ${on ? 'bg-blue-600' : dark ? 'bg-gray-700' : 'bg-gray-300'}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 bg-white rounded-full shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`}
      />
    </button>
  )
}

interface RowProps {
  icon:  string
  title: string
  sub:   string
  k:     keyof Prefs
  pref:  Prefs
  setPref: React.Dispatch<React.SetStateAction<Prefs>>
  dark:  boolean
}

function Row({ icon, title, sub, k, pref, setPref, dark }: RowProps) {
  return (
    <div className={`flex items-center gap-3 py-3 ${dark ? 'border-gray-800' : 'border-gray-100'} border-b last:border-b-0`}>
      <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${dark ? 'bg-gray-800 text-gray-300' : 'bg-slate-100 text-slate-600'}`}>
        <WIcon name={icon} className="w-4 h-4" strokeWidth={2.2} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-800'}`}>{title}</div>
        <div className="text-[11px] text-gray-400">{sub}</div>
      </div>
      <Toggle on={pref[k]} onChange={() => setPref((p) => ({ ...p, [k]: !p[k] }))} dark={dark} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// SettingsPage
// ---------------------------------------------------------------------------

const INITIAL_PREFS: Prefs = {
  emailResults: true,
  smsResults:   false,
  pushResults:  true,
  marketing:    false,
  sharing:      true,
  twoFA:        true,
}

export function SettingsPage({ dark }: SettingsPageProps) {
  const [pref, setPref] = useState<Prefs>(INITIAL_PREFS)

  const card = `rounded-2xl border ${dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} p-5 shadow-sm`

  const rowProps = { pref, setPref, dark }

  return (
    <div>
      <div className="mb-5">
        <h1
          className={`text-3xl font-bold ${dark ? 'text-white' : 'text-slate-900'}`}
          style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
        >
          Configurações
        </h1>
        <p className={`text-sm mt-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
          Preferências, notificações, privacidade e segurança da conta.
        </p>
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* Left column */}
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-5">
          {/* Notifications */}
          <div className={card}>
            <h3 className={`text-sm font-semibold mb-2 ${dark ? 'text-white' : 'text-slate-800'}`}>
              Como você quer receber novidades
            </h3>
            <p className="text-xs text-gray-400 mb-2">
              Avisamos quando seu exame fica pronto, quando há documentos novos e lembretes de coleta.
            </p>
            <Row icon="mail"           title="Por e-mail"            sub="joao.madeiro@email.com"        k="emailResults" {...rowProps} />
            <Row icon="message-square" title="Por SMS"               sub="+55 (61) 9 8123-4567"          k="smsResults"   {...rowProps} />
            <Row icon="bell"           title="Notificação push"      sub="No celular e navegador"        k="pushResults"  {...rowProps} />
            <Row icon="megaphone"      title="Novidades e promoções" sub="Comunicações de marketing"     k="marketing"    {...rowProps} />
          </div>

          {/* Privacy */}
          <div className={card}>
            <h3 className={`text-sm font-semibold mb-2 ${dark ? 'text-white' : 'text-slate-800'}`}>Privacidade</h3>
            <Row icon="share-2"     title="Compartilhar com médicos"       sub="Permite que profissionais cadastrados acessem seus laudos" k="sharing" {...rowProps} />
            <Row icon="shield-check" title="Verificação em duas etapas"    sub="Exige código por SMS no login"                             k="twoFA"   {...rowProps} />
            {/* Delete account (no toggle) */}
            <div className="flex items-center gap-3 py-3">
              <div className="h-9 w-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                <WIcon name="trash-2" className="w-4 h-4" strokeWidth={2.2} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-800'}`}>Excluir minha conta</div>
                <div className="text-[11px] text-gray-400">Apaga todos os seus dados após 30 dias</div>
              </div>
              <button className="text-xs font-semibold text-rose-600">Solicitar</button>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-5">
          {/* Appearance */}
          <div className={card}>
            <h3 className={`text-sm font-semibold mb-3 ${dark ? 'text-white' : 'text-slate-800'}`}>Aparência</h3>
            <div className="grid grid-cols-2 gap-2">
              {([{ id: 'light', l: 'Claro', bg: 'bg-white border-gray-200' }, { id: 'dark', l: 'Escuro', bg: 'bg-gray-900 border-gray-700' }] as const).map((o) => (
                <button
                  key={o.id}
                  className={`rounded-xl border-2 p-3 text-left ${
                    dark === (o.id === 'dark')
                      ? 'border-blue-500 ring-2 ring-blue-500/20'
                      : dark ? 'border-gray-800' : 'border-gray-100'
                  }`}
                >
                  <div className={`h-12 rounded-md ${o.bg} border mb-2`} />
                  <div className={`text-xs font-semibold ${dark ? 'text-white' : 'text-slate-800'}`}>{o.l}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Language & region */}
          <div className={card}>
            <h3 className={`text-sm font-semibold mb-3 ${dark ? 'text-white' : 'text-slate-800'}`}>Idioma e região</h3>
            <div className="flex flex-col gap-2">
              {[
                { label: 'Idioma',      value: 'Português · BR'      },
                { label: 'Fuso horário', value: 'America/São_Paulo'  },
                { label: 'Unidades',    value: 'Métrico (mg/dL)'     },
              ].map((item) => (
                <div key={item.label} className={`flex items-center justify-between p-3 rounded-xl ${dark ? 'bg-gray-800/50' : 'bg-slate-50'}`}>
                  <span className={`text-sm ${dark ? 'text-white' : 'text-slate-800'}`}>{item.label}</span>
                  <span className={`text-sm font-semibold ${dark ? 'text-gray-300' : 'text-slate-700'}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Connected devices */}
          <div className={card}>
            <h3 className={`text-sm font-semibold mb-2 ${dark ? 'text-white' : 'text-slate-800'}`}>
              Dispositivos conectados
            </h3>
            <p className="text-xs text-gray-400 mb-3">Você está logado nestes aparelhos.</p>
            <div className="flex flex-col gap-2">
              {[
                { d: 'iPhone 15',    w: 'Asa Sul · agora',    icon: 'smartphone' },
                { d: 'MacBook Pro',  w: 'Asa Sul · 2h atrás', icon: 'monitor'    },
              ].map((s) => (
                <div key={s.d} className={`flex items-center gap-3 p-2.5 rounded-xl ${dark ? 'bg-gray-800/50' : 'bg-slate-50'}`}>
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${dark ? 'bg-gray-800 text-gray-300' : 'bg-white text-slate-600 border border-gray-100'}`}>
                    <WIcon name={s.icon} className="w-4 h-4" strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-800'}`}>{s.d}</div>
                    <div className="text-[11px] text-gray-400">{s.w}</div>
                  </div>
                  <button className="text-[11px] font-semibold text-rose-600">Sair</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
