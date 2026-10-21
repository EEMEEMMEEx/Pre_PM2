import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const proxyErrorHandler = (proxy) => {
  proxy.on('error', (err, req, res) => {
    if (!res.headersSent) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'backend_unavailable',
          message: 'Backend server is not running on port 8765. Please start python database.py.',
        })
      );
    }
  });
};

// GitHub Pages เสิร์ฟโปรเจกต์ใต้ subpath /<repo>/ — override ด้วย PAGES_BASE_PATH
// ค่า default คือ '/' เพื่อไม่กระทบ deploy เดิมบน Cloudflare R2 (root domain)
const basePath = process.env.PAGES_BASE_PATH || '/';

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true,
        configure: proxyErrorHandler,
      },
      // When navigating to /login in browser, bypass proxy to let Vite serve index.html (SPA).
      // Only proxy POST requests (legacy API calls) to the backend.
      '/login': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true,
        bypass: (req) => {
          if (req.method === 'GET' && (req.headers.accept?.includes('text/html') || !req.headers.accept)) {
            return '/index.html';
          }
        },
        configure: proxyErrorHandler,
      },
      '/database': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true,
        configure: proxyErrorHandler,
      },
      '/save': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true,
        configure: proxyErrorHandler,
      },
      '/photos': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true,
        configure: proxyErrorHandler,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
