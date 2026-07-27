// Seções de um laudo descritivo (citologia/patologia) vindas da API como
// groups cujos panels não têm nome — o valor é o texto corrido da seção.
// Cada seção vira um bloco com título e a CONCLUSÃO sai em caixa de destaque.
//
// As linhas de conteúdo em CAIXA ALTA ("NEGATIVO PARA LESÃO INTRAEPITELIAL…")
// são os achados principais do laudo e saem em negrito — a mesma regra que o
// LaudoTexto aplica ao formato legado em texto plano.

import type { Exam, ExamGroup } from './WebHero'

// Mesma regra do LaudoTexto: linha toda em CAIXA ALTA (sozinha ou seguida de
// dois-pontos) é achado principal. Pontuação final de frase ("HEMORRÁGICO.")
// não casa com nenhuma das duas e fica como texto normal.
const RE_ROTULO = /^[A-ZÀ-Ü][A-ZÀ-Ü0-9 ()/-]{2,}:/
const RE_MAIUSCULA = /^[A-ZÀ-Ü][A-ZÀ-Ü0-9 ()/-]{2,}$/

function linhaForte(linha: string): boolean {
  return RE_ROTULO.test(linha) || RE_MAIUSCULA.test(linha)
}

// Laudo descritivo no formato novo: groups em que todo panel é texto corrido
// (sem nome de marcador). PCR e análises clínicas têm panels nomeados e não
// casam aqui — seguem na tabela de marcadores.
export function isLaudoEmSecoes(exam: Exam): boolean {
  return Boolean(
    exam.groups?.length && exam.groups.every((g) => g.panels.every((p) => p.name === '')),
  )
}

interface LaudoSecoesProps {
  groups: ExamGroup[]
  dark?: boolean
}

export function LaudoSecoes({ groups, dark = false }: LaudoSecoesProps) {
  const titulo = `text-[11px] font-bold uppercase tracking-wider mb-1.5 ${
    dark ? 'text-blue-400' : 'text-blue-600'
  }`
  const forte = `font-semibold ${dark ? 'text-white' : 'text-slate-900'}`

  return (
    <div className={`text-sm leading-relaxed ${dark ? 'text-gray-200' : 'text-slate-700'}`}>
      {groups.map((g, gi) => {
        const isConclusao = /^conclus[ãa]o$/i.test(g.name)
        const corpo = g.panels.map((p, pi) => (
          <div key={pi} className={pi > 0 ? 'mt-1' : ''}>
            {p.value.split('\n').map((linha, li) => (
              <p key={li} className={linhaForte(linha) ? forte : ''}>
                {linha}
              </p>
            ))}
          </div>
        ))

        return (
          <div key={`${g.name}-${gi}`} className={gi > 0 ? 'mt-5' : ''}>
            {g.name && <div className={titulo}>{g.name}</div>}
            {isConclusao ? (
              <div
                className={`rounded-xl border p-4 ${
                  dark ? 'bg-blue-500/10 border-blue-500/20' : 'bg-blue-50 border-blue-100'
                }`}
              >
                {corpo}
              </div>
            ) : (
              corpo
            )}
          </div>
        )
      })}
    </div>
  )
}
