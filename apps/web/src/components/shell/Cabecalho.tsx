import { useCallback, useRef, useState } from 'react'
import { MOSTRAR_DEPENDENTES, MOSTRAR_NOTIFICACOES } from '../../lib/flags'
import { track } from '../../lib/analytics'
import { navegar } from '../../lib/router'
import { CAMINHO_DA_TELA } from '../../lib/rotas'
import { primeiroNome } from '../../lib/paciente'
import type { IconName } from '../../ds'
import { Avatar, Ico, IconBtn, useDismiss } from '../portal'
import type { AvatarTone } from '../portal'
import type { Exam } from '../../lib/exame'
import { Busca } from './Busca'
import { Logo } from './Logo'

interface CabecalhoProps {
  nome: string
  iniciais: string
  dark: boolean
  onToggleDark: () => void
  onOpenExam: (exam: Exam) => void
  onAbrirMenu: () => void
  onLogout: () => void | Promise<void>
}

export function Cabecalho({ nome, iniciais, dark, onToggleDark, onOpenExam, onAbrirMenu, onLogout }: CabecalhoProps) {
  // No celular a busca fica recolhida atrás do botão de lupa.
  const [buscaAberta, setBuscaAberta] = useState(false)
  const fechaBusca = useCallback(() => setBuscaAberta(false), [])
  return (
    <header className="lh-top sticky top-0 z-40 bg-card border-b border-line">
      <div className="relative h-16 px-4 md:px-6 flex items-center gap-3 md:gap-6">
        <span className="lg:hidden">
          <IconBtn icon="menu" label="Abrir menu" onClick={onAbrirMenu} />
        </span>
        <a href={CAMINHO_DA_TELA.home} aria-label="Lab Hub, visão geral" className="shrink-0">
          <Logo dark={dark} className="h-[20px] md:h-[22px]" />
        </a>
        {/* No celular a busca aparece numa faixa abaixo do cabeçalho; a partir
            de 768 px fica sempre na linha. O posicionamento é deste invólucro:
            a própria Busca continua `relative`, âncora da lista de resultados. */}
        <div
          className={
            (buscaAberta ? 'absolute left-0 right-0 top-16 px-4 pb-3 bg-card border-b border-line ' : 'hidden ') +
            'md:static md:block md:flex-1 md:max-w-xl md:p-0 md:border-0 md:bg-transparent'
          }
        >
          <Busca onOpenExam={onOpenExam} onAtalho={() => setBuscaAberta(true)} onConcluir={fechaBusca} />
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <span className="md:hidden">
            <IconBtn
              icon={buscaAberta ? 'x' : 'search'}
              label={buscaAberta ? 'Fechar busca' : 'Abrir busca'}
              onClick={() => setBuscaAberta((v) => !v)}
            />
          </span>
          <IconBtn icon={dark ? 'sun' : 'moon'} label={dark ? 'Usar tema claro' : 'Usar tema escuro'} onClick={onToggleDark} />
          {/* Oculto por flag até haver backend de notificações. */}
          {MOSTRAR_NOTIFICACOES && <MenuNotificacoes />}
          <span className="ml-1">
            <MenuConta nome={nome} iniciais={iniciais} onLogout={onLogout} />
          </span>
        </div>
      </div>
    </header>
  )
}

function MenuNotificacoes() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(open, () => setOpen(false), ref)
  return (
    <div className="relative" ref={ref}>
      <IconBtn icon="bell" label="Notificações" onClick={() => setOpen((o) => !o)} />
      {open && (
        <div className="absolute right-0 top-[48px] w-[360px] max-w-[calc(100vw-24px)] bg-card border border-line rounded-[20px] shadow-float z-50 overflow-hidden">
          <div className="px-4 pt-3 pb-2 text-[15px] font-semibold">Notificações</div>
          {/* Sem backend de notificações: nada a listar. */}
          <p className="text-[13px] text-muted px-4 py-8 text-center border-t border-line">Nenhuma notificação.</p>
        </div>
      )}
    </div>
  )
}

// Mock de dependentes (D2 adiado; ver issue 15) — preservado do seletor antigo,
// exibido apenas quando MOSTRAR_DEPENDENTES estiver ligado. Não há backend.
interface Dependente {
  id: string
  name: string
  relation: string
  initials: string
  tone: AvatarTone
}

const DEPENDENTES: Dependente[] = [
  { id: 'p1', name: 'João Madeiro', relation: 'Você', initials: 'JM', tone: 'brand' },
  { id: 'p2', name: 'Marina Madeiro', relation: 'Esposa', initials: 'MM', tone: 'navy' },
  { id: 'p3', name: 'Tomás Madeiro', relation: 'Filho', initials: 'TM', tone: 'gray' },
]

function MenuConta({ nome, iniciais, onLogout }: { nome: string; iniciais: string; onLogout: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [depSel, setDepSel] = useState<Dependente>(DEPENDENTES[0]!)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(open, () => setOpen(false), ref)

  const exibido = MOSTRAR_DEPENDENTES
    ? { nome: depSel.name.split(' ')[0] ?? '', papel: depSel.relation, iniciais: depSel.initials, tone: depSel.tone }
    : { nome: primeiroNome(nome) || 'Paciente', papel: 'Titular', iniciais: iniciais || '—', tone: 'brand' as const }

  const vai = (para: string) => {
    setOpen(false)
    navegar(para)
  }
  const acoes: [IconName, string, () => void][] = [
    ...(MOSTRAR_DEPENDENTES ? [['user-plus', 'Adicionar dependente', () => setOpen(false)] as [IconName, string, () => void]] : []),
    ['user-round', 'Meu perfil', () => vai(CAMINHO_DA_TELA.profile)],
    ['settings', 'Configurações', () => vai(CAMINHO_DA_TELA.settings)],
    [
      'log-out',
      'Sair',
      () => {
        setOpen(false)
        track('logout')
        void onLogout()
      },
    ],
  ]

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Abrir menu da conta"
        className="lh-row flex items-center gap-2.5 h-11 pl-1 pr-2 rounded-xl"
      >
        <Avatar initials={exibido.iniciais} tone={exibido.tone} size={34} />
        {/* Nome some no celular: o avatar já identifica a conta. */}
        <span className="text-left leading-tight pr-1 hidden sm:block">
          <span className="block text-[13px] font-semibold text-ink">{exibido.nome}</span>
          <span className="block text-[11px] text-muted">{exibido.papel}</span>
        </span>
        <Ico name="chevron-down" size={15} className="text-muted" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Conta"
          className="absolute right-0 top-[52px] w-72 z-50 bg-card border border-line rounded-[20px] shadow-float p-2"
        >
          {MOSTRAR_DEPENDENTES && (
            <>
              <div className="lh-ov px-2 pt-2 pb-2">Perfil ativo</div>
              {DEPENDENTES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={depSel.id === d.id}
                  onClick={() => {
                    setDepSel(d)
                    setOpen(false)
                  }}
                  className={'lh-row w-full flex items-center gap-3 p-2 rounded-[12px] text-left ' + (depSel.id === d.id ? 'bg-subtle' : '')}
                >
                  <Avatar initials={d.initials} tone={d.tone} size={36} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-semibold truncate">{d.name}</span>
                    <span className="block text-[12px] text-muted">{d.relation}</span>
                  </span>
                  {depSel.id === d.id && <Ico name="check" size={16} className="text-link" />}
                </button>
              ))}
            </>
          )}
          <div className={'flex flex-col' + (MOSTRAR_DEPENDENTES ? ' mt-1 pt-1 border-t border-line' : '')}>
            {acoes.map(([icone, rotulo, fn]) => (
              <button
                key={rotulo}
                type="button"
                role="menuitem"
                onClick={fn}
                className="lh-row w-full flex items-center gap-2.5 p-2 rounded-[12px] text-[14px] font-medium text-left"
              >
                <Ico name={icone} size={16} />
                {rotulo}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
