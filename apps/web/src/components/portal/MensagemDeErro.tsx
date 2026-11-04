/** Erro junto do arquivo que o causou: marca coral e texto, anunciado na hora. */
export function MensagemDeErro({ children }: { children: string }) {
  return (
    <p role="alert" className="text-[12px] flex items-start gap-2">
      <span className="lh-bl mt-1" style={{ background: 'var(--lh-coral)' }} />
      {children}
    </p>
  )
}
