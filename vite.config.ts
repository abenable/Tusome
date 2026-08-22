import path from 'node:path'
import fs from 'node:fs'
import { defineConfig } from 'vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Dev-only: serve the bundled PhET sim HTML files at a same-origin URL so the
// <iframe> in <PhETSim> can load them under `bun run dev` / `bun tauri dev`,
// without needing the Tauri asset protocol (whose scope is awkward for the
// repo-root content tree). In a built app the asset protocol serves them.
const PHET_DIR = path.resolve(import.meta.dirname, './content/sims')
const servePhetSims = () => ({
  name: 'cbclab-phet-sims',
  configureServer(server: any) {
    server.middlewares.use((req: any, res: any, next: any) => {
      const url = (req.url ?? '') as string
      const m = url.match(/^\/__sim\/([^?]+)$/)
      if (!m) return next()
      const file = path.basename(decodeURIComponent(m[1]))
      const abs = path.join(PHET_DIR, file)
      if (!abs.startsWith(PHET_DIR) || !fs.existsSync(abs)) {
        res.statusCode = 404
        res.end('not found')
        return
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      fs.createReadStream(abs).pipe(res)
    })
  },
})

export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    servePhetSims(),
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
