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
      external: (id) => {
        // Externalize all node built-ins
        if (id.startsWith('node:') || [
          'fs', 'path', 'os', 'crypto', 'util', 'stream', 'child_process',
          'zlib', 'url', 'http', 'https', 'net', 'tls', 'events', 'assert',
          'buffer', 'querystring', 'string_decoder', 'timers', 'vm', 'process', 'module'
        ].includes(id)) {
          return true;
        }
        // Bundle fs-extra (we use it extensively)
        if (id === 'fs-extra' || id.startsWith('fs-extra/')) {
          return false;
        }
        // Externalize all other node_modules
        return !id.startsWith('.') && !id.startsWith('/');
      }
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