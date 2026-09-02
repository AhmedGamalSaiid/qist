/**
 * Formula normalisation (T011).
 *
 * Rewrites a formula's cell references into R1C1 form *relative to the cell
 * that holds it*, so that a formula filled down a column collapses to a single
 * shape while two different formulas on the same row stay distinct.
 *
 * Normalising by stripping row numbers alone is not enough: `Total!E2` is
 * `=A2*D2` and `Total!G2` is `=B2*F2`, which are different computations that
 * would collapse into one entry and hide a range from the coverage matrix.
 * Offsets keep them apart — `R[0]C[-4]*R[0]C[-1]` against
 * `R[0]C[-5]*R[0]C[-1]` — while `Dashboard!I2:I22`, which is the same formula
 * filled down 21 rows, becomes one shape as intended.
 */

// The lookbehind keeps `LOG10(` and friends from being read as the reference
// `G10`: a reference never begins immediately after a letter or digit.
const REFERENCE = /(?<![A-Za-z0-9_])(\$?)([A-Z]{1,3})(\$?)(\d+)/g

export function columnToIndex(column: string): number {
  let index = 0
  for (const char of column) {
    index = index * 26 + (char.charCodeAt(0) - 64)
  }
  return index
}

export function indexToColumn(index: number): string {
  let remaining = index
  let column = ''
  while (remaining > 0) {
    const rem = (remaining - 1) % 26
    column = String.fromCharCode(65 + rem) + column
    remaining = Math.floor((remaining - 1) / 26)
  }
  return column
}

/** Split a formula into quoted-string and code segments, in order. */
function segments(formula: string): Array<{ text: string; quoted: boolean }> {
  const out: Array<{ text: string; quoted: boolean }> = []
  let buffer = ''
  let inString = false

  for (let i = 0; i < formula.length; i += 1) {
    const char = formula[i] as string
    if (char === '"') {
      out.push({ text: buffer, quoted: inString })
      buffer = ''
      inString = !inString
      continue
    }
    buffer += char
  }
  out.push({ text: buffer, quoted: inString })
  return out
}

/**
 * The R1C1 shape of `formula` as written in cell (`row`, `column`).
 *
 * String literals are left untouched — `"USD"` and `">="` are data, and a
 * reference-shaped substring inside one is not a reference.
 */
export function normaliseFormula(formula: string, a1: string): string {
  const match = /^([A-Z]+)(\d+)$/.exec(a1)
  if (match === null) throw new TypeError(`Not an A1 reference: ${a1}`)
  const anchorColumn = columnToIndex(match[1] as string)
  const anchorRow = Number(match[2])

  return segments(formula)
    .map((segment) => {
      if (segment.quoted) return `"${segment.text}"`
      return segment.text.replace(
        REFERENCE,
        (_whole, colAbs: string, col: string, rowAbs: string, row: string) => {
          const columnPart =
            colAbs === '$' ? `C${columnToIndex(col)}` : `C[${columnToIndex(col) - anchorColumn}]`
          const rowPart = rowAbs === '$' ? `R${row}` : `R[${Number(row) - anchorRow}]`
          return `${rowPart}${columnPart}`
        },
      )
    })
    .join('')
}
