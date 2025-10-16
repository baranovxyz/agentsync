import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/cli.ts'),
      formats: ['es'],
      fileName: 'cli'
    },
    rollupOptions: {
      external: [
        'fs',
        'path',
        'os',
        'crypto',
        'util',
        'stream',
        'child_process',
        'zlib',
        'url',
        'http',
        'https',
        'net',
        'tls',
        'events',
        'assert',
        'buffer',
        'querystring',
        'string_decoder',
        'timers',
        'vm',
        'process',
        'module',
        /^node:/
      ]
    },
    target: 'node18',
    minify: false,
    sourcemap: true
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
});