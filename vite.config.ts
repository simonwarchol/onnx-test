import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import fs from 'node:fs'

const IMAGE_EXTENSIONS = ['.tif', '.tiff', '.png', '.jpg', '.jpeg', '.webp', '.gif']

function getAssetImageList(): string[] {
  const dir = path.join(process.cwd(), 'public', 'assets')
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => IMAGE_EXTENSIONS.some((ext) => f.toLowerCase().endsWith(ext)))
    .sort()
    .map((f) => `/assets/${f}`)
}

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages uses /repo-name/ as base; local dev uses /
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [
    react(),
    {
      name: 'asset-list',
      resolveId(id) {
        if (id === 'virtual:asset-list') return '\0virtual:asset-list'
        return null
      },
      load(id) {
        if (id !== '\0virtual:asset-list') return null
        const list = getAssetImageList()
        const base = (process.env.VITE_BASE_PATH || '').replace(/\/$/, '')
        const withBase = base ? list.map((p) => base + p) : list
        return `export default ${JSON.stringify(withBase)}`
      },
    },
    {
      name: 'wasm-mime',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/wasm/') && req.url.endsWith('.wasm')) {
            const filePath = path.join(process.cwd(), 'public', req.url)
            if (fs.existsSync(filePath)) {
              res.setHeader('Content-Type', 'application/wasm')
              fs.createReadStream(filePath).pipe(res)
              return
            }
          }
          next()
        })
      },
    },
  ],
  server: {
    fs: {
      allow: ['.', 'node_modules'],
    },
  },
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
})
