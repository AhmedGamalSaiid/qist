import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { auditLog, transactions } from '../../db/schema/index'
import { atomically } from '../../lib/data/atomically'
import { recordCorrection } from '../../lib/data/corrections'
import { setBalanceMode } from '../../lib/data/accounts'
import { recordRate } from '../../lib/rates/record'
import { createTestDatabase, type TestDatabase } from '../helpers/db'
import { importFixture, type ImportedFixture } from '../helpers/imported'
import { seedHousehold } from '../helpers/households'

/**
 * T071 — every write records who, when, what changed and what it was before
 * (SC-004, FR-013).
 */

describe('audit trail', () => {
  let database: TestDatabase | undefined
  let fixture: ImportedFixture | undefined

  afterEach(async () => {
    await database?.dispose()
    await fixture?.database.dispose()
    database = undefined
    fixture = undefined
  })

  it('records the import itself, with the actor and the time', async () => {
    fixture = await importFixture()
    const entries = await fixture.repository.history.auditEntries()

    expect(entries.length).toBeGreaterThan(0)
    const importEntry = entries.find((e) => e.action === 'import')
    expect(importEntry).toBeDefined()
    expect(importEntry?.actorKind).toBe('user')
    expect(importEntry?.actorId).not.toBeNull()
    expect(importEntry?.at).toBeGreaterThan(0)
    expect(importEntry?.entity).toBe('household')
    expect(JSON.parse(importEntry?.afterJson ?? '{}')).toMatchObject({
      sourceTimezone: 'America/Los_Angeles',
    })
  })

  it('records a correction alongside the row it writes, in one atom', async () => {
    database = await createTestDatabase()
    const client = database.client
    const ctx = await seedHousehold(client, {
      id: 'H1AAAAAAAAAAAAAAAAAAAAAAAA',
      userId: 'U1AAAAAAAAAAAAAAAAAAAAAAAA',
      email: 'owner@one.test',
    })

    await atomically(client, [
      client.db.insert(transactions).values({
        id: 'TXORIGINAL0000000000000000',
        householdId: ctx.householdId,
        occurredOn: '2026-08-01',
        kind: 'expense',
        category: null,
        accountId: null,
        amountMinor: 50_000,
        currency: 'EGP',
        rateId: null,
        note: null,
        reversesId: null,
        createdBy: ctx.userId,
        createdAt: 1,
      }) as never,
    ])

    await recordCorrection(client, ctx, {
      id: 'TXCORRECTION00000000000000',
      reversesId: 'TXORIGINAL0000000000000000',
      occurredOn: '2026-08-01',
      kind: 'expense',
      amountMinor: 5_000,
      currency: 'EGP',
      rateId: null,
      at: 1_787_000_000_999,
      auditId: 'AUDITCORRECTION00000000001',
    })

    const entries = await client.db.select().from(auditLog)
    expect(entries).toHaveLength(1)
    const entry = entries[0]
    expect(entry?.actorId).toBe(ctx.userId)
    expect(entry?.actorKind).toBe('user')
    expect(entry?.action).toBe('create')
    expect(entry?.entity).toBe('transactions')
    expect(entry?.entityId).toBe('TXCORRECTION00000000000000')
    expect(entry?.at).toBe(1_787_000_000_999)
  })

  it('records the before state on an update', async () => {
    fixture = await importFixture()
    const accounts = await fixture.repository.holdings.accounts()
    const target = accounts.find((a) => a.name === 'HSBC EGP')
    expect(target).toBeDefined()

    await setBalanceMode(fixture.database.client, fixture.repository.context, {
      accountId: target?.id ?? '',
      openingQuantityMinor: 6_700_000,
      openingDate: '2026-08-01',
      at: 1_787_000_001_000,
      auditId: 'AUDITBALANCEMODE0000000001',
    })

    const entries = await fixture.repository.history.auditEntries()
    const update = entries.find((e) => e.action === 'update')
    expect(update).toBeDefined()
    // "What it was before" is what makes an audit entry reversible reading
    // rather than a note that something happened.
    expect(JSON.parse(update?.beforeJson ?? '{}')).toMatchObject({
      balanceMode: 'stated',
      quantityMinor: 6_700_000,
    })
    expect(JSON.parse(update?.afterJson ?? '{}')).toMatchObject({
      balanceMode: 'derived',
      openingDate: '2026-08-01',
    })
  })

  it('attributes an automated rate fetch to the system, with no user', async () => {
    database = await createTestDatabase()
    const client = database.client
    const ctx = await seedHousehold(client, {
      id: 'H1AAAAAAAAAAAAAAAAAAAAAAAA',
      userId: 'U1AAAAAAAAAAAAAAAAAAAAAAAA',
      email: 'owner@one.test',
    })

    await recordRate(client, ctx, {
      id: 'RATEFETCHED000000000000001',
      assetClass: 'USD',
      rateMinor: 502_554,
      asOf: '2026-08-27',
      source: 'fetch',
      at: 1_787_000_002_000,
      auditId: 'AUDITRATEFETCH000000000001',
    })

    const entries = await client.db.select().from(auditLog)
    const entry = entries.find((e) => e.entity === 'rates')
    expect(entry?.actorKind).toBe('system')
    // Inventing a user id here would make the audit trail say something untrue.
    expect(entry?.actorId).toBeNull()
  })

  it('offers no update or delete path for the log itself', () => {
    // Append-only is a property of the surface, not a convention. Reading the
    // text rather than reasoning about it means a future edit that adds an
    // update path fails here instead of passing silently.
    for (const path of ['lib/data/audit.ts', 'lib/data/corrections.ts', 'lib/data/accounts.ts']) {
      const source = readFileSync(path, 'utf8')
      expect(source, path).not.toMatch(/\.update\(\s*auditLog/)
      expect(source, path).not.toMatch(/\.delete\(\s*auditLog/)
    }
  })
})
