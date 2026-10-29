#!/usr/bin/env node
/**
 * Smoke test: mount the Host half's route on a plain node:http server and exercise it,
 * so the media pipeline can be verified without starting the whole harness.
 *
 *   node scripts/smoke.mjs
 */
import { createServer } from 'node:http'
import { apply, inject, name } from '../index.js'

/** Minimal Cordis context: capture the route the plugin registers. */
const registered = []
const ctx = {
  effect(factory, label) {
    const dispose = factory()
    registered.push({ label, dispose })
    return dispose
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
