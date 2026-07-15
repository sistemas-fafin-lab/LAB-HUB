import type { TipoDocumento } from '@lab-hub/shared'

export type DocTone = 'blue' | 'violet' | 'amber' | 'slate'

export const TONE_CLASSES: Record<DocTone, string> = {
  blue: 'bg-blue-100 text-blue-700',
  violet: 'bg-violet-100 text-violet-700',
  amber: 'bg-amber-100 text-amber-700',
  slate: 'bg-slate-100 text-slate-600',
}

// Apresentação de cada tipo de documento (rótulo, ícone Lucide e tom do card).
export const DOC_META: Record<TipoDocumento, { label: string; icon: string; tone: DocTone }> = {
  identidade: { label: 'Identidade', icon: 'contact', tone: 'blue' },
  carteirinha: { label: 'Carteirinha', icon: 'credit-card', tone: 'violet' },
  pedido_medico: { label: 'Pedido médico', icon: 'clipboard-list', tone: 'amber' },
  outro: { label: 'Outro', icon: 'file-text', tone: 'slate' },
}

// Ordem de exibição nos seletores — a mesma do check-in: identidade, convênio,
// pedido. 'outro' por último, como escape.
export const TIPOS_DOCUMENTO: TipoDocumento[] = [
  'identidade',
  'carteirinha',
  'pedido_medico',
  'outro',
]

// Tipos que fazem sentido anexar a UMA coleta. Identidade e carteirinha são
// perenes: sobem uma vez no perfil e valem para toda coleta.
export const TIPOS_DA_COLETA: TipoDocumento[] = ['pedido_medico', 'outro']

// Rótulo curto do formato, derivado do mime real (o card já diz o tipo).
export function formatarFormato(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF'
  return mimeType.replace('image/', '').toUpperCase()
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

// Espelha o `fileSize` de apps/api/src/routes/documentos.ts (e o file_size_limit
// do bucket). Duplicado de propósito: apps/api resolve @lab-hub/shared como
// .d.ts (só tipos), então uma constante compartilhada type-checaria mas
// explodiria em runtime no `node dist/server.js`. Ao mudar um lado, mude o outro.
export const TAMANHO_MAX_BYTES = 10 * 1024 * 1024

const MIMES_ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

// Barra o arquivo ANTES de subir. Sem isto o paciente espera o upload inteiro
// para receber um 413 — e um arquivo grande o bastante faz a API cortar a
// conexão no meio, o que chega ao fetch como TypeError("Failed to fetch"), sem
// status nenhum. O servidor continua validando: isto aqui é UX, não segurança.
export function validarArquivo(file: File): string | null {
  if (file.size > TAMANHO_MAX_BYTES) {
    const limite = TAMANHO_MAX_BYTES / 1024 / 1024
    // Arredonda p/ CIMA: formatarTamanho usa toFixed(1), então 10 MB + 1 byte
    // vira "10.0 MB" e a frase se contradiz ("10.0 MB, o limite é 10 MB"). Para
    // cima o número nunca empata com o limite e continua verdadeiro — está acima.
    const mb = Math.ceil((file.size / 1024 / 1024) * 10) / 10
    return `Arquivo muito grande (${mb} MB). O limite é ${limite} MB.`
  }
  // Só rejeita quando o browser tem certeza do tipo: file.type vem vazio em
  // alguns arquivos (e no drag-and-drop de certas origens), e quem manda de
  // verdade é o sniff de magic bytes da API.
  if (file.type && !MIMES_ACEITOS.includes(file.type)) {
    return 'Formato não aceito. Envie JPG, PNG, WEBP ou PDF.'
  }
  return null
}
