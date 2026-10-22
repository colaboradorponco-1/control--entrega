import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // El servidor tiene que escuchar en IPv4 (127.0.0.1). Con solo
  // IPv6 el navegador resuelve "localhost" a 127.0.0.1 y dice que
  // rechaza la conexion.
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
