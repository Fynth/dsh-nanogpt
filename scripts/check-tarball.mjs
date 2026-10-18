/**
 * Release-artifact check: build the exact npm tarball listing (without writing
 * one) and refuse a package that would ship source, tests, secrets, or an
 * incomplete plugin manifest.
 *
 * Run with `npm run pack:check` after `npm run build` and before installing
 * from a packed artifact.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const failures = []
const fail = (message) => failures.push(message)

/** @param {string} relative */
const read = (relative) => readFileSync(join(root, relative), 'utf8')

const required = [
  'lib/index.js',
  'lib/index.d.ts',
  'client.js',
  'cordis.patch.yml',
  'icon.svg',
  'package.json',
  'locale/en.json',
  'locale/ru.json',
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
  'docs/architecture.md',
  'docs/api-compatibility.md',
  'docs/reasoning-compatibility.md',
  'docs/implementation-plan.md',
  'docs/verification-matrix.md',
  'docs/decisions.md',
  'docs/installation.md',
  'docs/configuration.md',
  'docs/troubleshooting.md',
  'docs/security-review.md',
  'docs/host-review.md',
  'docs/final-review.md',
]

for (const file of required) {
  if (!existsSync(join(root, file))) fail(`missing required artifact file: ${file}`)
}

let listing
try {
  const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const parsed = JSON.parse(output)
  listing = parsed[pkg.name]
  if (listing === undefined) fail('npm pack did not list the package')
} catch (error) {
  fail(`npm pack --dry-run failed: ${error instanceof Error ? error.message : String(error)}`)
}

if (listing !== undefined) {
  const paths = new Set(listing.files.map((file) => file.path))
  const requiredInTarball = required.filter((file) => file !== 'package.json')
  for (const file of requiredInTarball) {
    if (!paths.has(file)) fail(`tarball is missing ${file}`)
  }
  for (const path of paths) {
    if (path.startsWith('src/') || path.startsWith('tests/') || path.startsWith('node_modules/')) {
      fail(`tarball must not include development path ${path}`)
    }
    if (/^\.env|credentials|\.pem$|\.key$|id_rsa/i.test(path)) {
      fail(`tarball must not include credential material: ${path}`)
    }
  }
  for (const entry of ['client.js', 'lib/index.js']) {
    if (!paths.has(entry)) fail(`tarball is missing the runtime entry ${entry}`)
  }
  if (![...paths].some((path) => path.startsWith('docs/'))) fail('tarball ships no documentation')
}

const client = read('client.js')
const clientChecks = [
  ['module loader identity', /id:\s*'dsh-nanogpt'/],
  ['settings section registration', /settings\.section/],
  ['authenticated Host channel', /\/nanogpt/],
]
for (const [label, pattern] of clientChecks) {
  if (!pattern.test(client)) fail(`client.js is missing ${label}`)
}
const forbiddenClientPatterns = [
  ['harness package imports', /@deepseek-ai\//],
  ['React source import', /from\s+['"]react['"]/],
  ['browser secret storage', /localStorage|sessionStorage|document\.cookie/],
  ['unsafe HTML', /dangerouslySetInnerHTML|\.innerHTML\s*=/],
  ['dynamic code execution', /\beval\s*\(|new Function\s*\(/],
  ['embedded API key', /sk-[A-Za-z0-9_-]{12,}/],
]
for (const [label, pattern] of forbiddenClientPatterns) {
  if (pattern.test(client)) fail(`client.js contains forbidden ${label}`)
}

if (typeof pkg.dsh?.bundle?.patch !== 'string') fail('package.json has no dsh.bundle.patch')
if (typeof pkg.dsh?.client?.platform !== 'string') fail('package.json has no dsh.client.platform')
if (typeof pkg.icon !== 'string') fail('package.json has no plugin icon')
for (const file of ['package.json', 'cordis.patch.yml', 'README.md', 'CHANGELOG.md', 'LICENSE']) {
  if (existsSync(join(root, file)) && read(file).includes(String(process.env.NANOGPT_API_KEY ?? '\u0000'))) {
    fail(`refusing to ship ${file}: it contains the configured credential value`)
  }
}

if (failures.length > 0) {
  console.error('pack:check failed:')
  for (const message of failures) console.error(`  - ${message}`)
  process.exit(1)
}

console.log(
  `pack:check OK — ${listing.files.length} files, ${listing.size} bytes compressed, ` +
    `${listing.unpackedSize} bytes unpacked; runtime entries, docs, and secret checks passed`,
)
