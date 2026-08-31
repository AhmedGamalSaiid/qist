import { and, eq } from 'drizzle-orm'
import type { AppClient, Statement } from '../../db/client'
import { accounts, cards, liabilities } from '../../db/schema/index'
import { AlreadyAppliedError, NotApplicableError } from '../errors'
import { atomically } from './atomically'
import { assertAdmin } from './authz'
import { recordAudit } from './audit'
import type { HouseholdContext } from './context'
import { assertNoCycle } from './corrections'

/**
 * The D7 consolidation (T042, research.md R6).
 *
 * The imported-row ids below are deterministic functions of the frozen dump
 * (`lib/import/ids.ts`) — computed once and pinned here, recorded alongside
 * the decision in `specs/003-data-foundation/discrepancies.md`. Valid while
 * the dump is frozen and cutover is deferred; a fresh re-import reproduces
 * these exact ids (a fresh-import test asserts this).
 *
 * `correctedAmountMinor` is the D7 register's `authoritative_minor` — the
 * settled decision input, not a value this module invents.
 */
const HOUSEHOLD_ID = '194NRCNHWEBDB912QKQTTGVT5F'

const ADIB = {
  cardId: '26HTBHY5WTV9JXCWQ51ES08X7R',
  liabilityId: '2VCEP5AERT8V960FZ16VJR3XWT',
  liabilityName: 'CC ADIB',
  /** `Total!J4` — the incorrectly-entered duplicate D7 supersedes. */
  importedLiabilityAmountMinor: 0,
  accountId: '7WW6SB50M15K858W035D1NQ8R8',
  accountName: 'ADIB C.C',
  /** `Data!D13` — the unreachable stated value D7 confirms is correct. */
  importedAccountQuantityMinor: 60_000,
  correctedAmountMinor: 60_000,
} as const

const HSBC = {
  cardId: '6VQ21EMYXDPHGR8JEP672AQH4A',
  liabilityId: '5C28XRHRGS7W34FW3K4XB3HAT1',
  liabilityName: 'CC HSBC',
  importedLiabilityAmountMinor: 0,
  accountId: '4H0DXJ617TMX941Q2Z9PKAHF0V',
  accountName: 'HSBC C.C',
  importedAccountQuantityMinor: 0,
  correctedAmountMinor: 0,
} as const

/** Exported for the fresh-import test asserting these ids resolve (T045). */
export const CONSOLIDATION_ANCHORS = { HOUSEHOLD_ID, ADIB, HSBC } as const

export interface ApplyCardConsolidationInput {
  readonly ids: {
    readonly adibLiabilityId: string
    readonly adibAuditId: string
    readonly adibArchiveAuditId: string
    readonly hsbcLiabilityId: string
    readonly hsbcAuditId: string
    readonly hsbcArchiveAuditId: string
  }
  readonly at: number
}

export interface ConsolidationResult {
  readonly applied: ReadonlyArray<{
    readonly card: 'ADIB' | 'HSBC'
    readonly correctingLiabilityId: string
    readonly amountMinor: number
    readonly reverses: string
    readonly archivedAccountId: string
  }>
}

type Anchor = typeof ADIB | typeof HSBC

/**
 * Pre-reads one card/liability/account triplet within the caller's own
 * household and verifies it still matches its imported content. Absence or
 * a content mismatch → `NotApplicableError` (any household but the migrated
 * one, or a renamed/edited row); a liability already reversed by another row
 * → `AlreadyAppliedError` (checked before the other content is inspected,
 * so a genuine re-application attempt gets the more meaningful answer).
 */
async function verifyAnchor(
  client: AppClient,
  ctx: HouseholdContext,
  anchor: Anchor,
): Promise<void> {
  const liabilityRows = await client.db
    .select()
    .from(liabilities)
    .where(and(eq(liabilities.householdId, ctx.householdId), eq(liabilities.id, anchor.liabilityId)))
    .limit(1)
  const liabilityRow = liabilityRows[0]
  if (
    liabilityRow === undefined ||
    liabilityRow.name !== anchor.liabilityName ||
    liabilityRow.amountMinor !== anchor.importedLiabilityAmountMinor
  ) {
    throw new NotApplicableError(
      `No applicable ${anchor.liabilityName} liability row in this household — the D7 ` +
        `consolidation applies only to the migrated household's imported seed data.`,
    )
  }

  const alreadyReversed = await client.db
    .select({ id: liabilities.id })
    .from(liabilities)
    .where(and(eq(liabilities.householdId, ctx.householdId), eq(liabilities.reversesId, anchor.liabilityId)))
    .limit(1)
  if (alreadyReversed.length > 0) {
    throw new AlreadyAppliedError(
      `The D7 consolidation has already been applied for ${liabilityRow.name} in this household.`,
    )
  }

  const cardRows = await client.db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.householdId, ctx.householdId), eq(cards.id, anchor.cardId)))
    .limit(1)
  if (cardRows.length === 0) {
    throw new NotApplicableError(`No applicable card (${anchor.cardId}) in this household.`)
  }

  const accountRows = await client.db
    .select()
    .from(accounts)
    .where(and(eq(accounts.householdId, ctx.householdId), eq(accounts.id, anchor.accountId)))
    .limit(1)
  const accountRow = accountRows[0]
  if (
    accountRow === undefined ||
    accountRow.name !== anchor.accountName ||
    accountRow.quantityMinor !== anchor.importedAccountQuantityMinor ||
    accountRow.archivedAt !== null
  ) {
    throw new NotApplicableError(
      `The ${anchor.accountName} account row in this household does not match its expected imported state.`,
    )
  }
}

async function buildAnchorStatements(
  client: AppClient,
  ctx: HouseholdContext,
  anchor: Anchor,
  card: 'ADIB' | 'HSBC',
  newLiabilityId: string,
  auditId: string,
  archiveAuditId: string,
  at: number,
  sortOrder: number,
): Promise<{ statements: Statement[]; applied: ConsolidationResult['applied'][number] }> {
  await verifyAnchor(client, ctx, anchor)
  await assertNoCycle(client, ctx, liabilities, newLiabilityId, anchor.liabilityId)

  const statements: Statement[] = [
    client.db.insert(liabilities).values({
      id: newLiabilityId,
      householdId: ctx.householdId,
      name: anchor.liabilityName,
      amountMinor: anchor.correctedAmountMinor,
      cardId: anchor.cardId,
      reversesId: anchor.liabilityId,
      sortOrder,
      createdAt: at,
    }) as unknown as Statement,
    client.db
      .update(accounts)
      .set({ archivedAt: at })
      .where(and(eq(accounts.householdId, ctx.householdId), eq(accounts.id, anchor.accountId))) as unknown as Statement,
    recordAudit(client, ctx, {
      id: auditId,
      action: 'create',
      entity: 'liabilities',
      entityId: newLiabilityId,
      before: null,
      after: {
        amountMinor: anchor.correctedAmountMinor,
        cardId: anchor.cardId,
        reversesId: anchor.liabilityId,
        decision: 'D7',
      },
      at,
    }),
    recordAudit(client, ctx, {
      id: archiveAuditId,
      action: 'archive',
      entity: 'accounts',
      entityId: anchor.accountId,
      before: { archivedAt: null },
      after: { archivedAt: at },
      at,
    }),
  ]

  return {
    statements,
    applied: {
      card,
      correctingLiabilityId: newLiabilityId,
      amountMinor: anchor.correctedAmountMinor,
      reverses: anchor.liabilityId,
      archivedAccountId: anchor.accountId,
    },
  }
}

/**
 * Applies the settled D7/HSBC consolidation (spec FR-020–FR-025) to the
 * caller's household: per card, one atom inserting a correcting
 * `liabilities` row and archiving the unreachable `accounts` row, each
 * with its own audit entry. `assertAdmin` — a financial correction (spec
 * FR-008). Idempotency is structural: the partial unique index on
 * `liabilities.reverses_id` refuses a second application outright, and
 * `verifyAnchor` also catches it earlier with a clearer error.
 */
export async function applyCardConsolidation(
  client: AppClient,
  ctx: HouseholdContext,
  input: ApplyCardConsolidationInput,
): Promise<ConsolidationResult> {
  assertAdmin(ctx)

  const existingSortOrders = await client.db
    .select({ sortOrder: liabilities.sortOrder })
    .from(liabilities)
    .where(eq(liabilities.householdId, ctx.householdId))
  const maxSortOrder = existingSortOrders.reduce((max, r) => Math.max(max, r.sortOrder), 0)

  const adib = await buildAnchorStatements(
    client,
    ctx,
    ADIB,
    'ADIB',
    input.ids.adibLiabilityId,
    input.ids.adibAuditId,
    input.ids.adibArchiveAuditId,
    input.at,
    maxSortOrder + 1,
  )
  const hsbc = await buildAnchorStatements(
    client,
    ctx,
    HSBC,
    'HSBC',
    input.ids.hsbcLiabilityId,
    input.ids.hsbcAuditId,
    input.ids.hsbcArchiveAuditId,
    input.at,
    maxSortOrder + 2,
  )

  await atomically(client, [...adib.statements, ...hsbc.statements])

  return { applied: [adib.applied, hsbc.applied] }
}
