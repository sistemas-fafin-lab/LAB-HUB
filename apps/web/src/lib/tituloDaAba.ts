import { useEffect } from 'react'
import type { ModoEntrada, Rota } from './rotas'

// ---------------------------------------------------------------------------
// Título da aba do navegador: "{Tela} · Lab Hub". Só o nome da TELA, nunca o
// do exame: o título fica no histórico do navegador, e o nome de um exame é
// dado de saúde.
// ---------------------------------------------------------------------------

const MARCA = 'Lab Hub'

const TITULO_DA_TELA = {
  home: 'Visão geral',
  results: 'Resultados',
  exam: 'Exame',
  laudo: 'Laudo',
  trends: 'Tendências',
  documents: 'Documentos',
  billing: 'Faturamento',
  settings: 'Configurações',
  profile: 'Perfil',
  'nao-encontrada': 'Página não encontrada',
} as const

const TITULO_DA_ENTRADA: Record<ModoEntrada, string> = {
  login: 'Entrar',
  cadastro: 'Criar conta',
  recuperar: 'Recuperar acesso',
  'nova-senha': 'Nova senha',
}

export function tituloDaRota(rota: Rota): string {
  if (rota.tela === 'schedule') {
    if (rota.coletaId !== null) return 'Coleta'
    return rota.aba === 'agendar' ? 'Agendar coleta' : 'Minhas coletas'
  }
  return TITULO_DA_TELA[rota.tela]
}

export const tituloDaEntrada = (modo: ModoEntrada) => TITULO_DA_ENTRADA[modo]

/** Põe "{titulo} · Lab Hub" na aba enquanto a tela está montada. */
export function useTituloDaAba(titulo: string) {
  useEffect(() => {
    document.title = `${titulo} · ${MARCA}`
  }, [titulo])
}
