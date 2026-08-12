import { defineConfig } from 'eslint/config'

export default defineConfig([
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'playwright-report/**', '**/._*'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        Alpine: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        CustomEvent: 'readonly',
        DOMException: 'readonly',
        FormData: 'readonly',
        Headers: 'readonly',
        Blob: 'readonly',
        Buffer: 'readonly',
        Chart: 'readonly',
        File: 'readonly',
        HTMLCanvasElement: 'readonly',
        Image: 'readonly',
        ImageData: 'readonly',
        URL: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        Worker: 'readonly',
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
        self: 'readonly',
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
