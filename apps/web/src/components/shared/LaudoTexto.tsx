// Renderiza o texto de um laudo descritivo (citologia/patologia) reconstruindo
// a estrutura que o HTML original do LIS trazia em <b> e o stripHtml removeu.
//
// As linhas em CAIXA ALTA são a chave:
//  - curtas ("MACROSCOPIA:", "TIPO DE AMOSTRA: …", "CONCLUSÃO") → título de
//    SEÇÃO, no mesmo estilo dos cabeçalhos de grupo de marcadores do app;
//  - longas ("NEGATIVO PARA LESÃO INTRAEPITELIAL…") → achado principal do
//    laudo, em negrito dentro da seção;
//  - com pontuação final ("HEMORRÁGICO.") → texto corrido normal.
// A seção CONCLUSÃO — o que o paciente procura — sai numa caixa de destaque.

const RE_ROTULO = /^([A-ZÀ-Ü][A-ZÀ-Ü0-9 ()/-]{2,}):\s*(.*)$/
const RE_TITULO = /^[A-ZÀ-Ü][A-ZÀ-Ü0-9 ()/-]{2,}$/
// Acima disso a linha em caps não é título de seção, é conteúdo enfático.
const MAX_TITULO = 40

interface Secao {
  titulo: string | null
  destaque: boolean // CONCLUSÃO — caixa realçada
  linhas: Array<{ texto: string; forte: boolean }>
}

function parseSecoes(texto: string): Secao[] {
  const secoes: Secao[] = []
  let atual: Secao = { titulo: null, destaque: false, linhas: [] }

  const abre = (titulo: string) => {
    if (atual.titulo !== null || atual.linhas.length > 0) secoes.push(atual)
    atual = { titulo, destaque: /^conclus[ãa]o$/i.test(titulo), linhas: [] }
  }

  for (const bruta of texto.split('\n')) {
    const l = bruta.trim()
    if (!l) continue

    const rotulo = RE_ROTULO.exec(l)
    if (rotulo && rotulo[1]!.length <= MAX_TITULO) {
      abre(rotulo[1]!)
      if (rotulo[2]) atual.linhas.push({ texto: rotulo[2], forte: false })
      continue
    }
    if (RE_TITULO.test(l) && l.length <= MAX_TITULO) {
      abre(l)
      continue
    }
    atual.linhas.push({ texto: l, forte: rotulo !== null || RE_TITULO.test(l) })
  }
  if (atual.titulo !== null || atual.linhas.length > 0) secoes.push(atual)
  return secoes
}

const COR_DO_TITULO = { color: 'var(--lh-link)' }

export function LaudoTexto({ texto }: { texto: string }) {
  const secoes = parseSecoes(texto)

  return (
    <div className="text-[14px] leading-relaxed">
      {secoes.map((s, i) => {
        const corpo = s.linhas.map((l, li) => (
          <p key={li} className={l.forte ? 'font-semibold' : ''}>
            {l.texto}
          </p>
        ))

        if (s.destaque) {
          return (
            <div key={i} className="mt-5 rounded-[14px] p-4 bg-subtle">
              <div className="lh-ov mb-1.5" style={COR_DO_TITULO}>
                {s.titulo}
              </div>
              {corpo}
            </div>
          )
        }
        return (
          <div key={i} className={i > 0 ? 'mt-4' : ''}>
            {s.titulo && (
              <div className="lh-ov mb-1" style={COR_DO_TITULO}>
                {s.titulo}
              </div>
            )}
            {corpo}
          </div>
        )
      })}
    </div>
  )
}
