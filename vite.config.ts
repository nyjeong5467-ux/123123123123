import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 개발 시 /api/v1 → 백엔드(identity-service). 운영은 게이트웨이 뒤.
// 로컬 백엔드가 없으면 VITE_API_TARGET=https://hanguksafe.kr 로 라이브 API에 붙는다.
const apiTarget = process.env.VITE_API_TARGET || 'http://localhost:3001'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // ngrok 등 외부 터널 도메인에서의 접속 허용(데모 공개용).
    allowedHosts: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
})
