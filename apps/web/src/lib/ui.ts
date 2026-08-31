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
    dark ? '[scrollbar-color:#6b7280_#111827]' : '[scrollbar-color:#94a3b8_#f1f5f9]',
    // WebKit / Blink
    '[&::-webkit-scrollbar]:h-2',
    '[&::-webkit-scrollbar]:w-2',
    '[&::-webkit-scrollbar-track]:rounded-full',
    dark ? '[&::-webkit-scrollbar-track]:bg-gray-900' : '[&::-webkit-scrollbar-track]:bg-slate-100',
    '[&::-webkit-scrollbar-thumb]:rounded-full',
    dark
      ? '[&::-webkit-scrollbar-thumb]:bg-gray-600 hover:[&::-webkit-scrollbar-thumb]:bg-gray-500'
      : '[&::-webkit-scrollbar-thumb]:bg-slate-400 hover:[&::-webkit-scrollbar-thumb]:bg-slate-500',
  ].join(' ')
}
