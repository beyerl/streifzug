import { defineConfig } from 'vite';

// Relative base so the same build works both on GitHub Pages (project pages,
// served under /<repo>/) and inside the Capacitor Android WebView (served from
// the filesystem root).
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2019',
  },
});
