import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the React app (port 5173) proxies API + WebSocket traffic to Express (port 4000).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/yjs': { target: 'ws://localhost:4000', ws: true },
    },
  },
  build: { chunkSizeWarningLimit: 6000 },
});
