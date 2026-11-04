// Laudo em folhas A4 paginadas.
//
// Por que paginar em JavaScript em vez de deixar o navegador quebrar: o
// documento repete cabeçalho e rodapé em TODA página e numera "Pág. X de Y" —
// nenhuma das duas coisas o CSS de impressão entrega (`position: running` não
// tem suporte real). Medindo as alturas de verdade também dá a prévia na tela
// idêntica ao que sai na impressora, que é o ponto do formato: o que o paciente
// vê é o papel que ele vai levar ao médico.
//
// O algoritmo é o do desenho de origem: mede cada bloco uma vez numa camada
// escondida com a largura útil da folha, depois distribui os blocos em folhas
// respeitando a altura disponível (que é MENOR na primeira página, onde o
// cabeçalho é completo). Tabela grande quebra por LINHA e reabre na folha
// seguinte com o mesmo cabeçalho, marcado "(continuação)". Seção descritiva
// grande quebra por PARÁGRAFO do mesmo jeito: a folha corta o que transborda,
// então um bloco maior que a folha perderia o final do texto no papel.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Logo } from '../shell/Logo'
import type { DocumentoLaudo, EstadoAnalito, GrupoLaudo, LinhaLaudo, SecaoLaudo } from './modelo'

const MM = 96 / 25.4
const ALTURA_FOLHA = 297 * MM
const LARGURA_FOLHA = 210 * MM
/** `gap` do .flow e padding vertical do .pg-main — ver styles/laudo.css. */
const GAP = 10
const PADDING_MAIN = 16

// ---------------------------------------------------------------------------
// Blocos do fluxo
// ---------------------------------------------------------------------------

type ItemAtomico = { tipo: 'titulo' } | { tipo: 'meta' } | { tipo: 'obs' }

/** Bloco que pode continuar na folha seguinte: tabela por linha, seção por parágrafo. */
type ItemFatiavel = { tipo: 'grupo'; indice: number } | { tipo: 'secao'; indice: number }

type Item = ItemAtomico | ItemFatiavel

/** Um bloco já colocado numa folha. O fatiável carrega o intervalo de partes da fatia. */
type FatiaParcial = ItemFatiavel & { de: number; ate: number; continuacao: boolean }
type Fatia = ItemAtomico | FatiaParcial

const eFatiavel = (item: Item): item is ItemFatiavel => item.tipo === 'grupo' || item.tipo === 'secao'

function itensDo(doc: DocumentoLaudo): Item[] {
  const itens: Item[] = [{ tipo: 'titulo' }]
  doc.grupos.forEach((_, i) => itens.push({ tipo: 'grupo', indice: i }))
  doc.secoes.forEach((_, i) => itens.push({ tipo: 'secao', indice: i }))
  if (doc.material || doc.metodo) itens.push({ tipo: 'meta' })
  if (doc.observacoes) itens.push({ tipo: 'obs' })
  return itens
}

/** Chave da moldura de um fatiável nas medidas ("g0", "s0"). */
const chaveMoldura = (item: ItemFatiavel): string => `${item.tipo === 'grupo' ? 'g' : 's'}${item.indice}`

const totalDePartes = (doc: DocumentoLaudo, item: ItemFatiavel): number =>
  item.tipo === 'grupo' ? doc.grupos[item.indice]!.linhas.length : doc.secoes[item.indice]!.paragrafos.length

/** Chave de uma parte nas medidas: linha de tabela ou parágrafo ("g0:p3", "s0:p3"). */
const chaveParte = (moldura: string, parte: number): string => `${moldura}:p${parte}`

const chaveItem = (item: Item): string => (eFatiavel(item) ? chaveMoldura(item) : item.tipo)

// ---------------------------------------------------------------------------
// Paginação
// ---------------------------------------------------------------------------

interface Medidas {
  /** Altura de cada bloco atômico, pela chave. */
  blocos: Record<string, number>
  /** O que reabre em toda fatia, sem as partes: título + cabeçalho da tabela ("g0") ou da seção ("s0"). */
  molduras: Record<string, number>
  /** Altura de cada parte, por `chaveParte`. */
  partes: Record<string, number>
  cabecalhoPrimeira: number
  cabecalhoSeguinte: number
  rodape: number
}

function paginar(doc: DocumentoLaudo, m: Medidas): Fatia[][] {
  const itens = itensDo(doc)
  const util = (pagina: number) =>
    ALTURA_FOLHA -
    (pagina === 0 ? m.cabecalhoPrimeira : m.cabecalhoSeguinte) -
    m.rodape -
    PADDING_MAIN

  const paginas: Fatia[][] = [[]]
  let atual = 0
  let usado = 0

  const disponivel = () => util(atual) - usado - (paginas[atual]!.length > 0 ? GAP : 0)
  const consome = (altura: number) => {
    if (paginas[atual]!.length > 0) usado += GAP
    usado += altura
  }
  const novaFolha = () => {
    paginas.push([])
    atual += 1
    usado = 0
  }

  for (let i = 0; i < itens.length; i++) {
    const item = itens[i]!

    if (eFatiavel(item)) {
      const chave = chaveMoldura(item)
      const total = totalDePartes(doc, item)
      const moldura = m.molduras[chave] ?? 0
      const alturaParte = (j: number) => m.partes[chaveParte(chave, j)] ?? 0
      const fatia = (de: number, ate: number): Fatia => ({ ...item, de, ate, continuacao: de > 0 })

      // A moldura sozinha nunca fecha a folha: só desce quando não cabe nem
      // ela nem a primeira parte, senão o título ficaria órfão.
      if (paginas[atual]!.length > 0 && disponivel() < moldura + alturaParte(0)) novaFolha()

      let inicio = 0
      consome(moldura)

      for (let j = 0; j < total; j++) {
        const h = alturaParte(j)
        if (j > 0 && disponivel() < h) {
          paginas[atual]!.push(fatia(inicio, j))
          novaFolha()
          inicio = j
          consome(moldura)
        }
        usado += h
      }
      paginas[atual]!.push(fatia(inicio, total))
      continue
    }

    let altura = m.blocos[chaveItem(item)] ?? 0
    // O título do exame não fica órfão no fim da folha: ele desce junto com o
    // primeiro bloco de conteúdo.
    if (item.tipo === 'titulo') {
      const proximo = itens[i + 1]
      if (proximo) {
        altura +=
          GAP +
          (eFatiavel(proximo)
            ? (m.molduras[chaveMoldura(proximo)] ?? 0) + (m.partes[chaveParte(chaveMoldura(proximo), 0)] ?? 0)
            : (m.blocos[chaveItem(proximo)] ?? 0))
      }
    }

    if (paginas[atual]!.length > 0 && disponivel() < altura) novaFolha()
    consome(m.blocos[chaveItem(item)] ?? 0)
    paginas[atual]!.push(item)
  }

  return paginas
}

// ---------------------------------------------------------------------------
// Peças do documento
// ---------------------------------------------------------------------------

const SETAS: Record<EstadoAnalito, string> = { ok: '', lo: '▼', hi: '▲', alt: '•' }

function Celulas({ linha }: { linha: LinhaLaudo }) {
  return (
    <>
      <td className="an">{linha.analito}</td>
      <td>
        <span className="res">
          {linha.resultado}
          {SETAS[linha.estado] && <span className="car">{SETAS[linha.estado]}</span>}
        </span>
        {linha.unidade && <span className="unit">{linha.unidade}</span>}
      </td>
      <td className="ref">{linha.referencia}</td>
    </>
  )
}

function Linha({ linha }: { linha: LinhaLaudo }) {
  return (
    <tr className={linha.estado !== 'ok' ? 'alt' : undefined}>
      <Celulas linha={linha} />
    </tr>
  )
}

function Grupo({
  grupo,
  de,
  ate,
  continuacao,
}: {
  grupo: GrupoLaudo
  de: number
  ate: number
  continuacao: boolean
}) {
  return (
    <div className={`grp${continuacao ? ' cont' : ''}`}>
      {grupo.nome && (
        <div className="cap">
          <span className="nm">{grupo.nome}</span>
        </div>
      )}
      <table className="rt">
        <thead>
          <tr>
            <th className="an">Marcador</th>
            <th>Resultado</th>
            <th>Referência</th>
          </tr>
        </thead>
        <tbody>
          {grupo.linhas.slice(de, ate).map((l, j) => (
            <Linha key={`${l.analito}-${de + j}`} linha={l} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Secao({
  secao,
  de,
  ate,
  continuacao,
}: {
  secao: SecaoLaudo
  de: number
  ate: number
  continuacao: boolean
}) {
  return (
    <div className={`sec${secao.destaque ? ' destaque' : ''}${continuacao ? ' cont' : ''}`}>
      {secao.titulo && <div className="cap"><span className="nm">{secao.titulo}</span></div>}
      {secao.paragrafos.slice(de, ate).map((p, i) => (
        <p key={de + i} className={p.forte ? 'forte' : undefined}>
          {p.texto}
        </p>
      ))}
    </div>
  )
}

function Bloco({ item, doc }: { item: ItemAtomico; doc: DocumentoLaudo }) {
  switch (item.tipo) {
    case 'titulo':
      // Sem a categoria aqui: ela já é a etiqueta ao lado do nome do paciente
      // ("Laudo · Análises clínicas"), e repetida logo abaixo virava eco.
      return (
        <div className="exam-title">
          <h2>{doc.titulo}</h2>
        </div>
      )
    case 'meta':
      return (
        <div className="meta-line">
          {doc.material && (
            <span>
              <b>Material:</b> {doc.material}
            </span>
          )}
          {doc.metodo && (
            <span>
              <b>Método:</b> {doc.metodo}
            </span>
          )}
        </div>
      )
    case 'obs':
      // O parecer do LABORATÓRIO sobre este exame e o aviso padrão do app têm
      // AUTORIAS diferentes e ficam separados: concatenados, "leve ao médico"
      // era lido como parte da conclusão do laboratório.
      return (
        <div className="exnote">
          <div className="k">Observações do laboratório</div>
          <p>{doc.observacoes}</p>
        </div>
      )
  }
}

function Cabecalho({ doc, primeira }: { doc: DocumentoLaudo; primeira: boolean }) {
  if (!primeira) {
    return (
      <div className="pg-head">
        <div className="run">
          <Logo dark={false} className="logo" />
          <div>
            {doc.paciente.nome && <b>{doc.paciente.nome}</b>}
            {doc.numeroLaudo && <> · Laudo nº {doc.numeroLaudo}</>}
            {doc.coleta && <> · coleta {doc.coleta}</>}
          </div>
        </div>
        <div className="hair" />
      </div>
    )
  }

  const { resumo } = doc
  // Campos que a fonte não informou não viram linha: a grade só recebe o que
  // existe, em vez de imprimir '—' em cima de um campo do laudo.
  const campos: Array<[string, string]> = []
  if (doc.paciente.sexo) campos.push(['Sexo', doc.paciente.sexo])
  if (doc.paciente.nascimento) {
    campos.push([
      'Data de nascimento',
      doc.paciente.idade
        ? `${doc.paciente.nascimento} · ${doc.paciente.idade}`
        : doc.paciente.nascimento,
    ])
  }
  if (doc.paciente.cpf) campos.push(['CPF', doc.paciente.cpf])
  if (doc.medico) campos.push(['Médico solicitante', doc.crm ? `${doc.medico} · ${doc.crm}` : doc.medico])
  if (doc.coleta) campos.push(['Coleta', doc.coleta])
  if (doc.liberacao) campos.push(['Liberação', doc.liberacao])
  if (doc.laboratorio) campos.push(['Laboratório executor', doc.laboratorio])
  campos.push(['Data da geração', doc.geracao])

  return (
    <div className="pg-head">
      <div className="brand-row">
        <div>
          <Logo dark={false} className="logo" />
          <div className="desc">Medicina diagnóstica</div>
        </div>
        {doc.numeroLaudo && (
          <div className="c">
            <div className="l">Laudo nº</div>
            <div className="v">{doc.numeroLaudo}</div>
          </div>
        )}
      </div>
      <div className="hair" />

      <div className="patient">
        <div className="top">
          <h1>{doc.paciente.nome ?? doc.titulo}</h1>
          <span className="tag">Laudo · {doc.categoria ?? 'Resultado de exame'}</span>
        </div>
        <div className="meta">
          {campos.map(([k, v]) => (
            <div className="f" key={k}>
              <div className="k">{k}</div>
              <div className="v">{v}</div>
            </div>
          ))}
        </div>

        {/* Contadores só sobre analitos COM faixa de referência: sem faixa, o
            marcador chega como `ok` por construção e entrar em "dentro da
            referência" seria afirmar normalidade que ninguém verificou. */}
        {resumo.comReferencia > 0 && (
          <div className="summ">
            <div className="chips">
              <span className="chip tot">
                <span className="n">{resumo.total}</span> {resumo.total === 1 ? 'marcador' : 'marcadores'}
              </span>
              <span className="chip ok">
                <span className="n">{resumo.dentro}</span> dentro da referência
              </span>
              <span className="chip alt">
                <span className="n">{resumo.alterados}</span>{' '}
                {resumo.alterados === 1 ? 'alterado' : 'alterados'}
              </span>
            </div>
            <div className="legend">
              <span className="it">
                <span className="mk">▼</span>Abaixo
              </span>
              <span className="it">
                <span className="mk">▲</span>Acima
              </span>
              {doc.grupos.some((g) => g.linhas.some((l) => l.estado === 'alt')) && (
                <span className="it">
                  <span className="mk">•</span>Fora da referência
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Rodape({ pagina, total }: { pagina: number; total: number }) {
  return (
    <div className="pg-foot">
      <div className="disc">
        A interpretação deste resultado é ato médico: ele depende da análise conjunta do seu quadro
        clínico e dos demais exames. Leve este laudo ao médico que solicitou o exame.
      </div>
      <div className="pg-num">
        Lab Hub · labhub.com.br<span>
          Pág. <b>{pagina}</b> de <b>{total}</b>
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------

export function LaudoDocumento({ doc }: { doc: DocumentoLaudo }) {
  const medicaoRef = useRef<HTMLDivElement>(null)
  const caixaRef = useRef<HTMLDivElement>(null)
  const [paginas, setPaginas] = useState<Fatia[][] | null>(null)
  const [escala, setEscala] = useState(1)

  const medirEPaginar = useCallback(() => {
    const raiz = medicaoRef.current
    if (!raiz) return
    // Com a camada fora do layout (`display: none` na impressão) tudo mediria
    // zero e o laudo inteiro cairia numa folha só: fica a paginação anterior.
    if (getComputedStyle(raiz).display === 'none') return

    const altura = (seletor: string): number => {
      const el = raiz.querySelector<HTMLElement>(seletor)
      return el ? el.getBoundingClientRect().height : 0
    }

    const blocos: Record<string, number> = {}
    const molduras: Record<string, number> = {}
    const partes: Record<string, number> = {}

    for (const el of raiz.querySelectorAll<HTMLElement>('[data-bloco]')) {
      blocos[el.dataset.bloco!] = el.getBoundingClientRect().height
    }
    for (const el of raiz.querySelectorAll<HTMLElement>('[data-moldura]')) {
      molduras[el.dataset.moldura!] = el.getBoundingClientRect().height
    }
    for (const el of raiz.querySelectorAll<HTMLElement>('[data-parte]')) {
      partes[el.dataset.parte!] = el.getBoundingClientRect().height
    }

    const proximas = paginar(doc, {
      blocos,
      molduras,
      partes,
      cabecalhoPrimeira: altura('[data-medida="head-first"]'),
      cabecalhoSeguinte: altura('[data-medida="head-run"]'),
      rodape: altura('[data-medida="foot"]'),
    })

    setPaginas((anteriores) =>
      anteriores && JSON.stringify(anteriores) === JSON.stringify(proximas) ? anteriores : proximas,
    )
  }, [doc])

  useLayoutEffect(() => {
    medirEPaginar()
  }, [medirEPaginar])

  // A folha é medida com a fonte carregada: com a fonte de fallback as alturas
  // saem menores e a última linha de cada página vazaria quando a DM Sans e a
  // Ranade chegam.
  useEffect(() => {
    let vivo = true
    void document.fonts?.ready.then(() => {
      if (vivo) medirEPaginar()
    })
    const aoImprimir = () => medirEPaginar()
    window.addEventListener('beforeprint', aoImprimir)
    return () => {
      vivo = false
      window.removeEventListener('beforeprint', aoImprimir)
    }
  }, [medirEPaginar])

  // Na tela a folha A4 é maior que a área útil no celular: encolhe para caber
  // (a impressão ignora a escala — ver o @media print em styles/laudo.css).
  useEffect(() => {
    const caixa = caixaRef.current
    if (!caixa) return
    const ajusta = () => {
      const largura = caixa.clientWidth
      setEscala(largura > 0 ? Math.min(1, largura / LARGURA_FOLHA) : 1)
    }
    ajusta()
    // ResizeObserver pega a sidebar recolhendo, que muda a largura sem que a
    // janela mude de tamanho. Onde ele não existe (jsdom), o resize da janela
    // cobre o caso comum.
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', ajusta)
      return () => window.removeEventListener('resize', ajusta)
    }
    const observador = new ResizeObserver(ajusta)
    observador.observe(caixa)
    return () => observador.disconnect()
  }, [])

  const folhas = paginas ?? paginar(doc, {
    blocos: {}, molduras: {}, partes: {},
    cabecalhoPrimeira: 0, cabecalhoSeguinte: 0, rodape: 0,
  })

  return (
    <div ref={caixaRef} className="laudo-caixa">
      {/* Camada de medição: mesma largura útil da folha, fora da tela e fora
          da árvore de acessibilidade. Nunca é impressa. */}
      <div
        ref={medicaoRef}
        className="laudo-folhas laudo-medicao"
        aria-hidden="true"
        style={{ width: LARGURA_FOLHA }}
      >
        <div className="sheet lh-paper" style={{ height: 'auto' }}>
          <div data-medida="head-first">
            <Cabecalho doc={doc} primeira />
          </div>
          <div data-medida="head-run">
            <Cabecalho doc={doc} primeira={false} />
          </div>
          <div className="pg-main">
            <div className="flow" style={{ gap: 0 }}>
              {itensDo(doc).map((item) =>
                item.tipo === 'grupo' ? (
                  <MedeGrupo key={chaveItem(item)} grupo={doc.grupos[item.indice]!} indice={item.indice} />
                ) : item.tipo === 'secao' ? (
                  <MedeSecao key={chaveItem(item)} secao={doc.secoes[item.indice]!} indice={item.indice} />
                ) : (
                  <div key={chaveItem(item)} data-bloco={chaveItem(item)}>
                    <Bloco item={item} doc={doc} />
                  </div>
                ),
              )}
            </div>
          </div>
          <div data-medida="foot">
            <Rodape pagina={1} total={1} />
          </div>
        </div>
      </div>

      {/* `zoom` e não `transform: scale()`: o zoom entra no cálculo de layout,
          então a altura da pilha de folhas encolhe junto e não sobra um vão
          embaixo. A impressão zera o zoom (ver o @media print). */}
      <div className="laudo-folhas" style={{ zoom: escala }}>
        {folhas.map((fatias, i) => (
          <div className="sheet lh-paper" key={i}>
            <Cabecalho doc={doc} primeira={i === 0} />
            <div className="pg-main">
              <div className="flow">
                {fatias.map((fatia, j) =>
                  fatia.tipo === 'grupo' ? (
                    <Grupo
                      key={`${j}-g${fatia.indice}`}
                      grupo={doc.grupos[fatia.indice]!}
                      de={fatia.de}
                      ate={fatia.ate}
                      continuacao={fatia.continuacao}
                    />
                  ) : fatia.tipo === 'secao' ? (
                    <Secao
                      key={`${j}-s${fatia.indice}`}
                      secao={doc.secoes[fatia.indice]!}
                      de={fatia.de}
                      ate={fatia.ate}
                      continuacao={fatia.continuacao}
                    />
                  ) : (
                    <Bloco key={`${j}-${chaveItem(fatia)}`} item={fatia} doc={doc} />
                  ),
                )}
              </div>
            </div>
            <Rodape pagina={i + 1} total={folhas.length} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Só na camada de medição: a moldura da tabela e cada linha, separadamente. */
function MedeGrupo({ grupo, indice }: { grupo: GrupoLaudo; indice: number }) {
  return (
    <div>
      <div data-moldura={`g${indice}`}>
        <div className="grp">
          {grupo.nome && (
            <div className="cap">
              <span className="nm">{grupo.nome}</span>
            </div>
          )}
          <table className="rt">
            <thead>
              <tr>
                <th className="an">Marcador</th>
                <th>Resultado</th>
                <th>Referência</th>
              </tr>
            </thead>
          </table>
        </div>
      </div>
      <div className="grp">
        <table className="rt">
          <tbody>
            {grupo.linhas.map((l, j) => (
              <tr
                key={j}
                data-parte={chaveParte(`g${indice}`, j)}
                className={l.estado !== 'ok' ? 'alt' : undefined}
              >
                <Celulas linha={l} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Só na camada de medição: o título da seção (com a caixa, se houver) e cada parágrafo. */
function MedeSecao({ secao, indice }: { secao: SecaoLaudo; indice: number }) {
  const caixa = `sec${secao.destaque ? ' destaque' : ''}`
  return (
    <div>
      <div data-moldura={`s${indice}`}>
        <div className={caixa}>
          {secao.titulo && <div className="cap"><span className="nm">{secao.titulo}</span></div>}
        </div>
      </div>
      <div className={`${caixa} partes`}>
        {secao.paragrafos.map((p, j) => (
          <p key={j} data-parte={chaveParte(`s${indice}`, j)} className={p.forte ? 'forte' : undefined}>
            {p.texto}
          </p>
        ))}
      </div>
    </div>
  )
}
