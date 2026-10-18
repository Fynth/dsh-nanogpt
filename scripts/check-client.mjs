/**
 * Static checks for the plain-JavaScript browser half.
 *
 * The browser artifact is not part of the host TypeScript program, so this
 * script runs TypeScript's checkJs pass against it with ambient declarations
 * for the module loader, React (provided by the DSH browser module table), and
 * the browser globals. It catches undefined identifiers and accidental API
 * drift without requiring a frontend build step.
 */
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const tsc = join(root, 'node_modules', '.bin', 'tsc')
try {
  execFileSync(tsc, [
    '--allowJs',
    '--checkJs',
    '--noEmit',
    '--target', 'ES2023',
    '--lib', 'ES2023,DOM,DOM.Iterable',
    '--module', 'NodeNext',
    '--moduleResolution', 'NodeNext',
    '--skipLibCheck',
    '--noImplicitAny', 'false',
    '--strict', 'false',
    join(root, 'client.js'),
    join(root, 'scripts', 'client-globals.d.ts'),
  ], { cwd: root, stdio: 'inherit' })
  console.log('client check OK — module loader, hooks, identifiers, and globals type-check')
} catch {
  process.exit(1)
}
