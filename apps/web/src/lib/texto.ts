/**
 * Texto para comparar em busca: sem acento, minúsculo, sem espaço nas pontas.
 * "hemacia" casa "Hemácia", "glicose" casa "Glicose".
 */
export const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
