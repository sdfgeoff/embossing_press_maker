import reactHooks from 'eslint-plugin-react-hooks'

export default [
  {
    files: ['**/*.{js,jsx}'],
    ignores: ['dist/**'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { document: 'readonly', window: 'readonly', Image: 'readonly', URL: 'readonly', Blob: 'readonly', TextEncoder: 'readonly', ResizeObserver: 'readonly', requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly' },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
]
