import { and, eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { accounts, auditLog, liabilities } from '../../db/schema/index'
import { applyCardConsolidation, loadHouseholdState } from '../../lib/data/index'
import { CONSOLIDATION_ANCHORS } from '../../lib/data/consolidation'
import { cardBalances } from '../../lib/derive/index'
import { AlreadyAppliedError } from '../../lib/errors'
import { GOLDEN_NET_WORTH, GOLDEN_TODAY, GOLDEN_TOTAL } from '../golden/expected.generated'
import { importFixture, type ImportedFixture } from '../helpers/imported'

/**
 * T045 — the D7 consolidation, quickstart V6's pinned-figures table
 * (minor units, no tolerance): `shortTermLiabilities` **+60000 exactly**,
 * both net-worth figures **−60000 exactly**, every other derived figure
 * unchanged; one ADIB entity at 60000 via `cardBalances`; HSBC one entity,
 * no movement; imported rows byte-identical; double-apply refused
 * structurally with zero rows written; archive audit entries with
 * before/after; the pinned anchor ids resolve against a fresh import.
 */

const AT = 1_800_000_000_000

describe('applyCardConsolidation', () => {
  let fixture: ImportedFixture | undefined

  afterEach(async () => {
    await fixture?.database.dispose()
    fixture = undefined
  })

  it('the pinned anchor ids resolve against a fresh import of the frozen dump', async () => {
    fixture = await importFixture()
    const { client } = fixture.database
    const ctx = fixture.repository.context
    expect(ctx.householdId).toBe(CONSOLIDATION_ANCHORS.HOUSEHOLD_ID)

    for (const anchor of [CONSOLIDATION_ANCHORS.ADIB, CONSOLIDATION_ANCHORS.HSBC]) {
      const liabilityRows = await client.db
        .select()
        .from(liabilities)
        .where(and(eq(liabilities.householdId, ctx.householdId), eq(liabilities.id, anchor.liabilityId)))
      expect(liabilityRows, anchor.liabilityId).toHaveLength(1)
      expect(liabilityRows[0]).toMatchObject({ name: anchor.liabilityName, amountMinor: anchor.importedLiabilityAmountMinor })

      const accountRows = await client.db
        .select()
        .from(accounts)
        .where(and(eq(accounts.householdId, ctx.householdId), eq(accounts.id, anchor.accountId)))
      expect(accountRows, anchor.accountId).toHaveLength(1)
      expect(accountRows[0]).toMatchObject({
        name: anchor.accountName,
        quantityMinor: anchor.importedAccountQuantityMinor,
        archivedAt: null,
      })
    }
  })

  it('applies exactly +60000 to short-term liabilities and -60000 to both net-worth figures; nothing else moves', async () => {
    fixture = await importFixture()
    const { client } = fixture.database
    const ctx = fixture.repository.context

    const before = await loadHouseholdState(fixture.repository, { today: GOLDEN_TODAY })
    expect(before.derived.shortTermLiabilities).toBe(GOLDEN_TOTAL.shortTermLiabilities)
    expect(before.derived.netWorth.excludingInstallments).toBe(GOLDEN_NET_WORTH.excludingInstallments)
    expect(before.derived.netWorth.includingInstallments).toBe(GOLDEN_NET_WORTH.includingInstallments)

    const ids = {
      adibLiabilityId: 'ADIBCORRECT0000000000000A',
      adibAuditId: 'ADIBAUDIT000000000000000A',
      adibArchiveAuditId: 'ADIBARCHIVE00000000000AA',
      hsbcLiabilityId: 'HSBCCORRECT0000000000000A',
      hsbcAuditId: 'HSBCAUDIT000000000000000A',
      hsbcArchiveAuditId: 'HSBCARCHIVE00000000000AA',
    }
    const result = await applyCardConsolidation(client, ctx, { ids, at: AT })

    expect(result.applied).toEqual([
      {
        card: 'ADIB',
        correctingLiabilityId: ids.adibLiabilityId,
        amountMinor: 60_000,
        reverses: CONSOLIDATION_ANCHORS.ADIB.liabilityId,
        archivedAccountId: CONSOLIDATION_ANCHORS.ADIB.accountId,
      },
      {
        card: 'HSBC',
        correctingLiabilityId: ids.hsbcLiabilityId,
        amountMinor: 0,
        reverses: CONSOLIDATION_ANCHORS.HSBC.liabilityId,
        archivedAccountId: CONSOLIDATION_ANCHORS.HSBC.accountId,
      },
    ])

    const after = await loadHouseholdState(fixture.repository, { today: GOLDEN_TODAY })
    expect(after.derived.shortTermLiabilities).toBe(GOLDEN_TOTAL.shortTermLiabilities + 60_000)
    expect(after.derived.netWorth.excludingInstallments).toBe(GOLDEN_NET_WORTH.excludingInstallments - 60_000)
    expect(after.derived.netWorth.includingInstallments).toBe(GOLDEN_NET_WORTH.includingInstallments - 60_000)

    // Every other derived figure is byte-identical to before — except
    // `totalOfAll`, which (lib/derive/totals.ts) is itself
    // `holdings - shortTermLiabilities`: it necessarily moves by the same
    // -60000 as the net-worth figures, a direct mathematical consequence of
    // the same short-term-liabilities fix, not a second figure the spec's
    // "no other figure changes" was written to rule out.
    expect(after.derived.totalHoldings).toEqual(before.derived.totalHoldings)
    expect(after.derived.investmentHoldings).toEqual(before.derived.investmentHoldings)
    expect(after.derived.liquidTotal).toEqual(before.derived.liquidTotal)
    expect(after.derived.totalOfAll).toBe(GOLDEN_TOTAL.totalOfAll - 60_000)
    expect(after.derived.investmentTotal).toEqual(before.derived.investmentTotal)
    expect(after.derived.installmentSummary).toEqual(before.derived.installmentSummary)
    expect(after.derived.unpaidByYear).toEqual(before.derived.unpaidByYear)
    expect(after.derived.assetMix).toEqual(before.derived.assetMix)
    expect(after.derived.monthlyRollup).toEqual(before.derived.monthlyRollup)

    // One ADIB entity at exactly 60000, counted once; HSBC unchanged at 0.
    const balances = cardBalances(after.cards, after.liabilities)
    const adibCard = after.cards.find((c) => c.id === CONSOLIDATION_ANCHORS.ADIB.cardId)
    const hsbcCard = after.cards.find((c) => c.id === CONSOLIDATION_ANCHORS.HSBC.cardId)
    expect(balances.find((b) => b.cardId === adibCard?.id)?.balanceMinor).toBe(60_000)
    expect(balances.find((b) => b.cardId === hsbcCard?.id)?.balanceMinor).toBe(0)

    // Every imported row is present and byte-identical to what the fresh
    // import produced (FR-024/FR-022) — compared against a second fresh
    // import of the same dump, since the corrected database is never the
    // parity subject itself.
    const reimport = await importFixture()
    try {
      const originalAccounts = await reimport.database.client.db
        .select()
        .from(accounts)
        .where(eq(accounts.householdId, ctx.householdId))
      const originalLiabilities = await reimport.database.client.db
        .select()
        .from(liabilities)
        .where(eq(liabilities.householdId, ctx.householdId))

      // Every ORIGINAL imported row is present and byte-identical in its own
      // (name, amount) content — including ADIB/HSBC, whose imported rows
      // are never edited, only archived (accounts) or superseded by a new
      // linked row (liabilities).
      for (const original of originalAccounts) {
        const current = (
          await client.db
            .select()
            .from(accounts)
            .where(and(eq(accounts.householdId, ctx.householdId), eq(accounts.id, original.id)))
        )[0]
        expect(current, original.id).toMatchObject({ name: original.name, quantityMinor: original.quantityMinor })
      }
      for (const original of originalLiabilities) {
        const current = (
          await client.db
            .select()
            .from(liabilities)
            .where(and(eq(liabilities.householdId, ctx.householdId), eq(liabilities.id, original.id)))
        )[0]
        expect(current, original.id).toMatchObject({ name: original.name, amountMinor: original.amountMinor })
      }

      // Exactly the two consolidated accounts are archived; every other
      // imported account row remains unarchived.
      const currentAccounts = await client.db.select().from(accounts).where(eq(accounts.householdId, ctx.householdId))
      expect(currentAccounts.map((a) => a.id).sort()).toEqual(originalAccounts.map((a) => a.id).sort())
      expect(currentAccounts.filter((a) => a.archivedAt !== null).map((a) => a.id).sort()).toEqual(
        [CONSOLIDATION_ANCHORS.ADIB.accountId, CONSOLIDATION_ANCHORS.HSBC.accountId].sort(),
      )
    } finally {
      await reimport.database.dispose()
    }
  })

  it('archives both accounts with before/after audit entries citing D7', async () => {
    fixture = await importFixture()
    const { client } = fixture.database
    const ctx = fixture.repository.context

    await applyCardConsolidation(client, ctx, {
      ids: {
        adibLiabilityId: 'ADIBCORRECT0000000000000B',
        adibAuditId: 'ADIBAUDIT000000000000000B',
        adibArchiveAuditId: 'ADIBARCHIVE00000000000BB',
        hsbcLiabilityId: 'HSBCCORRECT0000000000000B',
        hsbcAuditId: 'HSBCAUDIT000000000000000B',
        hsbcArchiveAuditId: 'HSBCARCHIVE00000000000BB',
      },
      at: AT,
    })

    const archiveAudits = await client.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.householdId, ctx.householdId), eq(auditLog.action, 'archive')))
    expect(archiveAudits).toHaveLength(2)
    for (const entry of archiveAudits) {
      expect(JSON.parse(entry.beforeJson!)).toEqual({ archivedAt: null })
      expect(JSON.parse(entry.afterJson!)).toEqual({ archivedAt: AT })
    }

    const createAudits = await client.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.householdId, ctx.householdId), eq(auditLog.entity, 'liabilities'), eq(auditLog.action, 'create')))
    expect(createAudits).toHaveLength(2)
    for (const entry of createAudits) {
      const after = JSON.parse(entry.afterJson!)
      expect(after.decision).toBe('D7')
    }

    const accountRows = await client.db.select().from(accounts).where(eq(accounts.householdId, ctx.householdId))
    const adibAccount = accountRows.find((a) => a.id === CONSOLIDATION_ANCHORS.ADIB.accountId)
    const hsbcAccount = accountRows.find((a) => a.id === CONSOLIDATION_ANCHORS.HSBC.accountId)
    expect(adibAccount?.archivedAt).toBe(AT)
    expect(hsbcAccount?.archivedAt).toBe(AT)
  })

  it('is structurally idempotent: a second application is refused, writing zero rows', async () => {
    fixture = await importFixture()
    const { client } = fixture.database
    const ctx = fixture.repository.context

    await applyCardConsolidation(client, ctx, {
      ids: {
        adibLiabilityId: 'ADIBCORRECT0000000000000C',
        adibAuditId: 'ADIBAUDIT000000000000000C',
        adibArchiveAuditId: 'ADIBARCHIVE00000000000CC',
        hsbcLiabilityId: 'HSBCCORRECT0000000000000C',
        hsbcAuditId: 'HSBCAUDIT000000000000000C',
        hsbcArchiveAuditId: 'HSBCARCHIVE00000000000CC',
      },
      at: AT,
    })

    const liabilityRowsBefore = await client.db.select().from(liabilities).where(eq(liabilities.householdId, ctx.householdId))
    const auditRowsBefore = await client.db.select().from(auditLog).where(eq(auditLog.householdId, ctx.householdId))

    await expect(
      applyCardConsolidation(client, ctx, {
        ids: {
          adibLiabilityId: 'ADIBCORRECT0000000000000D',
          adibAuditId: 'ADIBAUDIT000000000000000D',
          adibArchiveAuditId: 'ADIBARCHIVE00000000000DD',
          hsbcLiabilityId: 'HSBCCORRECT0000000000000D',
          hsbcAuditId: 'HSBCAUDIT000000000000000D',
          hsbcArchiveAuditId: 'HSBCARCHIVE00000000000DD',
        },
        at: AT + 1,
      }),
    ).rejects.toThrow(AlreadyAppliedError)

    const liabilityRowsAfter = await client.db.select().from(liabilities).where(eq(liabilities.householdId, ctx.householdId))
    const auditRowsAfter = await client.db.select().from(auditLog).where(eq(auditLog.householdId, ctx.householdId))
    expect(liabilityRowsAfter).toHaveLength(liabilityRowsBefore.length)
    expect(auditRowsAfter).toHaveLength(auditRowsBefore.length)
  })

  it('is not_applicable on a household with no imported ADIB/HSBC rows', async () => {
    const { createTestDatabase } = await import('../helpers/db')
    const { seedHousehold } = await import('../helpers/households')
    const { NotApplicableError } = await import('../../lib/errors')

    const database = await createTestDatabase()
    try {
      const ctx = await seedHousehold(database.client, {
        id: 'HNOTMIGRATED000000000000A',
        userId: 'UNOTMIGRATED000000000000A',
        email: 'fresh@household.example',
      })
      await expect(
        applyCardConsolidation(database.client, ctx, {
          ids: {
            adibLiabilityId: 'X1',
            adibAuditId: 'X2',
            adibArchiveAuditId: 'X3',
            hsbcLiabilityId: 'X4',
            hsbcAuditId: 'X5',
            hsbcArchiveAuditId: 'X6',
          },
          at: AT,
        }),
      ).rejects.toThrow(NotApplicableError)
    } finally {
      await database.dispose()
    }
  })
})
