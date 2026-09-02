import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * `npm run lint:money` — quickstart V7 (T018, T019a).
 *
 * A static check over `lib/money/`, `lib/rates/` and `lib/derive/`:
 *
 * 1. No `number` division, `parseFloat`, `Number.parseFloat` or float literal.
 *    Principle II admits no exceptions on a monetary path.
 * 2. Rate multiplication under `lib/money/` and `lib/rates/` routes through
 *    `decimal.js`. The plan's Constitution Check asserts this; nothing else
 *    enforces it, and an assertion nothing checks is a comment.
 * 3. No `new Date()` with no argument and no `Date.now()` under `lib/derive/`.
 *    Every derivation receives `today` as a parameter; a clock read inside one
 *    makes it untestable and makes one member's overdue count differ from
 *    another's.
 *
 * **One name is exempt: `monthlyRollup().savingsRate`.** It is a dimensionless
 * ratio, never stored, summed or converted. The exemption is keyed to that
 * name — widening the rule to permit ratios generally would let a monetary
 * float straight through.
 */

const SCANNED = ['lib/money', 'lib/rates', 'lib/derive']
const CLOCK_SCANNED = ['lib/derive']

/** The one exemption, by name and by file. Not a category. */
const EXEMPTIONS: ReadonlyArray<{ file: string; name: string }> = [
  { file: 'lib/derive/transactions.ts', name: 'savingsRate' },
]

interface Finding {
  file: string
  line: number
  rule: string
  text: string
}

const findings: Finding[] = []

for (const root of SCANNED) {
  for (const file of walk(root)) {
    const source = readFileSync(file, 'utf8')
    const relativePath = relative(process.cwd(), file)
    const lines = source.split('\n')
    const stripped = stripCommentsAndStrings(source).split('\n')

    lines.forEach((rawLine, index) => {
      const line = stripped[index] ?? ''
      if (line.trim() === '') return

      const lineNumber = index + 1
      const exempt = EXEMPTIONS.some(
        (e) => e.file === relativePath && rawLine.includes(e.name),
      )

      if (!exempt && hasNumberDivision(line)) {
        findings.push({ file: relativePath, line: lineNumber, rule: 'number division', text: rawLine.trim() })
      }
      if (/\bparseFloat\b/.test(line)) {
        findings.push({ file: relativePath, line: lineNumber, rule: 'parseFloat', text: rawLine.trim() })
      }
      if (!exempt && /(?<![\w.])\d+\.\d+(?![\w.])/.test(line)) {
        findings.push({ file: relativePath, line: lineNumber, rule: 'float literal', text: rawLine.trim() })
      }
    })
  }
}

for (const root of CLOCK_SCANNED) {
  for (const file of walk(root)) {
    const source = readFileSync(file, 'utf8')
    const relativePath = relative(process.cwd(), file)
    const stripped = stripCommentsAndStrings(source).split('\n')

    source.split('\n').forEach((rawLine, index) => {
      const line = stripped[index] ?? ''
      if (/\bnew\s+Date\s*\(\s*\)/.test(line)) {
        findings.push({
          file: relativePath,
          line: index + 1,
          rule: 'argless new Date()',
          text: rawLine.trim(),
        })
      }
      if (/\bDate\s*\.\s*now\s*\(/.test(line)) {
        findings.push({
          file: relativePath,
          line: index + 1,
          rule: 'Date.now()',
          text: rawLine.trim(),
        })
      }
    })
  }
}

// Rule 2: rate multiplication must route through decimal.js.
for (const root of ['lib/money', 'lib/rates']) {
  for (const file of walk(root)) {
    const source = readFileSync(file, 'utf8')
    const relativePath = relative(process.cwd(), file)
    if (!/\brateMinor\b/.test(source)) continue
    // A file that touches `rateMinor` and performs arithmetic on it must
    // import the decimal library. `lib/rates/lookup.ts` only compares dates,
    // so it is not required to.
    const multiplies = /rateMinor[\s\S]{0,80}?[*]|[*][\s\S]{0,80}?rateMinor/.test(
      stripCommentsAndStrings(source),
    )
    if (multiplies && !/from 'decimal\.js'/.test(source)) {
      findings.push({
        file: relativePath,
        line: 1,
        rule: 'rate multiplication outside decimal.js',
        text: 'file multiplies rateMinor without importing decimal.js',
      })
    }
  }
}

if (findings.length > 0) {
  console.error(`lint:money found ${findings.length} violation(s):\n`)
  for (const finding of findings) {
    console.error(`  ${finding.file}:${finding.line}  [${finding.rule}]`)
    console.error(`    ${finding.text}`)
  }
  console.error(
    `\nPrinciple II admits no exceptions on a monetary path. The one exempt name is\n` +
      `monthlyRollup().savingsRate, a dimensionless ratio that is never stored, summed\n` +
      `or converted.`,
  )
  process.exit(1)
}

console.log(
  `lint:money OK — no float arithmetic in ${SCANNED.join(', ')}, ` +
    `no clock reads in ${CLOCK_SCANNED.join(', ')}, ` +
    `rate multiplication routed through decimal.js.`,
)

function hasNumberDivision(line: string): boolean {
  // `/` opens a regex and closes a comment as well as dividing, so the cheap
  // test is: a `/` with an operand-looking token on each side, and not part of
  // `//`, `/*` or `*/`.
  const withoutRegexish = line.replace(/\/\//g, '  ').replace(/\/\*/g, '  ').replace(/\*\//g, '  ')
  return /[\w)\]]\s*\/\s*[\w(]/.test(withoutRegexish)
}

/**
 * Blank out comments and string literals while preserving line numbering, so a
 * float in prose is not reported as a float in code. Block comments are
 * stripped across the whole file first — stripping line by line leaves the
 * body of every `/** ... *\/` block looking like source.
 */
function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, (_m, prefix: string) => prefix)
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
}

function* walk(dir: string): Generator<string> {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      yield* walk(full)
    } else if (full.endsWith('.ts')) {
      yield full
    }
  }
}
