import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage', 'public'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // 物理モデルは DOM に依存させない（テスト可能性の担保）
    files: ['src/core/physics/**/*.ts', 'src/units/**/model.ts'],
    rules: {
      'no-restricted-globals': ['error', 'document', 'window', 'requestAnimationFrame'],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/ui/**', '@/ui/*'], message: 'model.ts から UI を import しないこと' },
          ],
        },
      ],
    },
  },
);
