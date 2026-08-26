import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        xfwd: true,
        // تضمین ارسال IP واقعی کلاینت به سرور
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const ip = req.socket?.remoteAddress || ''
            if (ip && !proxyReq.getHeader('x-forwarded-for')) {
              proxyReq.setHeader('X-Forwarded-For', ip)
            }
          })
        }
      }
    }
  }
})
