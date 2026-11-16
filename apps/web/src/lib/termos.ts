// ---------------------------------------------------------------------------
// Termos de uso e Política de privacidade aceitos no cadastro.
//
// Os documentos ainda não existem. Enquanto as URLs estiverem vazias, o aceite
// fica fora do cadastro mesmo com a flag ligada (lib/flags →
// MOSTRAR_ACEITE_TERMOS): um aceite sem documento para ler não vale. Ao
// publicar os documentos, preencha as URLs, troque TERMOS_VERSAO a cada nova
// versão e ligue a flag. A API grava a versão e a hora do aceite (app_metadata
// do usuário no Auth).
// ---------------------------------------------------------------------------

export const TERMOS_URL = ''
export const PRIVACIDADE_URL = ''
export const TERMOS_VERSAO = ''

export const termosPublicados = () => TERMOS_URL !== '' && PRIVACIDADE_URL !== '' && TERMOS_VERSAO !== ''
