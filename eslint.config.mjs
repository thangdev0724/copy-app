import js from '@eslint/js';
import globals from 'globals';
import svelte from 'eslint-plugin-svelte';

/**
 * Ba môi trường khác nhau trong cùng một repo, mỗi cái một bộ global:
 *   src/main + src/preload  -> Node (nhưng bundle ra CommonJS nên có __dirname)
 *   src/renderer            -> trình duyệt
 *   test + scripts          -> Node thuần
 */
export default [
  { ignores: ['node_modules/**', 'out/**', 'release/**', 'dist/**', 'build/**'] },

  js.configs.recommended,
  ...svelte.configs['flat/recommended'],

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module'
    },
    rules: {
      // Bắt lỗi thật, không bắt bẻ phong cách — phần phong cách để Prettier lo.
      // ignoreRestSiblings cho phép idiom `const { inline, ...meta } = item` để
      // loại một trường ra khỏi payload — store.js list() dùng đúng kiểu đó.
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }
      ],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error'
    }
  },

  {
    files: ['src/main/**/*.js', 'src/preload/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        // electron-vite bundle main/preload ra CommonJS, nên hai biến này có
        // thật lúc chạy dù nguồn viết bằng cú pháp ESM.
        __dirname: 'readonly',
        __filename: 'readonly'
      }
    }
  },

  {
    files: ['src/renderer/**/*.{js,svelte}'],
    languageOptions: { globals: globals.browser }
  },

  {
    files: ['test/**/*.js', 'scripts/**/*.mjs', '*.config.mjs'],
    languageOptions: { globals: globals.node }
  }
];
