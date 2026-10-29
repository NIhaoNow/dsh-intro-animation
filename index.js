/**
 * dsh-intro-animation — Host half.
 *
 * Serves the opening-animation media over the browser HTTP carrier (`webServer`),
 * so the Client half can play it with a plain <video> element. Plugin bundles have
 * no documented static-asset route, and a 1 MiB base64 data URL inside `client.js`
 * would defeat caching and bloat the module graph — serving bytes from the Host is
 * the supported way to ship media.
 *
 * Resolution order for every asset (user override first, bundled fallback second):
 *   $DSH_HOME/dsh-intro-animation/opening.{mp4,webm,mov,m4v}
 *   <this package>/media/opening.mp4
 *   $DSH_HOME/dsh-intro-animation/poster.{jpg,jpeg,png,webp}
 *   <this package>/media/poster.jpg
 *
 * A drop-in override therefore needs no restart: each request re-resolves the path.
 */
import { createReadStream, existsSync, fstatSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url))
const ROUTE_PREFIX = '/dsh-intro-animation'

/** Content types for the media we are willing to serve. */
const MIME = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

const VIDEO_NAMES = ['opening.mp4', 'opening.webm', 'opening.mov', 'opening.m4v']
const POSTER_NAMES = ['poster.jpg', 'poster.jpeg', 'poster.png', 'poster.webp']

/** `$DSH_HOME`, matching the host's own resolution rule. */
function resolveDshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/** `$DSH_HOME/dsh-intro-animation` — where a user drops their own media. */
export function userMediaRoot() {
  return join(resolveDshHome(), 'dsh-intro-animation')
}

/**
 * First existing candidate, or `undefined`.
 * @param {string[]} names
 * @param {string} root
 * @returns {string | undefined}
 */
function firstExisting(root, names) {
  for (const name of names) {
    const candidate = resolve(join(root, name))
    // Defensive: never serve outside the directory we resolved for.
    if (!candidate.startsWith(root + sep) && candidate !== root) continue
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

/**
 * Resolve the media to serve.
 * @returns {{ file: string, mime: string, source: 'user' | 'bundled' } | undefined}
 */
export function resolveVideo() {
  const user = firstExisting(userMediaRoot(), VIDEO_NAMES)
  if (user) return { file: user, mime: MIME[extname(user).toLowerCase()] ?? 'application/octet-stream', source: 'user' }
  const bundled = firstExisting(join(PACKAGE_ROOT, 'media'), VIDEO_NAMES)
  if (bundled) return { file: bundled, mime: MIME[extname(bundled).toLowerCase()] ?? 'application/octet-stream', source: 'bundled' }
  return undefined
}

/**
 * Resolve the poster image.
 * @returns {{ file: string, mime: string, source: 'user' | 'bundled' } | undefined}
 */
export function resolvePoster() {
  const user = firstExisting(userMediaRoot(), POSTER_NAMES)
  if (user) return { file: user, mime: MIME[extname(user).toLowerCase()] ?? 'application/octet-stream', source: 'user' }
  const bundled = firstExisting(join(PACKAGE_ROOT, 'media'), POSTER_NAMES)
  if (bundled) return { file: bundled, mime: MIME[extname(bundled).toLowerCase()] ?? 'application/octet-stream', source: 'bundled' }
  return undefined
}

/**
 * Stream one file.
 *
 * `content-length` is taken from the file descriptor the stream actually opened
 * (`fstat` on `open`), never from a separate `stat`: if the file is overwritten
 * between the two calls the declared length would exceed the real body, and the
 * response would neither finish nor error (the browser then stalls forever with no
 * `loadeddata` and no `error` event).
 */
function sendFile(res, file, contentType) {
  const stream = createReadStream(file)
  stream.once('open', (fd) => {
    if (res.destroyed || res.writableEnded) {
      stream.destroy()
      return
    }
    let size
    try {
      size = fstatSync(fd).size
    } catch {
      size = undefined
    }
    res.writeHead(200, {
      'content-type': contentType,
      ...(size === undefined ? {} : { 'content-length': size }),
      // Re-validation per load keeps a dropped-in override effective immediately.
      'cache-control': 'no-cache',
    })
    stream.pipe(res)
  })
  stream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('dsh-intro-animation: media not found')
    } else {
      res.destroy()
    }
  })
  res.on('close', () => stream.destroy())
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function sendText(res, status, body, headers) {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    ...headers,
  })
  res.end(body)
}

export const name = 'dsh-intro-animation'
export const inject = ['webServer']

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: (req, res) => {
          const method = req.method ?? 'GET'
          if (method !== 'GET' && method !== 'HEAD') {
            sendText(res, 405, 'dsh-intro-animation: method not allowed', { allow: 'GET, HEAD' })
            return
          }
          const { pathname } = new URL(req.url ?? '/', 'http://localhost')
          const rest = pathname.slice(ROUTE_PREFIX.length) || '/'

          if (rest === '/' || rest === '/info') {
            const video = resolveVideo()
            const poster = resolvePoster()
            sendJson(res, 200, {
              name,
              video: video ? { url: `${ROUTE_PREFIX}/video`, source: video.source, mime: video.mime } : null,
              poster: poster ? { url: `${ROUTE_PREFIX}/poster`, source: poster.source, mime: poster.mime } : null,
            })
            return
          }
          if (rest === '/video' || rest === '/video.mp4') {
            const video = resolveVideo()
            if (!video) {
              sendText(res, 404, `dsh-intro-animation: no opening video in ${userMediaRoot()} or media/`)
              return
            }
            sendFile(res, video.file, video.mime)
            return
          }
          if (rest === '/poster' || rest === '/poster.jpg') {
            const poster = resolvePoster()
            if (!poster) {
              sendText(res, 404, 'dsh-intro-animation: no poster')
              return
            }
            sendFile(res, poster.file, poster.mime)
            return
          }
          sendText(res, 404, 'dsh-intro-animation: unknown route')
        },
      }),
    'dsh-intro-animation: media route',
  )
}
