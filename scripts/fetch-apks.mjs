#!/usr/bin/env node
/**
 * Collect the finished Android builds for all four apps and leave a plain
 * .apk for each one in apks/.
 *
 * EAS hands back a .tar.gz rather than a bare .apk because plugins/withAbiSplits.js
 * turns on Gradle's ABI splits: the build emits one APK per architecture plus a
 * universal fallback, and EAS archives the whole set. This pulls out the single
 * APK a 64-bit phone should be given.
 *
 *   node scripts/fetch-apks.mjs            # newest build per app
 *   node scripts/fetch-apks.mjs --wait     # poll until all four are finished
 */
import { execSync, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const APPS = ['client', 'doctor', 'hospital', 'ambulance']
const OUT = path.join(ROOT, 'apks')
const WAIT = process.argv.includes('--wait')
const ARM64_MEMBER = 'build/outputs/apk/release/app-arm64-v8a-release.apk'
const POLL_SECONDS = 180

function eas(app, args) {
  // One command string, run through the shell: Node refuses to spawn the npx.cmd
  // shim directly on Windows, and passing argv alongside shell:true is deprecated.
  // Every argument here is either a literal or an app name from APPS, so there is
  // nothing user-supplied to escape.
  return execSync(['npx', 'eas-cli', ...args].join(' '), {
    cwd: path.join(ROOT, 'apps', app),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
}

function latestBuild(app) {
  const raw = eas(app, ['build:list', '--platform', 'android', '--limit', '1', '--json', '--non-interactive'])
  const start = raw.indexOf('[')
  const rows = JSON.parse(raw.slice(start))
  return rows[0] ?? null
}

/**
 * Streamed with curl rather than fetch(): these artifacts run to hundreds of
 * megabytes, and buffering one through arrayBuffer() holds the whole thing in
 * memory before a single byte reaches disk.
 */
function download(url, dest) {
  execFileSync('curl', ['-sSL', '--fail', '--max-time', '1800', '-o', dest, url],
    { stdio: ['ignore', 'ignore', 'inherit'] })
  return fs.statSync(dest).size
}

/** Pick the APK a 64-bit phone wants: the arm64 split, else the universal one. */
function pickApk(names) {
  const apks = names.filter(n => n.toLowerCase().endsWith('.apk'))
  return apks.find(n => /arm64-v8a/i.test(n))
    ?? apks.find(n => /universal/i.test(n))
    ?? apks[0]
    ?? null
}

/**
 * --force-local because tar otherwise reads the `C:` in a Windows path as a
 * remote host and fails with "Cannot connect to C: resolve failed".
 *
 * Only the arm64 member is unpacked. The archive holds five APKs and expands to
 * about 550MB, and four apps' worth of that is 2GB written to disk to keep 300MB.
 */
function extract(tarPath, workDir, member) {
  fs.mkdirSync(workDir, { recursive: true })
  const args = ['--force-local', '-xzf', tarPath, '-C', workDir]
  if (member) args.push('--strip-components=4', member)
  execFileSync('tar', args, { stdio: ['ignore', 'pipe', 'inherit'] })
  const found = []
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else found.push(p)
    }
  }
  walk(workDir)
  return found
}

const mb = n => (n / 1024 / 1024).toFixed(1) + ' MB'

async function once() {
  fs.mkdirSync(OUT, { recursive: true })
  const summary = []
  let pending = 0
  let failed = 0

  for (const app of APPS) {
    let b
    try { b = latestBuild(app) } catch (e) { summary.push([app, 'ERROR', String(e.message).slice(0, 80)]); failed++; continue }
    if (!b) { summary.push([app, 'none', 'no build found']); failed++; continue }
    if (b.status !== 'FINISHED' && b.status !== 'finished') {
      summary.push([app, b.status, b.id])
      pending++
      continue
    }
    const url = b.artifacts?.applicationArchiveUrl ?? b.artifacts?.buildUrl
    if (!url) { summary.push([app, 'FINISHED', 'but no artifact url']); continue }

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'queue-apk-'))
    try {
      if (/\.apk$/i.test(url)) {
        const dest = path.join(OUT, `queue-${app}-arm64.apk`)
        const size = download(url, dest)
        summary.push([app, 'FINISHED', path.basename(dest) + '  ' + mb(size)])
        continue
      }
      const tarPath = path.join(tmp, 'build.tar.gz')
      const size = download(url, tarPath)
      // Try the one member first; fall back to unpacking everything if this
      // build laid its outputs out differently.
      let files = []
      try { files = extract(tarPath, path.join(tmp, 'x'), ARM64_MEMBER) } catch { files = [] }
      if (!files.some(f => f.toLowerCase().endsWith('.apk'))) {
        files = extract(tarPath, path.join(tmp, 'x'))
      }
      const chosen = pickApk(files.map(f => path.relative(path.join(tmp, 'x'), f)))
      if (!chosen) { summary.push([app, 'FINISHED', 'archive held no .apk (' + mb(size) + ')']); continue }
      const src = path.join(tmp, 'x', chosen)
      const dest = path.join(OUT, `queue-${app}-arm64.apk`)
      fs.copyFileSync(src, dest)
      summary.push([app, 'FINISHED', path.basename(dest) + '  ' + mb(fs.statSync(dest).size) + '  (from ' + path.basename(chosen) + ')'])
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  }

  console.log('\n' + new Date().toLocaleTimeString() + '   apks/ -> ' + OUT)
  for (const [app, status, note] of summary) console.log('  ' + app.padEnd(10) + String(status).padEnd(12) + note)
  return { pending, failed }
}

let { pending, failed } = await once()
while (WAIT && pending > 0) {
  console.log('\n' + pending + ' build(s) still running; checking again in ' + POLL_SECONDS + 's')
  await new Promise(r => setTimeout(r, POLL_SECONDS * 1000))
  ;({ pending, failed } = await once())
}
if (pending === 0 && failed === 0) console.log('\nEvery app collected.')
else if (pending) console.log('\n' + pending + ' build(s) still running — run again later, or with --wait.')
if (failed) { console.log(failed + ' app(s) could not be collected.'); process.exitCode = 1 }
