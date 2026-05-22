import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import fs from 'fs'
import path from 'path'

// Dùng cert tự tạo (có SAN cho IP 192.168.1.180) thay vì basicSsl
// để điện thoại có thể cài cert và truy cập không bị chặn
const certDir = path.resolve(__dirname, 'certs')
const pfxPath = path.join(certDir, 'dev-cert.pfx')
const hasPfx = fs.existsSync(pfxPath)

export default defineConfig({
  plugins: [
    react(),
    !hasPfx && basicSsl()
  ].filter(Boolean),
  server: {
    host: true,
    port: 5173,
    strictPort: false, // cho phép tự động tăng port nếu bị chiếm
    https: hasPfx ? {
      pfx: fs.readFileSync(pfxPath),
      passphrase: 'devpass'
    } : true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})