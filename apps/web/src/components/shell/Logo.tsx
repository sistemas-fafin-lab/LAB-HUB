/** Wordmark do Lab Hub: preto no claro, branco no escuro. */
export function Logo({ dark, className = '' }: { dark: boolean; className?: string }) {
  return (
    <img
      src={dark ? '/assets/labhub/labhub-wordmark-white.svg' : '/assets/labhub/labhub-wordmark-black.svg'}
      alt="Lab Hub"
      className={'w-auto block ' + className}
    />
  )
}
