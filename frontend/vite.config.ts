import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// The Go server owns /api and /ws. Proxying them in development keeps the
// browser on one origin, matching how the app is served in production.
const serverUrl = process.env.CHALKLINE_SERVER_URL ?? 'http://localhost:8080'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': serverUrl,
      '/ws': { target: serverUrl, ws: true },
    },
  },
})
