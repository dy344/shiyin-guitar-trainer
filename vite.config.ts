import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  optimizeDeps: { include: ['fflate', 'mediabunny'] },
  server: { host: '127.0.0.1', port: 5188, strictPort: true, watch: { ignored: ['**/release/**'] } },
  plugins: [react()],
})
