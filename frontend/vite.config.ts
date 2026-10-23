import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:8000'

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    // Leaflet + Recharts make a ~600 kB route chunk; fine for a locally served app.
    build: { chunkSizeWarningLimit: 800 },
    server: {
      port: 5173,
      strictPort: true,
      // Browser calls /api/* on :5173; Vite forwards them to FastAPI so no CORS setup is needed in dev.
      proxy: { '/api': { target: apiTarget, changeOrigin: true } },
    },
  }
})
