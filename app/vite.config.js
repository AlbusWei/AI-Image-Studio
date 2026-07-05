import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import apiProxyPlugin from './src/server/api-proxy.js'

export default defineConfig({
  base: './',
  plugins: [react(), apiProxyPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/db': {
        target: 'http://127.0.0.1:19527',
        changeOrigin: true,
      },
    },
  }
})
