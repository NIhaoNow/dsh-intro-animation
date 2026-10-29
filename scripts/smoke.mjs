#!/usr/bin/env node
/**
 * Smoke test: mount the Host half's route on a plain node:http server and exercise it,
 * so the media pipeline can be verified without starting the whole harness.
 *
 *   node scripts/smoke.mjs
 */
import { createServer } from 'node:http'
import { apply, inject, name } from '../index.js'

/** Minimal Cordis context: capture the route and the index-injection listener. */
const registered = []
const listeners = new Map()
const ctx = {
  effect(factory, label) {
    const dispose = factory()
    registered.push({ label, dispose })
    return dispose
  },
  on(event, listener) {
    listeners.set(event, listener)
    return () => {
      listeners.delete(event)
    }
  },
  webServer: {
    register(route) {
      registered.push({ label: 'route', route })
      return () => {
        registered.pop()
      }
    },
  },
}

if (!inject.includes('webServer')) throw new Error('expected webServer in inject')
apply(ctx)

// ── boot splash rows ──────────────────────────────────────────────────────────
const injectListener = listeners.get('webserver/index-inject')
if (!injectListener) throw new Error('plugin did not subscribe to webserver/index-inject')

const table = []
injectListener(table)
if (table.length !== 2) throw new Error(`expected 2 injection rows, got ${table.length}`)

const [styleRow, scriptRow] = table
if (styleRow.kind !== 'style') throw new Error(`first row must be the style row, got ${styleRow.kind}`)
if (scriptRow.kind !== 'script' || scriptRow.placement !== 'body') {
  throw new Error(`second row must be a body script, got ${scriptRow.kind}/${scriptRow.placement}`)
}
for (const [index, row] of table.entries()) {
  if (typeof row.text !== 'string' || row.text.length === 0) throw new Error(`row ${index} has no text`)
  // An inline script row is embedded literally into the served document: a closing tag
  // inside it would end the script early and leave the rest as body text.
  if (row.text.includes('</script')) throw new Error(`row ${index} contains a closing script tag`)
  if (row.text.includes('</style')) throw new Error(`row ${index} contains a closing style tag`)
}
// The runtime must be syntactically valid ES5-ish script the page can execute inline.
new Function(scriptRow.text) // eslint-disable-line no-new-func
if (!styleRow.text.includes('#dsi-boot')) throw new Error('style row does not style the splash')
if (!scriptRow.text.includes('/dsh-intro-animation/video')) throw new Error('script row does not play the route')
console.log(`index rows ok: style ${styleRow.text.length}ch, script ${scriptRow.text.length}ch`)

const route = registered.find((entry) => entry.route)?.route
if (!route) throw new Error('plugin did not register a route')
if (route.kind !== 'prefix' || route.path !== '/dsh-intro-animation') {
  throw new Error(`unexpected route ${route.kind} ${route.path}`)
}

const server = createServer((req, res) => {
  route.handler(req, res)
})

await new Promise((done) => server.listen(0, '127.0.0.1', done))
const origin = `http://127.0.0.1:${server.address().port}`

async function probe(path, method = 'GET') {
  const res = await fetch(origin + path, { method })
  const type = res.headers.get('content-type') ?? ''
  const length = res.headers.get('content-length')
  let detail = ''
  if (method === 'GET' && type.startsWith('application/json')) {
    const info = await res.json()
    detail = JSON.stringify(info)
  } else if (method === 'GET') {
    const bytes = Buffer.from(await res.arrayBuffer())
    detail = `${bytes.length} bytes, magic ${bytes.subarray(4, 12).toString('latin1')}`
    if (length === null) throw new Error(`missing content-length for ${path}`)
    if (Number(length) !== bytes.length) {
      throw new Error(`content-length ${length} != body ${bytes.length} for ${path}`)
    }
  }
  console.log(`${method} ${path} -> ${res.status} ${type} len=${length} ${detail}`)
  return res.status
}

const results = []
results.push(await probe('/dsh-intro-animation/info'))
results.push(await probe('/dsh-intro-animation/video', 'HEAD'))
results.push(await probe('/dsh-intro-animation/video'))
results.push(await probe('/dsh-intro-animation/poster', 'HEAD'))
results.push(await probe('/dsh-intro-animation/poster'))
results.push(await probe('/dsh-intro-animation/nope'))
results.push(await probe('/dsh-intro-animation/video', 'POST'))

server.close()
const expected = [200, 200, 200, 200, 200, 404, 405]
const ok = expected.every((status, index) => status === results[index])
console.log(ok ? `PASS (${name})` : `FAIL expected ${expected} got ${results}`)
process.exit(ok ? 0 : 1)
