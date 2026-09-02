import { afterEach, describe, expect, it } from 'vitest'
import { auditLog, cards } from '../../db/schema/index'
import { createCard, updateCard } from '../../lib/data/index'
import type { HouseholdContext } from '../../lib/data/context'
import { CardNotFoundError, CardValidationError, UnauthorizedRoleError } from '../../lib/errors'
import { createTestDatabase, type TestDatabase } from '../helpers/db'
import { seedHousehold } from '../helpers/households'

/**
 * T037 — the FR-017 validation matrix (full reasons, never
 * first-failure-only), atomic before/after audit (SC-006), the role matrix,
 * and the structural duplicate-name guarantee under a concurrent race (R7).
 */

const HOUSEHOLD = 'HCARD00000000000000000AA'
const OWNER = 'UCARD00000000000000000AA'
const AT = 1_787_000_000_000

describe('createCard / updateCard', () => {
  let database: TestDatabase | undefined

  afterEach(async () => {
    await database?.dispose()
    database = undefined
  })

  describe('validation (FR-017)', () => {
    it('reports every violation at once, not just the first', async () => {
      const { client, ctx } = await setup()
      try {
        await createCard(client, ctx, {
          id: 'CARDBAD00000000000000000A',
          auditId: 'AUDBAD000000000000000000A',
          at: AT,
          name: '   ',
          limitMinor: -100,
          statementDay: 0,
          dueDay: 32,
        } as never)
        expect.unreachable()
      } catch (error) {
        expect(error).toBeInstanceOf(CardValidationError)
        const fields = (error as CardValidationError).reasons.map((r) => r.field).sort()
        expect(fields).toEqual(['dueDay', 'limitMinor', 'name', 'statementDay'])
      }
    })

    it('rejects a name over 120 characters', async () => {
      const { client, ctx } = await setup()
      await expect(
        createCard(client, ctx, {
          id: 'CARDLONG0000000000000000A',
          auditId: 'AUDLONG0000000000000000A',
          at: AT,
          name: 'x'.repeat(121),
        }),
      ).rejects.toThrow(CardValidationError)
    })

    it('rejects a case-insensitive duplicate name within the household', async () => {
      const { client, ctx } = await setup()
      await createCard(client, ctx, { id: 'CARDDUP10000000000000000A', auditId: 'AUDDUP10000000000000000A', at: AT, name: 'Visa Gold' })

      await expect(
        createCard(client, ctx, {
          id: 'CARDDUP20000000000000000A',
          auditId: 'AUDDUP20000000000000000A',
          at: AT + 1,
          name: 'visa gold',
        }),
      ).rejects.toThrow(CardValidationError)
    })

    it('rejects a float limitMinor', async () => {
      const { client, ctx } = await setup()
      await expect(
        createCard(client, ctx, {
          id: 'CARDFLOAT000000000000000A',
          auditId: 'AUDFLOAT000000000000000A',
          at: AT,
          name: 'Float Card',
          limitMinor: 100.5,
        }),
      ).rejects.toThrow(CardValidationError)
    })

    it('lets explicit null clear an optional field on update', async () => {
      const { client, ctx } = await setup()
      await createCard(client, ctx, {
        id: 'CARDCLEAR000000000000000A',
        auditId: 'AUDCLEAR000000000000000A',
        at: AT,
        name: 'Clearable',
        limitMinor: 5000,
      })

      await updateCard(client, ctx, {
        cardId: 'CARDCLEAR000000000000000A',
        auditId: 'AUDCLEAR100000000000000A',
        at: AT + 1,
        limitMinor: null,
      })

      const rows = await client.db.select().from(cards)
      const row = rows.find((r) => r.id === 'CARDCLEAR000000000000000A')
      expect(row?.limitMinor).toBeNull()
    })

    it('leaves an omitted field untouched on update', async () => {
      const { client, ctx } = await setup()
      await createCard(client, ctx, {
        id: 'CARDKEEP0000000000000000A',
        auditId: 'AUDKEEP0000000000000000A',
        at: AT,
        name: 'Keep Me',
        dueDay: 10,
      })

      await updateCard(client, ctx, {
        cardId: 'CARDKEEP0000000000000000A',
        auditId: 'AUDKEEP1000000000000000A',
        at: AT + 1,
        name: 'Keep Me Renamed',
      })

      const rows = await client.db.select().from(cards)
      const row = rows.find((r) => r.id === 'CARDKEEP0000000000000000A')
      expect(row?.name).toBe('Keep Me Renamed')
      expect(row?.dueDay).toBe(10)
    })

    it('answers a foreign or nonexistent card id identically: CardNotFoundError', async () => {
      const { client, ctx } = await setup()
      await expect(
        updateCard(client, ctx, { cardId: 'CARDNOPE0000000000000000A', auditId: 'AUDNOPE0000000000000000A', at: AT, name: 'X' }),
      ).rejects.toThrow(CardNotFoundError)
    })
  })

  describe('atomic before/after audit (SC-006)', () => {
    it('create writes the card and its audit entry in the same atom', async () => {
      const { client, ctx } = await setup()
      await createCard(client, ctx, {
        id: 'CARDAUDIT00000000000000A',
        auditId: 'AUDAUDIT00000000000000A',
        at: AT,
        name: 'Audited Card',
      })

      const cardRows = await client.db.select().from(cards)
      expect(cardRows.find((r) => r.id === 'CARDAUDIT00000000000000A')).toBeDefined()

      const audits = await client.db.select().from(auditLog)
      const entry = audits.find((a) => a.entityId === 'CARDAUDIT00000000000000A')
      expect(entry).toMatchObject({ action: 'create', entity: 'cards', actorId: OWNER })
      // `recordAudit` stores an explicit `before: null` as the JSON literal
      // "null" (only an `undefined` before produces a real SQL NULL column)
      // — the same convention every other write in this codebase follows.
      expect(JSON.parse(entry!.beforeJson!)).toBeNull()
      expect(JSON.parse(entry!.afterJson!)).toMatchObject({ name: 'Audited Card' })
    })

    it('update writes the card and a before/after audit entry in the same atom', async () => {
      const { client, ctx } = await setup()
      await createCard(client, ctx, { id: 'CARDUPD0000000000000000A', auditId: 'AUDUPD0000000000000000A', at: AT, name: 'Original' })
      await updateCard(client, ctx, { cardId: 'CARDUPD0000000000000000A', auditId: 'AUDUPD1000000000000000A', at: AT + 1, name: 'Renamed' })

      const audits = await client.db.select().from(auditLog)
      const entry = audits.find((a) => a.id === 'AUDUPD1000000000000000A')
      expect(entry).toMatchObject({ action: 'update', entity: 'cards' })
      expect(JSON.parse(entry!.beforeJson!)).toMatchObject({ name: 'Original' })
      expect(JSON.parse(entry!.afterJson!)).toMatchObject({ name: 'Renamed' })
    })

    it('a refused write commits nothing — no card, no audit entry', async () => {
      const { client, ctx } = await setup()
      await expect(
        createCard(client, ctx, { id: 'CARDREF0000000000000000A', auditId: 'AUDREF0000000000000000A', at: AT, name: '' }),
      ).rejects.toThrow(CardValidationError)

      expect(await client.db.select().from(cards)).toHaveLength(0)
      expect(await client.db.select().from(auditLog)).toHaveLength(0)
    })
  })

  describe('role matrix', () => {
    it('refuses a viewer, writing nothing', async () => {
      const { client, ctx } = await setup()
      const viewerCtx: HouseholdContext = { ...ctx, role: 'viewer' }
      await expect(
        createCard(client, viewerCtx, { id: 'CARDVIEW0000000000000A', auditId: 'AUDVIEW0000000000000A', at: AT, name: 'Nope' }),
      ).rejects.toThrow(UnauthorizedRoleError)
      expect(await client.db.select().from(cards)).toHaveLength(0)
    })

    it('allows a member to write', async () => {
      const { client, ctx } = await setup()
      const memberCtx: HouseholdContext = { ...ctx, role: 'member' }
      await expect(
        createCard(client, memberCtx, { id: 'CARDMEM0000000000000000A', auditId: 'AUDMEM0000000000000000A', at: AT, name: 'Member Card' }),
      ).resolves.toBeUndefined()
    })
  })

  it('refuses a concurrent duplicate-name create via the structural unique index, not just the pre-read (R7)', async () => {
    const { client, ctx } = await setup()
    await createCard(client, ctx, { id: 'CARDRACE10000000000000A', auditId: 'AUDRACE10000000000000A', at: AT, name: 'Race Card' })

    // Simulates the race the pre-read alone cannot close: a second card with
    // a colliding (lowercased) name inserted directly, as if its own
    // `createCard` pre-read had run before the first card committed and saw
    // no conflict. `cards_household_name_unique` refuses it regardless, and
    // `createCard`/`updateCard` remap that specific constraint violation to
    // the same `CardValidationError` a normal duplicate submission gets
    // (research.md R7) — this direct insert proves only the database side;
    // `createCard`'s own remapping is exercised by the write below.
    await expect(
      client.db.insert(cards).values({
        id: 'CARDRACE20000000000000A',
        householdId: ctx.householdId,
        name: 'RACE CARD',
        limitMinor: null,
        statementDay: null,
        dueDay: null,
        sortOrder: 2,
        createdAt: AT + 1,
      }),
    ).rejects.toThrow()

    const rows = await client.db.select().from(cards)
    expect(rows).toHaveLength(1)
  })

  it('remaps a genuine concurrent-create race through createCard itself to CardValidationError', async () => {
    const { client, ctx } = await setup()

    // Both calls' pre-reads run against an empty `cards` table before either
    // write commits — a real race, not a simulation — so the race loser's
    // write hits `cards_household_name_unique` and `createCard` remaps it to
    // the same duplicate-name refusal a normal submission gets (R7).
    const results = await Promise.allSettled([
      createCard(client, ctx, { id: 'CARDCONC10000000000000A', auditId: 'AUDCONC10000000000000A', at: AT, name: 'Concurrent' }),
      createCard(client, ctx, { id: 'CARDCONC20000000000000A', auditId: 'AUDCONC20000000000000A', at: AT, name: 'concurrent' }),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(CardValidationError)

    expect(await client.db.select().from(cards)).toHaveLength(1)
  })

  async function setup(): Promise<{ client: Awaited<ReturnType<typeof createTestDatabase>>['client']; ctx: HouseholdContext }> {
    database = await createTestDatabase()
    const client = database.client
    const ctx = await seedHousehold(client, { id: HOUSEHOLD, userId: OWNER, email: 'card-owner@test.example', at: AT })
    return { client, ctx }
  }
})
