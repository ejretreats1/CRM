import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  build: {
    rollupOptions: {
      // /cleaner gets its own HTML shell (no CRM manifest, dark background) but
      // shares the same lazy-loaded chunks as the main app.
      input: { main: 'index.html', cleaner: 'cleaner.html' },
    },
  },
})
