import { useEffect, useSyncExternalStore } from 'react'
import type { Exam } from './exame'
import { supabase } from './supabase'
import { useResultados } from './useResultados'

// ---------------------------------------------------------------------------
// Exames "novos": liberados que o paciente ainda não abriu. O registro fica
// neste aparelho (localStorage `lh:vistos:{userId}`) e guarda só ids de exame
// vistos, nada do conteúdo. Na primeira vez (sem registro), tudo o que já está
// liberado conta como visto: senão o histórico inteiro apareceria como novo.
// ---------------------------------------------------------------------------

const chave = (usuario: string) => `lh:vistos:${usuario}`

let usuario: string | null = null
let vistos: ReadonlySet<string> | null = null // null = sem registro ainda
const ouvintes = new Set<() => void>()
const notifica = () => {
  for (const avisa of ouvintes) avisa()
}

function ler(u: string): ReadonlySet<string> | null {
  try {
    const bruto = localStorage.getItem(chave(u))
    if (bruto === null) return null
    const ids: unknown = JSON.parse(bruto)
    return Array.isArray(ids) ? new Set(ids.filter((x): x is string => typeof x === 'string')) : null
  } catch {
    return null
  }
}

function gravar(u: string, ids: ReadonlySet<string>) {
  vistos = ids
  try {
    localStorage.setItem(chave(u), JSON.stringify([...ids]))
  } catch {
    // Sem armazenamento (aba anônima, cota): vale só nesta sessão.
  }
  notifica()
}

supabase.auth.onAuthStateChange((_evento, sessao) => {
  const novo = sessao?.user?.id ?? null
  if (novo === usuario) return
  usuario = novo
  vistos = novo === null ? null : ler(novo)
  notifica()
})

/** Marca o exame como visto (o detalhe chama ao abrir). */
export function marcarVisto(exameId: string): void {
  if (usuario === null || vistos?.has(exameId)) return
  gravar(usuario, new Set([...(vistos ?? []), exameId]))
}

const inscreve = (avisa: () => void) => {
  ouvintes.add(avisa)
  return () => {
    ouvintes.delete(avisa)
  }
}

const liberadosDe = (exams: readonly Exam[]) => exams.filter((e) => e.status === 'ready' && !e.retificado)

/** Ids dos exames liberados ainda não vistos. Vazio sem sessão, sem registro ou enquanto a lista carrega. */
export function novosEntre(exams: readonly Exam[], carregando: boolean): ReadonlySet<string> {
  const registro = vistos
  if (usuario === null || carregando || registro === null) return VAZIO
  return new Set(liberadosDe(exams).filter((e) => !registro.has(e.id)).map((e) => e.id))
}

const VAZIO: ReadonlySet<string> = new Set()

/** Exames novos da conta, atualizando quando o paciente abre um. */
export function useExamesNovos(): ReadonlySet<string> {
  const { exams, loading, error } = useResultados()
  const registro = useSyncExternalStore(inscreve, () => vistos)
  // Primeira vez neste aparelho: o que já está liberado conta como visto.
  // Num efeito, e não durante o render, porque gravar avisa os outros leitores.
  useEffect(() => {
    // Com erro a lista veio vazia: registrar agora faria o histórico todo
    // aparecer como novo na próxima carga.
    if (usuario !== null && registro === null && !loading && error === null) {
      gravar(usuario, new Set(liberadosDe(exams).map((e) => e.id)))
    }
  }, [registro, loading, error, exams])
  return novosEntre(exams, loading)
}
