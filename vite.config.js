import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  css: {
    modules: {
      localsConvention: 'camelCaseOnly',
    },
  },
  resolve: {
    alias: {
      views: path.join(__dirname, 'src/views'),
    },
  },
});
