import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import boundaries from 'eslint-plugin-boundaries'
import stylistic from '@stylistic/eslint-plugin'

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.turbo/**',
      '.next/**',
      '**/src/generated/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node
    },
    plugins: { boundaries, '@stylistic': stylistic },
    settings: {
      'boundaries/elements': [
        { type: 'app', pattern: 'apps/*' },
        { type: 'module', pattern: 'packages/modules/*' },
        { type: 'ui', pattern: 'packages/ui' },
        { type: 'ui-mobile', pattern: 'packages/ui-mobile' },
        { type: 'api-client', pattern: 'packages/api-client' },
        { type: 'contracts', pattern: 'packages/contracts' },
        { type: 'config', pattern: 'packages/config/*' }
      ]
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: ['app'], allow: ['app', 'module', 'ui', 'ui-mobile', 'api-client', 'contracts', 'config'] },
            { from: ['module'], allow: ['contracts', 'config'] },
            { from: ['ui', 'ui-mobile', 'api-client', 'contracts'], allow: ['config'] },
            { from: ['config'], allow: [] }
          ]
        }
      ],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/semi': ['error', 'never'],
      '@stylistic/indent': ['error', 2],
      '@stylistic/comma-dangle': ['error', 'never'],
      '@stylistic/arrow-parens': ['error', 'always'],
      '@stylistic/quote-props': ['error', 'as-needed'],
      '@stylistic/object-curly-spacing': ['error', 'always'],
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/eol-last': ['error', 'always'],
      'max-len': ['warn', { code: 100, ignoreUrls: true, ignoreStrings: true, ignoreTemplateLiterals: true }]
    }
  }
)
