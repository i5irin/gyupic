module.exports = {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  overrides: [
    // Add trailing comma to all lines in JSON5 json files.
    {
      files: [
        '**/devcontainer.json',
        '**/.vscode/*.json',
        '**/tsconfig.json',
        '**/tsconfig.*.json',
      ],
      options: {
        parser: 'json5',
        quoteProps: 'preserve',
        singleQuote: false,
        trailingComma: 'all',
      },
    },
  ],
};
