// ---------------------------------------------------------------------------
// "Bem-vindo de volta" sai uma vez por login, nunca num reload. O login marca
// aqui (em memória: recarregar a página zera); o portal autenticado consome a
// marca assim que o nome do paciente carrega.
// ---------------------------------------------------------------------------

let acabouDeEntrar = false

export function marcarEntrada(): void {
  acabouDeEntrar = true
}

/** true uma única vez depois de `marcarEntrada()`. */
export function consumirEntrada(): boolean {
  const era = acabouDeEntrar
  acabouDeEntrar = false
  return era
}
