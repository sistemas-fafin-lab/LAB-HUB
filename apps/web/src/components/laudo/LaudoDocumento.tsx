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
// seguinte com o mesmo cabeçalho, marcado "(continuação)".

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DocumentoLaudo, EstadoAnalito, GrupoLaudo, LinhaLaudo, SecaoLaudo } from './modelo'

const MM = 96 / 25.4
const ALTURA_FOLHA = 297 * MM
const LARGURA_FOLHA = 210 * MM
const PADDING_FOLHA = 15 * MM
/** `gap` do .flow e padding vertical do .pg-main — ver o CSS no index.html. */
const GAP = 10
const PADDING_MAIN = 16

// ---------------------------------------------------------------------------
// Blocos do fluxo
// ---------------------------------------------------------------------------

type Item =
  | { tipo: 'titulo' }
  | { tipo: 'grupo'; indice: number }
  | { tipo: 'secao'; indice: number }
  | { tipo: 'meta' }
  | { tipo: 'obs' }

/** Um bloco já colocado numa folha. Grupo carrega o intervalo de linhas da fatia. */
type Fatia =
  | { tipo: 'titulo' }
  | { tipo: 'grupo'; indice: number; de: number; ate: number; continuacao: boolean }
  | { tipo: 'secao'; indice: number }
  | { tipo: 'meta' }
  | { tipo: 'obs' }

function itensDo(doc: DocumentoLaudo): Item[] {
  const itens: Item[] = [{ tipo: 'titulo' }]
  doc.grupos.forEach((_, i) => itens.push({ tipo: 'grupo', indice: i }))
  doc.secoes.forEach((_, i) => itens.push({ tipo: 'secao', indice: i }))
  if (doc.material || doc.metodo) itens.push({ tipo: 'meta' })
  if (doc.observacoes) itens.push({ tipo: 'obs' })
  return itens
}

const chaveItem = (item: Item): string =>
  item.tipo === 'grupo' || item.tipo === 'secao' ? `${item.tipo}-${item.indice}` : item.tipo

// ---------------------------------------------------------------------------
// Paginação
// ---------------------------------------------------------------------------

interface Medidas {
  /** Altura de cada bloco atômico, pela chave. */
  blocos: Record<string, number>
  /** Cabeçalho+tabela vazios de cada grupo ("g0"), sem as linhas. */
  molduras: Record<string, number>
  /** Altura de cada linha ("g0:l3"). */
  linhas: Record<string, number>
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

  // Sem layout (jsdom nos testes, ou antes da primeira medição) tudo cai numa
  // folha só: melhor uma página longa que N páginas vazias.
  if (util(0) <= 0) {
    return [
      itens.map((item): Fatia =>
        item.tipo === 'grupo'
          ? { ...item, de: 0, ate: doc.grupos[item.indice]!.linhas.length, continuacao: false }
          : item,
      ),
    ]
  }

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

    if (item.tipo === 'grupo') {
      const grupo = doc.grupos[item.indice]!
      const moldura = m.molduras[`g${item.indice}`] ?? 0
      const alturaLinha = (j: number) => m.linhas[`g${item.indice}:l${j}`] ?? 0

      // A moldura sozinha nunca fecha a folha: só desce quando não cabe nem
      // ela nem a primeira linha, senão o cabeçalho da tabela ficaria órfão.
      if (paginas[atual]!.length > 0 && disponivel() < moldura + alturaLinha(0)) novaFolha()

      let inicio = 0
      let alturaFatia = moldura
      consome(moldura)

      for (let j = 0; j < grupo.linhas.length; j++) {
        const h = alturaLinha(j)
        if (j > 0 && disponivel() < h) {
          paginas[atual]!.push({ tipo: 'grupo', indice: item.indice, de: inicio, ate: j, continuacao: inicio > 0 })
          novaFolha()
          inicio = j
          alturaFatia = moldura
          consome(moldura)
        }
        usado += h
        alturaFatia += h
      }
      paginas[atual]!.push({
        tipo: 'grupo',
        indice: item.indice,
        de: inicio,
        ate: grupo.linhas.length,
        continuacao: inicio > 0,
      })
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
          (proximo.tipo === 'grupo'
            ? (m.molduras[`g${proximo.indice}`] ?? 0) + (m.linhas[`g${proximo.indice}:l0`] ?? 0)
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

// 'alt' (fora da faixa, direção indeterminada) vira 'ind' no CSS: a classe
// `alt` já marca a LINHA como alterada, e repetir a palavra colapsaria as duas.
const classeEstado = (e: EstadoAnalito): string => (e === 'alt' ? 'ind' : e)

function Celulas({ linha }: { linha: LinhaLaudo }) {
  const classe = classeEstado(linha.estado)
  return (
    <>
      <td className="an">{linha.analito}</td>
      <td>
        <span className={`res ${classe}`}>
          {linha.resultado}
          {SETAS[linha.estado] && <span className={`car ${classe}`}>{SETAS[linha.estado]}</span>}
        </span>
        {linha.unidade && <span className="unit">{linha.unidade}</span>}
      </td>
      <td className="ref">{linha.referencia}</td>
    </>
  )
}

function Linha({ linha }: { linha: LinhaLaudo }) {
  return (
    <tr className={linha.estado !== 'ok' ? `alt ${classeEstado(linha.estado)}` : undefined}>
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
            <th className="an">Analito</th>
            <th>Resultado</th>
            <th>Intervalo de referência</th>
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

function Secao({ secao }: { secao: SecaoLaudo }) {
  const corpo = secao.paragrafos.map((p, i) => (
    <p key={i} className={p.forte ? 'forte' : undefined}>
      {p.texto}
    </p>
  ))

  return (
    <div className={`sec${secao.destaque ? ' destaque' : ''}`}>
      {secao.titulo && <div className="cap"><span className="nm">{secao.titulo}</span></div>}
      {corpo}
    </div>
  )
}

function Bloco({ item, doc }: { item: Item; doc: DocumentoLaudo }) {
  switch (item.tipo) {
    case 'titulo':
      // Sem a categoria aqui: ela já é a etiqueta ao lado do nome do paciente
      // ("Laudo · Análises clínicas"), e repetida logo abaixo virava eco.
      return (
        <div className="exam-title">
          <span className="bar" />
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
    case 'secao':
      return <Secao secao={doc.secoes[item.indice]!} />
    case 'grupo':
      return (
        <Grupo
          grupo={doc.grupos[item.indice]!}
          de={0}
          ate={doc.grupos[item.indice]!.linhas.length}
          continuacao={false}
        />
      )
  }
}

function Cabecalho({ doc, primeira }: { doc: DocumentoLaudo; primeira: boolean }) {
  if (!primeira) {
    return (
      <div className="pg-head">
        <div className="run">
          <div className="brand">
            <div className="mark">L</div>
            <span className="name">
              Lab Hub<b>.</b>
            </span>
          </div>
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
        <div className="brand">
          <div className="mark">L</div>
          <div>
            <div className="name">
              Lab Hub<b>.</b>
            </div>
            <div className="desc">Medicina diagnóstica</div>
          </div>
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
                <span className="n">{resumo.total}</span> {resumo.total === 1 ? 'analito' : 'analitos'}
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
                <span className="mk lo">▼</span>Abaixo
              </span>
              <span className="it">
                <span className="mk hi">▲</span>Acima
              </span>
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

    const altura = (seletor: string): number => {
      const el = raiz.querySelector<HTMLElement>(seletor)
      return el ? el.getBoundingClientRect().height : 0
    }

    const blocos: Record<string, number> = {}
    const molduras: Record<string, number> = {}
    const linhas: Record<string, number> = {}

    for (const el of raiz.querySelectorAll<HTMLElement>('[data-bloco]')) {
      blocos[el.dataset.bloco!] = el.getBoundingClientRect().height
    }
    for (const el of raiz.querySelectorAll<HTMLElement>('[data-moldura]')) {
      molduras[el.dataset.moldura!] = el.getBoundingClientRect().height
    }
    for (const el of raiz.querySelectorAll<HTMLElement>('[data-linha]')) {
      linhas[el.dataset.linha!] = el.getBoundingClientRect().height
    }

    const proximas = paginar(doc, {
      blocos,
      molduras,
      linhas,
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
  // saem menores e a última linha de cada página vazaria quando a Inter chega.
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
  // (a impressão ignora a escala — ver o @media print no index.html).
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
    blocos: {}, molduras: {}, linhas: {},
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
        <div className="sheet" style={{ height: 'auto' }}>
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
          <div className="sheet" key={i}>
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
                <th className="an">Analito</th>
                <th>Resultado</th>
                <th>Intervalo de referência</th>
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
                data-linha={`g${indice}:l${j}`}
                className={l.estado !== 'ok' ? `alt ${classeEstado(l.estado)}` : undefined}
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
