import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { Buffer } from 'node:buffer'

const MAP_DIR = path.resolve(process.cwd(), 'map')
const IMG_RE = /\.(png|jpe?g|webp)$/i

// 개발 서버 전용 — Battle Map Editor가 작업폴더 루트 map/ 의 배경 이미지를
// 나열(/__maps/list) · 제공(/__maps/file/<name>) · 업로드(/__maps/upload)한다.
function battleMapFilesPlugin() {
  const json = (res, code, obj) => {
    res.statusCode = code
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(obj))
  }
  return {
    name: 'battle-map-files',
    apply: 'serve',
    configureServer(server) {
      // 목록
      server.middlewares.use('/__maps/list', (req, res) => {
        let files = []
        try { files = fs.readdirSync(MAP_DIR).filter((f) => IMG_RE.test(f)).sort() } catch { /* 폴더 없음 */ }
        json(res, 200, { files })
      })

      // 이미지 바이트 제공
      server.middlewares.use('/__maps/file', (req, res, next) => {
        try {
          const name = path.basename(decodeURIComponent((req.url || '').split('?')[0].replace(/^\//, '')))
          if (!IMG_RE.test(name)) return next()
          const fp = path.join(MAP_DIR, name)
          if (!fs.existsSync(fp)) { res.statusCode = 404; res.end('not found'); return }
          const ext = path.extname(name).slice(1).toLowerCase()
          res.setHeader('Content-Type', ext === 'jpg' ? 'image/jpeg' : `image/${ext}`)
          res.setHeader('Cache-Control', 'no-cache')
          fs.createReadStream(fp).pipe(res)
        } catch { res.statusCode = 500; res.end('error') }
      })

      // 저장된 그리드 맵(JSON)을 map/ 폴더에 기록(덮어쓰기). X-Filename = "<id>.json".
      server.middlewares.use('/__maps/save-json', (req, res) => {
        if (req.method !== 'POST') { json(res, 405, { ok: false, error: 'POST only' }); return }
        const name = path.basename(decodeURIComponent(req.headers['x-filename'] || ''))
        if (!/\.json$/i.test(name)) { json(res, 400, { ok: false, error: 'json만 가능합니다.' }); return }
        const chunks = []
        req.on('data', (c) => chunks.push(c))
        req.on('end', () => {
          try {
            fs.mkdirSync(MAP_DIR, { recursive: true })
            fs.writeFileSync(path.join(MAP_DIR, name), Buffer.concat(chunks))
            json(res, 200, { ok: true, file: name })
          } catch (e) { json(res, 500, { ok: false, error: String(e) }) }
        })
      })

      // map/ 폴더의 파일 삭제(이미지 또는 json). X-Filename = 파일명.
      server.middlewares.use('/__maps/delete', (req, res) => {
        if (req.method !== 'POST') { json(res, 405, { ok: false, error: 'POST only' }); return }
        const name = path.basename(decodeURIComponent(req.headers['x-filename'] || ''))
        if (!IMG_RE.test(name) && !/\.json$/i.test(name)) { json(res, 400, { ok: false, error: '허용되지 않는 파일' }); return }
        try {
          const fp = path.join(MAP_DIR, name)
          if (fs.existsSync(fp)) fs.unlinkSync(fp)
          json(res, 200, { ok: true })
        } catch (e) { json(res, 500, { ok: false, error: String(e) }) }
      })

      // 파일 이름 변경(카테고리 재분류 시 저장 그리드 json 등). X-From / X-To 헤더.
      server.middlewares.use('/__maps/rename', (req, res) => {
        if (req.method !== 'POST') { json(res, 405, { ok: false, error: 'POST only' }); return }
        const from = path.basename(decodeURIComponent(req.headers['x-from'] || ''))
        const to = path.basename(decodeURIComponent(req.headers['x-to'] || ''))
        const okName = (n) => IMG_RE.test(n) || /\.json$/i.test(n)
        if (!okName(from) || !okName(to)) { json(res, 400, { ok: false, error: '허용되지 않는 파일' }); return }
        try {
          const fp = path.join(MAP_DIR, from)
          if (!fs.existsSync(fp)) { json(res, 404, { ok: false, error: '원본 없음' }); return }
          fs.renameSync(fp, path.join(MAP_DIR, to))
          json(res, 200, { ok: true })
        } catch (e) { json(res, 500, { ok: false, error: String(e) }) }
      })

      // 업로드(=map/ 폴더로 이동). X-Filename 헤더로 원래 파일명을 유지한다.
      server.middlewares.use('/__maps/upload', (req, res) => {
        if (req.method !== 'POST') { json(res, 405, { ok: false, error: 'POST only' }); return }
        let name = path.basename(decodeURIComponent(req.headers['x-filename'] || ''))
        if (!IMG_RE.test(name)) { json(res, 400, { ok: false, error: '이미지 파일만 가능합니다.' }); return }
        const chunks = []
        req.on('data', (c) => chunks.push(c))
        req.on('end', () => {
          try {
            fs.mkdirSync(MAP_DIR, { recursive: true })
            let target = path.join(MAP_DIR, name)
            // 같은 이름이 있으면 _1, _2… 접미사로 충돌 회피
            if (fs.existsSync(target)) {
              const ext = path.extname(name), base = path.basename(name, ext)
              let i = 1
              while (fs.existsSync(path.join(MAP_DIR, `${base}_${i}${ext}`))) i += 1
              name = `${base}_${i}${ext}`
              target = path.join(MAP_DIR, name)
            }
            fs.writeFileSync(target, Buffer.concat(chunks))
            json(res, 200, { ok: true, file: name })
          } catch (e) { json(res, 500, { ok: false, error: String(e) }) }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), battleMapFilesPlugin()],
})
