import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import boundaries from 'eslint-plugin-boundaries'

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', '.turbo/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node
    },
    plugins: { boundaries },
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
      ]
    }
  }
)