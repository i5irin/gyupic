import { defineConfig } from 'vite';
import sassDts from 'vite-plugin-sass-dts';
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
  plugins: [
    sassDts({
      enabledMode: ['development', 'production'],
      sourceDir: path.resolve(__dirname, 'src'),
      outputDir: path.resolve(__dirname, 'dist'),
    }),
  ],
});
