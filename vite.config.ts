import path from 'node:path'
import { defineConfig } from 'vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  // BUILD_ID is stamped at build time. `import.meta.env.BUILD_ID` is replaced
  // verbatim by Vite's `define` with a JSON string — read in the AdminPanel
  // "About" section so "the first thing you ask for when a school reports a
  // problem by phone" is visible without a rebuild of the binary. Defaults to
  // "dev" so local `bun run dev` / `bun test` never see `undefined`.
  define: {
    'import.meta.env.BUILD_ID': JSON.stringify(process.env.BUILD_ID ?? 'dev'),
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
})
