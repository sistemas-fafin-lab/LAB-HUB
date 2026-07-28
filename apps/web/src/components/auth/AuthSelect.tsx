import { useEffect, useRef, useState } from 'react'
import { WIcon } from '../primitives/WIcon'
import { AuthField } from './AuthField'

export interface OpcaoSelect<T extends string> {
  valor: T
  rotulo: string
}

interface AuthSelectProps<T extends string> {
  id: string
  label: string
  icon?: string
  labelVisivel?: boolean
  error?: string | undefined
  valor: T
  opcoes: readonly OpcaoSelect<T>[]
  onChange: (valor: T) => void
}

// ---------------------------------------------------------------------------
// AuthSelect — seletor com a lista de opções desenhada por nós.
//
// Um <select> nativo não serve aqui: o popup das opções é renderizado pelo
// sistema operacional e ignora qualquer CSS, então destoava do resto do
// formulário. Este componente troca o popup por um <ul role="listbox">, ao
// custo de reimplementar o que o nativo dava de graça — teclado (setas, Home,
// End, Enter, Esc), clique fora e os papéis de acessibilidade.
// ---------------------------------------------------------------------------
export function AuthSelect<T extends string>({
  id,
  label,
  icon,
  labelVisivel,
  error,
  valor,
  opcoes,
  onChange,
}: AuthSelectProps<T>) {
  const [aberto, setAberto] = useState(false)
  // Opção sob o cursor do teclado — nem sempre é a selecionada.
  const [ativo, setAtivo] = useState(0)
  const raizRef = useRef<HTMLDivElement>(null)
  const botaoRef = useRef<HTMLButtonElement>(null)
  const listaRef = useRef<HTMLUListElement>(null)

  const selecionadoIdx = Math.max(
    0,
    opcoes.findIndex((o) => o.valor === valor),
  )
  const rotuloAtual = opcoes[selecionadoIdx]?.rotulo ?? ''
  const idLista = `${id}-lista`

  const abrir = () => {
    setAtivo(selecionadoIdx)
    setAberto(true)
  }

  const fechar = (devolverFoco = true) => {
    setAberto(false)
    if (devolverFoco) botaoRef.current?.focus()
  }

  const escolher = (idx: number) => {
    const opcao = opcoes[idx]
    if (opcao) onChange(opcao.valor)
    fechar()
  }

  // Ao abrir, o foco vai para a lista: é ela que recebe as setas e expõe a
  // opção ativa via aria-activedescendant.
  useEffect(() => {
    if (aberto) listaRef.current?.focus()
  }, [aberto])

  // Clique fora fecha sem devolver o foco (o usuário já foi para outro lugar).
  useEffect(() => {
    if (!aberto) return
    const onDown = (e: MouseEvent) => {
      if (!raizRef.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [aberto])

  const teclasDaLista = (e: React.KeyboardEvent) => {
    const ultimo = opcoes.length - 1
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAtivo((i) => (i >= ultimo ? 0 : i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAtivo((i) => (i <= 0 ? ultimo : i - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setAtivo(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setAtivo(ultimo)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      escolher(ativo)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      fechar()
    } else if (e.key === 'Tab') {
      fechar(false)
    }
  }

  const teclasDoBotao = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      abrir()
    }
  }

  return (
    // Aberto, o campo inteiro sobe de camada: sem isso o painel fica atrás dos
    // campos e do botão que vêm depois dele no formulário.
    <div ref={raizRef} className={aberto ? 'relative z-30' : undefined}>
      <AuthField
        id={id}
        label={label}
        {...(icon !== undefined ? { icon } : {})}
        {...(labelVisivel !== undefined ? { labelVisivel } : {})}
        error={error}
        slotDireito={
          <span
            aria-hidden
            className={`absolute right-4 top-1/2 -translate-y-1/2 flex items-center text-slate-400 dark:text-gray-500 pointer-events-none transition-transform duration-200 ${
              aberto ? 'rotate-180' : ''
            }`}
          >
            <WIcon name="chevron-down" className="w-4 h-4" />
          </span>
        }
      >
        {(c) => (
          <>
            <button
              {...c}
              ref={botaoRef}
              type="button"
              role="combobox"
              aria-haspopup="listbox"
              aria-expanded={aberto}
              aria-controls={idLista}
              onClick={() => (aberto ? fechar() : abrir())}
              onKeyDown={teclasDoBotao}
              className={`${c.className} text-left`}
            >
              {rotuloAtual}
            </button>

            {aberto && (
              <ul
                ref={listaRef}
                id={idLista}
                role="listbox"
                tabIndex={-1}
                aria-label={label}
                aria-activedescendant={`${id}-op-${ativo}`}
                onKeyDown={teclasDaLista}
                className="absolute z-30 top-full left-0 right-0 mt-2 p-1 rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl shadow-slate-900/10 dark:shadow-black/40 outline-none"
              >
                {opcoes.map((opcao, i) => {
                  const selecionada = opcao.valor === valor
                  return (
                    <li
                      key={opcao.valor}
                      id={`${id}-op-${i}`}
                      role="option"
                      aria-selected={selecionada}
                      onClick={() => escolher(i)}
                      onMouseEnter={() => setAtivo(i)}
                      className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm cursor-pointer ${
                        i === ativo
                          ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300'
                          : 'text-slate-700 dark:text-gray-200'
                      }`}
                    >
                      {opcao.rotulo}
                      {selecionada && (
                        <span className="flex items-center text-blue-600 dark:text-blue-400">
                          <WIcon name="check" className="w-4 h-4" />
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </AuthField>
    </div>
  )
}
