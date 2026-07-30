import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

// Config único do monorepo. Ficou na raiz, e não um por workspace, porque as
// regras que importam aqui (não engolir erro, não deixar `any` passar batido)
// valem igual na API e no web — duplicar seria manter duas cópias divergindo.
//
// Sem `recommendedTypeChecked`: ele exige um program do TypeScript por
// workspace e deixa o lint na casa de dezenas de segundos. O `type-check` do CI
// já roda o compilador de verdade nos três workspaces; o lint aqui cobre o que
// o compilador não vê.
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.expo/**',
      // Protótipo parado, fora do CI e sem type-check passando hoje. Quando o
      // app voltar, é só tirar daqui — as regras já cobrem `.tsx`.
      'apps/mobile/**',
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    rules: {
      // `catch (e) {}` silencioso é como um erro de banco vira 404 mentiroso.
      // O `_` na frente continua sendo a saída explícita para o que é de fato
      // descartável.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // --- API: Node, ESM ------------------------------------------------------
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: {
      globals: globals.node,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
  },

  // --- Web: browser + React ------------------------------------------------
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      // Só as duas clássicas do react-hooks. O preset `recommended` da v7 traz
      // junto o pacote do React Compiler (purity, immutability, use-memo…), que
      // é outra discussão e não cabe entrar de carona num commit de CI.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // --- Scripts de investigação ---------------------------------------------
  // `apps/api/scripts/*` são ferramentas rodadas à mão contra APIs reais
  // (ApLIS, FlowLab), com credenciais que não existem aqui — não dá para
  // testar uma reescrita deles. Valem as regras que pegam defeito; não valem
  // as de estilo, que só produziriam mudança não verificável em código que
  // não roda em produção.
  {
    files: ['apps/api/scripts/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-useless-assignment': 'off',
    },
  },

  // --- Testes --------------------------------------------------------------
  {
    files: ['**/*.test.{ts,tsx}', '**/test/**/*.ts', 'apps/web/src/test-setup.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      // Mock de cliente do Supabase é forma livre; exigir tipagem exata do
      // dublê só produziria `as unknown as` em série, que esconde mais do que
      // mostra.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
