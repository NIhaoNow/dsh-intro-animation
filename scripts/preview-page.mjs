#!/usr/bin/env node
/**
 * Build a standalone preview page that reproduces the overlay exactly as `client.js`
 * renders it (same CSS text, same class names, same markup), pointed at the live
 * harness route. Used to eyeball the card in a real Chromium without needing the
 * harness page itself (which is token-gated).
 *
 *   node scripts/preview-page.mjs [harnessOrigin] [outFile]
 *
 * The page is a development aid only; it is not shipped in the package.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const origin = process.argv[2] || 'http://127.0.0.1:53926'
const outFile = resolve(process.argv[3] || join(PACKAGE_ROOT, '.preview', 'intro-preview.html'))
const source = readFileSync(join(PACKAGE_ROOT, 'client.js'), 'utf8')

// Pull the CSS array straight out of client.js so the preview cannot drift from it.
const cssMatch = /const CSS = \[([\s\S]*?)\]\.join\(''\)/.exec(source)
if (!cssMatch) throw new Error('could not find the CSS array in client.js')
const fadeMatch = /const FADE_OUT_MS = (\d+)/.exec(source)
if (!fadeMatch) throw new Error('could not find FADE_OUT_MS in client.js')
const FADE_OUT_MS = Number(fadeMatch[1])
const css = new Function('FADE_OUT_MS', `return [${cssMatch[1]}].join('')`)(FADE_OUT_MS)

const html = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>dsh-intro-animation preview</title>
<style>
html,body{margin:0;height:100%;background:#0b0f1a}
body{display:grid;place-items:center;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
/* page-only chrome, NOT part of the plugin */
.note{position:fixed;left:12px;bottom:10px;font:12px/1.4 ui-monospace,monospace;color:#7c8598;pointer-events:none}
${css}
</style>
</head>
<body>
<div class="dsi-root" data-phase="live" role="dialog" aria-modal="true" aria-label="开场动画">
  <div class="dsi-backdrop" aria-hidden="true"></div>
  <div class="dsi-card">
    <video class="dsi-video" src="${origin}/dsh-intro-animation/video" poster="${origin}/dsh-intro-animation/poster"
           autoplay muted playsinline preload="auto" disablepictureinpicture></video>
    <div class="dsi-bar" aria-hidden="true"><i style="transform:scaleX(0)"></i></div>
  </div>
  <button class="dsi-skip" type="button"><span>跳过</span>
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M3.2 3.2l9.6 9.6M12.8 3.2l-9.6 9.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"></path></svg>
  </button>
</div>
<div class="note">preview · overlay CSS+markup copied from client.js · media served by ${origin}</div>
<script>
  const video = document.querySelector('video')
  const bar = document.querySelector('.dsi-bar > i')
  const note = document.querySelector('.note')
  video.addEventListener('playing', () => {
    note.textContent = 'playing ' + video.videoWidth + 'x' + video.videoHeight +
      ' · ' + video.duration.toFixed(2) + 's · overlay from client.js CSS'
  })
  video.addEventListener('timeupdate', () => {
    if (video.duration) bar.style.transform = 'scaleX(' + (video.currentTime / video.duration) + ')'
  })
  video.addEventListener('error', () => {
    note.textContent = 'VIDEO ERROR code=' + (video.error && video.error.code) +
      ' src=' + video.currentSrc
  })
  window.__previewState = () => ({
    readyState: video.readyState,
    duration: video.duration,
    currentTime: video.currentTime,
    paused: video.paused,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    error: video.error && video.error.code,
  })
</script>
</body>
</html>
`

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, html, 'utf8')
console.log(`wrote ${outFile} (css ${css.length} chars, fade ${FADE_OUT_MS}ms)`)
