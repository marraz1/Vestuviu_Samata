import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site from /<repo>/
export default defineConfig({
  base: '/Vestuviu_Samata/',
  plugins: [react()],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as never);
