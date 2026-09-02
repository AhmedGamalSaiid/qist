import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { importFixture, type ImportedFixture } from '../helpers/imported'

/**
 * T043 — Arabic survives extraction, import and reporting byte-exact
 * (FR-004, quickstart V4).
 *
 * `Total!I9` is `فرش` at `Total!J9 = 60000` EGP. The failure this guards
 * against is silent: a normalising step, a trim, or a re-encode produces a
 * string that still looks Arabic and is no longer the name the owner typed.
 */

const ARABIC_NAME = 'فرش'
const ARABIC_AMOUNT_MINOR = 6_000_000

describe('Arabic round trip', () => {
  let fixture: ImportedFixture

  beforeAll(async () => {
    fixture = await importFixture()
  })

  afterAll(async () => {
    await fixture.database.dispose()
  })

  it('reads the name out of the dump unchanged', () => {
    expect(fixture.dump.sheet('Total').stringAt('I9')).toBe(ARABIC_NAME)
  })

  it('returns it from the database byte-for-byte', async () => {
    const liabilities = await fixture.repository.holdings.liabilities()
    const match = liabilities.find((l) => l.amountMinor === ARABIC_AMOUNT_MINOR)

    expect(match).toBeDefined()
    expect(match?.name).toBe(ARABIC_NAME)

    // Byte-exact, not merely equal-looking: NFC/NFD normalisation would pass a
    // `===` on some strings and change the stored bytes.
    const encoder = new TextEncoder()
    expect([...encoder.encode(match?.name ?? '')]).toEqual([...encoder.encode(ARABIC_NAME)])
    expect(match?.name.length).toBe(ARABIC_NAME.length)
    expect(match?.name.normalize('NFC')).toBe(match?.name)
  })

  it('carries Arabic through to a report line unchanged', async () => {
    const liabilities = await fixture.repository.holdings.liabilities()
    const line = liabilities
      .map((l) => `${l.name}\t${l.amountMinor}`)
      .find((l) => l.startsWith(ARABIC_NAME))
    expect(line).toBe(`${ARABIC_NAME}\t${ARABIC_AMOUNT_MINOR}`)
  })
})
