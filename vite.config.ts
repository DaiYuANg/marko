import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import TurboConsole from 'unplugin-turbo-console/vite'

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true, // fail if port is taken so Tauri doesn't load wrong address
  },
  plugins: [
    react(),
    !process.env.VITEST &&
      TurboConsole({
        /* options here */
      }),
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll('\\', '/')
          if (!normalizedId.includes('node_modules')) return undefined
          if (normalizedId.includes('react-scan')) return 'vendor-react-scan'
          if (normalizedId.includes('reactflow')) return 'vendor-graph'
          if (normalizedId.includes('lucide-react')) return 'vendor-icons'
          if (
            /\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|use-sync-external-store|zustand)\//.test(
              normalizedId,
            )
          ) {
            return 'vendor-react'
          }
          if (normalizedId.includes('monaco-editor') || normalizedId.includes('@monaco-editor')) {
            return 'vendor-monaco'
          }
          if (
            normalizedId.includes('@milkdown') ||
            normalizedId.includes('prosemirror') ||
            normalizedId.includes('@codemirror')
          ) {
            return 'vendor-markdown-editor'
          }
          if (normalizedId.includes('mermaid')) return 'vendor-mermaid'
          if (normalizedId.includes('@radix-ui')) return 'vendor-radix'
          return undefined
        },
      },
    },
  },
})
