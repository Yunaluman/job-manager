import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    strictPort: true,
    cors: false,
    allowedHosts: ['localhost'],
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/*.db*', '**/*.sqlite*', '**/*.key', '**/*.pfx', '**/*.p12', '**/*.credentials.json'],
    },
  },
})
