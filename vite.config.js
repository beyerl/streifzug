import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages project pages
// (served under /<repo>/).
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2019',
  },
});
