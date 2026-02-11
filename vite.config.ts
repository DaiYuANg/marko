import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import TurboConsole from 'unplugin-turbo-console/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    TurboConsole({
      /* options here */
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
