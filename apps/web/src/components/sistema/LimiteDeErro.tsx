import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { ConteudoDeSistema, PaginaDeSistema } from './TelaDeSistema'

interface LimiteDeErroProps {
  /**
   * `tela`: o erro troca só o conteúdo da tela, dentro do shell (o menu segue
   * disponível). `pagina`: troca a página inteira — para quando quem falhou
   * foi o próprio shell.
   */
  alcance: 'tela' | 'pagina'
  children: ReactNode
}

interface Estado {
  falhou: boolean
  /** O navegador estava sem internet quando a falha aconteceu. */
  offline: boolean
}

// ---------------------------------------------------------------------------
// Limite de erro de render: no lugar de uma tela branca, a tela de sistema
// "erro" (ou "sem conexão", se o navegador está offline), com "Tentar
// novamente" montando os filhos de novo. Erros de dados não passam por aqui:
// os hooks já os mostram na própria tela (FalhaAoCarregar).
// Quem monta este limite por tela o recria a cada troca de tela (`key`), então
// navegar pelo menu também sai do erro.
// ---------------------------------------------------------------------------
export class LimiteDeErro extends Component<LimiteDeErroProps, Estado> {
  override state: Estado = { falhou: false, offline: false }

  static getDerivedStateFromError(): Estado {
    return { falhou: true, offline: typeof navigator !== 'undefined' && !navigator.onLine }
  }

  override componentDidCatch(erro: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) console.error('[LimiteDeErro]', erro, info.componentStack)
  }

  private tentarDeNovo = () => this.setState({ falhou: false, offline: false })

  override render() {
    if (!this.state.falhou) return this.props.children
    const conteudo = (
      <ConteudoDeSistema
        tipo={this.state.offline ? 'sem-conexao' : 'erro'}
        acao={{ rotulo: 'Tentar novamente', onClick: this.tentarDeNovo }}
      />
    )
    return this.props.alcance === 'pagina' ? <PaginaDeSistema>{conteudo}</PaginaDeSistema> : conteudo
  }
}
