import { afterEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { accounts, transactions } from '../../db/schema/index'
import { accountBalance, setBalanceMode } from '../../lib/data/accounts'
import { atomically } from '../../lib/data/atomically'
import { importFixture, type ImportedFixture } from '../helpers/imported'

/**
 * T074 — balance modes (FR-024 - FR-027).
 *
 * Every account imports in `stated` mode at the spreadsheet's exact value.
 * Switching to `derived` requires an opening balance and its date, is
 * recorded, and changes no figure dated before the switch.
 */

describe('balance modes', () => {
  let fixture: ImportedFixture

  afterEach(async () => {
    await fixture?.database.dispose()
  })

  it('imports every account in stated mode at the sheet value (FR-025)', async () => {
    fixture = await importFixture()
    const rows = await fixture.database.client.db.select().from(accounts)

    expect(rows).toHaveLength(17)
    for (const row of rows) {
      expect(row.balanceMode, row.name).toBe('stated')
      expect(row.quantityMinor, row.name).not.toBeNull()
      expect(row.openingQuantityMinor, row.name).toBeNull()
      expect(row.openingDate, row.name).toBeNull()
    }

    const hsbc = rows.find((r) => r.name === 'HSBC EGP')
    expect(hsbc?.quantityMinor).toBe(6_700_000)
  })

  it('reports a stated balance with its basis', async () => {
    fixture = await importFixture()
    const [account] = await fixture.repository.holdings.accounts()
    const balance = await accountBalance(
      fixture.database.client,
      fixture.repository.context,
      account?.id ?? '',
    )
    expect(balance?.mode).toBe('stated')
    expect(balance?.basis).toBe('stated on the account')
  })

  it('requires an opening balance and date to switch to derived (FR-026)', async () => {
    fixture = await importFixture()
    const client = fixture.database.client
    const ctx = fixture.repository.context
    const accountsList = await fixture.repository.holdings.accounts()
    const target = accountsList.find((a) => a.name === 'HSBC EGP')

    await setBalanceMode(client, ctx, {
      accountId: target?.id ?? '',
      openingQuantityMinor: 6_000_000,
      openingDate: '2026-08-20',
      at: 1_787_000_100_000,
      auditId: 'AUDITSWITCH0000000000000AA',
    })

    const rows = await client.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.householdId, ctx.householdId), eq(accounts.id, target?.id ?? '')))
    const row = rows[0]
    expect(row?.balanceMode).toBe('derived')
    expect(row?.openingQuantityMinor).toBe(6_000_000)
    expect(row?.openingDate).toBe('2026-08-20')
    // The CHECK makes the inconsistent shape unrepresentable, not merely
    // invalid: a derived account cannot also carry a stated quantity.
    expect(row?.quantityMinor).toBeNull()
  })

  it('records the switch in the audit log (FR-027)', async () => {
    fixture = await importFixture()
    const accountsList = await fixture.repository.holdings.accounts()
    const target = accountsList.find((a) => a.name === 'HSBC EGP')

    await setBalanceMode(fixture.database.client, fixture.repository.context, {
      accountId: target?.id ?? '',
      openingQuantityMinor: 6_000_000,
      openingDate: '2026-08-20',
      at: 1_787_000_100_000,
      auditId: 'AUDITSWITCH0000000000000AA',
    })

    const entries = await fixture.repository.history.auditEntries()
    const switchEntry = entries.find((e) => e.id === 'AUDITSWITCH0000000000000AA')
    expect(switchEntry).toBeDefined()
    expect(switchEntry?.action).toBe('update')
    expect(switchEntry?.entity).toBe('accounts')
  })

  it('changes no figure dated before the switch', async () => {
    fixture = await importFixture()
    const client = fixture.database.client
    const ctx = fixture.repository.context
    const accountsList = await fixture.repository.holdings.accounts()
    const target = accountsList.find((a) => a.name === 'HSBC EGP')
    const accountId = target?.id ?? ''

    // Two entries: one before the opening date, one after.
    await atomically(client, [
      client.db.insert(transactions).values({
        id: 'TXBEFOREOPENING0000000000A',
        householdId: ctx.householdId,
        occurredOn: '2026-08-10',
        kind: 'income',
        category: null,
        accountId,
        amountMinor: 1_000_000,
        currency: 'EGP',
        rateId: null,
        note: null,
        reversesId: null,
        createdBy: ctx.userId,
        createdAt: 1,
      }) as never,
      client.db.insert(transactions).values({
        id: 'TXAFTEROPENING00000000000A',
        householdId: ctx.householdId,
        occurredOn: '2026-08-25',
        kind: 'income',
        category: null,
        accountId,
        amountMinor: 500_000,
        currency: 'EGP',
        rateId: null,
        note: null,
        reversesId: null,
        createdBy: ctx.userId,
        createdAt: 2,
      }) as never,
    ])

    await setBalanceMode(client, ctx, {
      accountId,
      openingQuantityMinor: 6_000_000,
      openingDate: '2026-08-20',
      at: 1_787_000_100_000,
      auditId: 'AUDITSWITCH0000000000000AA',
    })

    const balance = await accountBalance(client, ctx, accountId)
    expect(balance?.mode).toBe('derived')
    // Opening 6,000,000 plus only the 500,000 that happened on or after the
    // opening date. The 1,000,000 from 10 August is history the opening
    // balance already accounts for; counting it would double it.
    expect(balance?.quantityMinor).toBe(6_500_000)
    expect(balance?.basis).toMatch(/opening 6000000 on 2026-08-20/)
  })

  it('refuses a non-integer opening balance', async () => {
    fixture = await importFixture()
    const accountsList = await fixture.repository.holdings.accounts()
    await expect(
      setBalanceMode(fixture.database.client, fixture.repository.context, {
        accountId: accountsList[0]?.id ?? '',
        openingQuantityMinor: 1.5,
        openingDate: '2026-08-20',
        at: 1,
        auditId: 'AUDITBAD00000000000000000A',
      }),
    ).rejects.toThrow(/integer minor-unit amount/)
  })
})
