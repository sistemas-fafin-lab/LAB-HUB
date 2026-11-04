// Tema claro/escuro — fonte única da preferência do usuário.
//
// O tema `--lh-*` (styles/lh/tema.css) e as variantes `dark:` do Tailwind
// seguem a classe `dark` do <html>, aplicada daqui.

const CHAVE = 'labhub:tema'

// Liga/desliga a classe que as variantes `dark:` do Tailwind observam.
// O color-scheme cuida do que o CSS não alcança: no escuro, sem ele, o ícone
// do seletor de data e o popup do <select> saem pretos sobre fundo escuro.
export function aplicarTema(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

// localStorage pode estourar (modo privado, storage bloqueado por política):
// nesses casos o app só perde a preferência e abre no claro.
export function lerTema(): boolean {
  try {
    return localStorage.getItem(CHAVE) === 'dark'
  } catch {
    return false
  }
}

export function salvarTema(dark: boolean): void {
  aplicarTema(dark)
  try {
    localStorage.setItem(CHAVE, dark ? 'dark' : 'light')
  } catch {
    // Preferência não persiste, mas o tema da sessão atual já foi aplicado.
  }
}
