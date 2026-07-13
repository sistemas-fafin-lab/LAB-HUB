// Helpers de estilo compartilhados entre as telas (classes Tailwind).

/**
 * Scrollbar fina no padrão do sistema: trilho transparente e "thumb"
 * arredondado em cinza, adaptado ao tema (claro/escuro).
 *
 * Combina as variantes WebKit (`::-webkit-scrollbar`) e a API padrão do
 * Firefox (`scrollbar-width`/`scrollbar-color`). Aplique junto de um
 * container com overflow, ex.: `className={`overflow-x-auto ${scrollSlim(dark)}`}`.
 */
export function scrollSlim(dark: boolean): string {
  return [
    // Firefox
    '[scrollbar-width:thin]',
    dark ? '[scrollbar-color:#374151_transparent]' : '[scrollbar-color:#e2e8f0_transparent]',
    // WebKit / Blink
    '[&::-webkit-scrollbar]:h-1.5',
    '[&::-webkit-scrollbar]:w-1.5',
    '[&::-webkit-scrollbar-track]:bg-transparent',
    '[&::-webkit-scrollbar-thumb]:rounded-full',
    dark
      ? '[&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600'
      : '[&::-webkit-scrollbar-thumb]:bg-slate-200 hover:[&::-webkit-scrollbar-thumb]:bg-slate-300',
  ].join(' ')
}
