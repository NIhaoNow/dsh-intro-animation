#!/usr/bin/env node
/**
 * Visual check for the boot splash, without restarting the harness.
 *
 * The Host half ships the animation as two index-injection rows (a `style` row and a
 * `script` row). This script renders those exact two constants — imported from
 * `../splash.js`, never copied — into a throwaway page, and proxies the plugin's own
 * media route from the running harness so the paths in the script stay untouched.
 * What you see is therefore the same CSS and the same runtime the served index would
 * execute, applied in the same order.
 *
 *   node scripts/preview-boot.mjs            # http://127.0.0.1:8778/
 *   PORT=9000 DSH_WEB_ORIGIN=http://127.0.0.1:53926 node scripts/preview-boot.mjs
 */
import { request } from 'node:http'
import { createServer } from 'node:http'

import { SPLASH_CSS, SPLASH_SCRIPT } from '../splash.js'

const PORT = Number(process.env.PORT ?? 8778)
const ORIGIN = new URL(process.env.DSH_WEB_ORIGIN ?? 'http://127.0.0.1:53926')
const MEDIA_PREFIX = '/dsh-intro-animation/'

const PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>dsh-intro-animation · boot splash preview</title>
<style>
html,body{margin:0;height:100%;background:#0a0d14;color:#7f93ad}
#fake-app{display:flex;height:100%;align-items:center;justify-content:center;
font:14px/1.6 system-ui,"Microsoft YaHei",sans-serif;letter-spacing:.04em}
</style>
<style>${SPLASH_CSS}</style>
</head>
<body>
<div id="fake-app">应用界面 — 启动画面应该先盖住这里，再淡出露出它</div>
<script>${SPLASH_SCRIPT}</script>
</body>
</html>`

createServer((req, res) => {
  const url = req.url ?? '/'
  if (url === '/' || url.startsWith('/?')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(PAGE)
    return
  }
  if (url.startsWith(MEDIA_PREFIX)) {
    const upstream = request(
      {
        hostname: ORIGIN.hostname,
        port: ORIGIN.port,
        path: url,
        method: req.method,
        headers: { accept: req.headers.accept ?? '*/*' },
      },
      (reply) => {
        res.writeHead(reply.statusCode ?? 502, reply.headers)
        reply.pipe(res)
      },
    )
    upstream.on('error', (error) => {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(`preview: cannot reach ${ORIGIN.origin} (${error.message})`)
    })
    req.pipe(upstream)
    return
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('preview: not found')
}).listen(PORT, '127.0.0.1', () => {
  console.log(`boot splash preview: http://127.0.0.1:${PORT}/  (media proxied from ${ORIGIN.origin})`)
})
