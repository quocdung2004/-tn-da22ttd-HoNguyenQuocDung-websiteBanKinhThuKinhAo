import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl' // GIỮ NGUYÊN DÒNG NÀY

export default defineConfig({
  plugins: [
    react(),
    basicSsl() // TUYỆT ĐỐI PHẢI GIỮ ĐỂ ĐIỆN THOẠI CHO BẬT CAMERA
  ],
  server: {
    host: true, // Cho phép truy cập qua IP LAN
    proxy: {
      '/api': {
        target: 'http://localhost:3001', // Cổng Backend của bạn
        changeOrigin: true,
        secure: false, // Dòng này cực kỳ quan trọng: Cho phép HTTPS (Frontend) gọi HTTP (Backend) mà không bị lỗi SSL
      }
    }
  }
})