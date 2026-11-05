import type { ReactNode } from 'react'
import type { IconName } from '../../ds'
import { Btn, IconTile } from '../portal'
import type { IconTileTone } from '../portal'
import { Logo } from '../shell/Logo'
import { lerTema } from '../../lib/tema'

// ---------------------------------------------------------------------------
// Telas de sistema do portal v2 (404, sem conexão, erro, manutenção), no
// desenho do `SystemScreen` do protótipo. Cada uma tem uma ação de volta.
//
// Textos do design, menos o que prometeria comportamento inexistente: o
// horário de volta e o 0800 da manutenção, os "resultados já abertos neste
// aparelho" do sem conexão (não há cache offline), o "Falar com o suporte" do
// erro (o suporte está atrás de MOSTRAR_CHATBOT, desligado) e o "Ver status"
// (não há página de status).
// ---------------------------------------------------------------------------

export type TipoSistema = 'nao-encontrada' | 'sem-conexao' | 'erro' | 'manutencao'

interface Texto {
  icone: IconName
  tom: IconTileTone
  titulo: string
  texto: string
}

const TEXTO_SISTEMA: Record<TipoSistema, Texto> = {
  'nao-encontrada': {
    icone: 'file-question',
    tom: 'card',
    titulo: 'Página não encontrada',
    texto: 'O endereço pode estar incorreto ou a página mudou de lugar.',
  },
  'sem-conexao': {
    icone: 'wifi-off',
    tom: 'card',
    titulo: 'Você está sem conexão',
    texto: 'Verifique sua internet e tente novamente.',
  },
  erro: {
    icone: 'server-crash',
    tom: 'coral',
    titulo: 'Algo deu errado do nosso lado',
    texto: 'Tente novamente em alguns minutos.',
  },
  manutencao: {
    icone: 'wrench',
    tom: 'card',
    titulo: 'Estamos em manutenção',
    texto: 'O portal volta em breve. Tente novamente em alguns minutos.',
  },
}

/**
 * Ação da tela: um link quando é navegação (o router intercepta o <a>, e dá
 * para abrir em outra aba), um botão quando é "tentar de novo".
 */
export type AcaoSistema = { rotulo: string; href: string } | { rotulo: string; onClick: () => void }

interface ConteudoDeSistemaProps {
  tipo: TipoSistema
  /** Troca o título padrão do tipo (ex.: "Exame não encontrado"). */
  titulo?: string
  texto?: string
  /** Mostra o "404" grande acima do título (só a página inexistente). */
  mostrarCodigo?: boolean
  acao: AcaoSistema
}

/** O bloco central da tela de sistema: ícone, título, texto e a ação. */
export function ConteudoDeSistema({ tipo, titulo, texto, mostrarCodigo = false, acao }: ConteudoDeSistemaProps) {
  const t = TEXTO_SISTEMA[tipo]
  return (
    <div className="w-full max-w-md mx-auto text-center flex flex-col items-center py-10">
      <IconTile name={t.icone} size={64} tone={t.tom} />
      {mostrarCodigo && (
        <div aria-hidden="true" className="font-display font-light text-[64px] leading-none text-brand mt-6 tabular-nums">
          404
        </div>
      )}
      <h1 className="font-display font-medium text-[28px] md:text-[32px] leading-[1.1] tracking-[-0.02em] text-ink mt-6">
        {titulo ?? t.titulo}
        <span className="lh-dot" />
      </h1>
      <p className="text-[15px] text-muted mt-3">{texto ?? t.texto}</p>
      <div className="flex items-center justify-center gap-2 flex-wrap mt-6">
        {'href' in acao ? (
          <a
            href={acao.href}
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-action text-white text-[15px] font-medium transition-colors hover:bg-[var(--lh-action-hover)] hover:text-white hover:no-underline"
          >
            {acao.rotulo}
          </a>
        ) : (
          <Btn icon="rotate-cw" onClick={acao.onClick}>
            {acao.rotulo}
          </Btn>
        )}
      </div>
    </div>
  )
}

/**
 * A tela de sistema ocupando a página inteira, fora do shell: para quando o
 * próprio shell não pode ser montado (erro nele, manutenção). Logo no topo e
 * rodapé, como no protótipo.
 */
export function PaginaDeSistema({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-page text-ink flex flex-col" data-screen-label="Sistema">
      <div className="h-16 px-6 flex items-center">
        <Logo dark={lerTema()} className="h-[22px]" />
      </div>
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full lh-page">{children}</div>
      </main>
      <div className="h-14 px-6 flex items-center text-[12px] text-muted border-t border-line">Lab Hub</div>
    </div>
  )
}
