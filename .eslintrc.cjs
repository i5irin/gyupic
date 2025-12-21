module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.eslint.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  settings: {
    react: { version: 'detect' },
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: ['airbnb', 'airbnb/hooks', 'airbnb-typescript', 'prettier'],
  root: true,
  env: {
    browser: true,
    es2021: true,
    jest: true,
  },
  ignorePatterns: [
    'dist/**/*',
    'node_modules/**/*',
    '!.stylelintrc.cjs',
    '!.prettierrc.cjs',
  ],
  rules: {
    '@typescript-eslint/member-ordering': 'error',
  },
  overrides: [
    {
      files: ['**/vite.config.js'],
      rules: {
        'import/no-extraneous-dependencies': [
          'error',
          {
            devDependencies: ['**/vite.config.js'],
          },
        ],
      },
    },
  ],
};
