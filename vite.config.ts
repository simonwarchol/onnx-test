import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import fs from 'node:fs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
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
