/** Executa `tarefa` para cada item com no máximo `limite` em andamento. */
export async function emParalelo<T, R>(
  itens: readonly T[],
  limite: number,
  tarefa: (item: T) => Promise<R>,
): Promise<R[]> {
  const resultados = new Array<R>(itens.length)
  let proximo = 0
  const operario = async (): Promise<void> => {
    while (proximo < itens.length) {
      const i = proximo++
      resultados[i] = await tarefa(itens[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, operario))
  return resultados
}
