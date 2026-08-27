#!/usr/bin/env node
/**
 * Thin wrapper so the quickstart commands work exactly as written.
 *
 *   npm run test:atomicity            # better-sqlite3
 *   npm run test:atomicity -- --d1    # Wrangler local D1
 *   npm run test:golden -- --grep "arabic"
 *
 * `--d1` and `--grep` are not vitest flags. `--d1` becomes `--project d1`;
 * `--grep` becomes `--testNamePattern`, case-insensitively — the quickstart
 * asks for "arabic" and the suite is named "Arabic round trip", and a
 * documented command that silently matches nothing is worse than no command.
 * Vitest builds a `RegExp` from the pattern and JavaScript has no inline
 * case-insensitivity flag, so the pattern is widened per letter instead.
 */
import { spawn } from 'node:child_process'

const argv = process.argv.slice(2)
const passthrough = []
let project = 'local'
let namePattern

for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i]
  if (arg === '--d1') {
    project = 'd1'
    continue
  }
  if (arg === '--grep') {
    namePattern = caseInsensitivePattern(argv[i + 1] ?? '')
    i += 1
    continue
  }
  if (arg.startsWith('--grep=')) {
    namePattern = caseInsensitivePattern(arg.slice('--grep='.length))
    continue
  }
  passthrough.push(arg)
}

const args = ['run', '--project', project, ...passthrough]
if (namePattern !== undefined) args.push('--testNamePattern', namePattern)

const child = spawn('vitest', args, { stdio: 'inherit', shell: process.platform === 'win32' })
child.on('exit', (code) => process.exit(code ?? 1))

function caseInsensitivePattern(text) {
  return [...text]
    .map((char) => {
      const lower = char.toLowerCase()
      const upper = char.toUpperCase()
      if (lower === upper) return escapeRegExp(char)
      return `[${escapeRegExp(lower)}${escapeRegExp(upper)}]`
    })
    .join('')
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
