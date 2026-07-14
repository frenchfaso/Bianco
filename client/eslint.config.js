import { defineConfig } from 'eslint/config'

export default defineConfig([
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'playwright-report/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        Alpine: 'readonly',
        AbortController: 'readonly',
        CustomEvent: 'readonly',
        FormData: 'readonly',
        Headers: 'readonly',
        Blob: 'readonly',
        Buffer: 'readonly',
        Chart: 'readonly',
        File: 'readonly',
        HTMLCanvasElement: 'readonly',
        Image: 'readonly',
        URL: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        btoa: 'readonly',
        console: 'readonly',
        createImageBitmap: 'readonly',
        crypto: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        indexedDB: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        process: 'readonly',
        window: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }]
    }
  }
])
