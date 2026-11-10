import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'dist-*/**', '.scratch/**', 'build-zip/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', 'docs/**', 'vendor/**', 'dist-playgama/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.property.name='open'][callee.object.name='window']", message: 'No external links (CrazyGames requirement).' },
      ],
    },
  },
);
