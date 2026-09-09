import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import fs from 'node:fs'
import path from 'node:path'

function localExportPlugin() {
  return {
    name: 'local-export-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const exportsDir = path.resolve(process.cwd(), 'exports')

        if (req.url === '/api/export' && req.method === 'POST') {
          try {
            if (!fs.existsSync(exportsDir)) {
              fs.mkdirSync(exportsDir, { recursive: true })
            }

            let body = ''
            req.on('data', chunk => {
              body += chunk
            })

            req.on('end', () => {
              try {
                const data = JSON.parse(body)
                const now = new Date()
                const pad = n => String(n).padStart(2, '0')
                const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
                const filename = data.filename || `watch-history-backup-${timestamp}.json`
                const safeFilename = path.basename(filename)
                const filePath = path.join(exportsDir, safeFilename)

                const content = JSON.stringify(data.payload || data, null, 2)
                fs.writeFileSync(filePath, content, 'utf8')

                res.statusCode = 200
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({
                  success: true,
                  filename: safeFilename,
                  filePath: `exports/${safeFilename}`,
                  savedAt: new Date().toISOString(),
                  fileSize: Buffer.byteLength(content)
                }))
              } catch (err) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: false, error: err.message }))
              }
            })
          } catch (err) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: err.message }))
          }
          return
        }

        if (req.url === '/api/exports' && req.method === 'GET') {
          try {
            if (!fs.existsSync(exportsDir)) {
              fs.mkdirSync(exportsDir, { recursive: true })
            }
            const files = fs.readdirSync(exportsDir)
              .filter(f => f.endsWith('.json'))
              .map(f => {
                const stat = fs.statSync(path.join(exportsDir, f))
                return {
                  filename: f,
                  size: stat.size,
                  createdAt: stat.birthtime,
                  modifiedAt: stat.mtime
                }
              })
              .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt))

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: true, files }))
          } catch (err) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: err.message }))
          }
          return
        }

        next()
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteSingleFile(),
    localExportPlugin()
  ],
})
