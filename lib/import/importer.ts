import type { AppClient, Statement } from '../../db/client'
import {
  accounts,
  auditLog,
  cards,
  households,
  incomeSettings,
  installments,
  liabilities,
  memberships,
  propertyHoldings,
  rates,
  snapshots,
  transactions,
  users,
} from '../../db/schema/index'
import { atomically } from '../data/atomically'
import type { IsoDate } from '../money/types'
import type { Dump } from './dump'
import { derivedHouseholdId, derivedId } from './ids'
import { mapAccounts, mapInstallments, mapLiabilities, mapPropertyHoldings, mapRates, mapTransactions } from './mappers'
import { mapCards, mapIncomeSettings } from './mappers-cards'
import { mapSnapshots } from './mappers-history'
import { timezonePreflight } from './preflight'
import { validateDump } from './validate'

/**
 * The importer (T059).
 *
 *   preflight -> validate -> map -> derive ids -> one atomic write
 *
 * **All tables or none** (FR-005a). A partial import is not idempotent and
 * would leave the reconciliation report reading against a half-populated
 * database — which is worse than no import, because the report would look
 * clean while comparing wrong numbers.
 *
 * Every statement is built before the atom opens, because that is the only
 * shape `atomically` accepts (R9a). The upserts are therefore written as
 * `INSERT ... ON CONFLICT DO UPDATE` rather than as read-then-decide: with
 * deterministic ids, re-importing the same dump rewrites the same rows with
 * the same values, which is what makes the second run a no-op (FR-003).
 */

export interface ImportOptions {
  /** Defaults to the household's own timezone from the dump's spreadsheet. */
  readonly householdName?: string
  readonly householdTimezone?: string
  readonly ownerEmail?: string
  /** Injected so an import is reproducible and testable. */
  readonly now: number
}

export interface ImportCounts {
  households: number
  users: number
  memberships: number
  accounts: number
  propertyHoldings: number
  liabilities: number
  installments: number
  transactions: number
  cards: number
  cardPayments: number
  incomeSettings: number
  rates: number
  snapshots: number
}

export interface ImportResult {
  readonly householdId: string
  readonly counts: ImportCounts
  readonly preflight: { sourceTimezone: string; householdTimezone: string; date: string }
}

export const DEFAULT_HOUSEHOLD_TIMEZONE = 'Africa/Cairo'
export const DEFAULT_OWNER_EMAIL = 'owner@household.local'

export async function importDump(
  client: AppClient,
  dump: Dump,
  options: ImportOptions,
): Promise<ImportResult> {
  const householdId = derivedHouseholdId(dump.spreadsheetId)
  const timezone = options.householdTimezone ?? DEFAULT_HOUSEHOLD_TIMEZONE

  // The preflight reads the household's *configured* zone, not a constant.
  // On a first import the household row does not exist yet, so the value that
  // is about to be written is what it checks against — the same value either
  // way, and checking a hardcoded string would stop being a check the moment
  // the household moved.
  const preflight = timezonePreflight(dump, { timezone })
  validateDump(dump)

  const createdAt = options.now
  const ownerEmail = options.ownerEmail ?? DEFAULT_OWNER_EMAIL
  const ownerId = derivedId(householdId, 'users', ownerEmail)

  const mappedAccounts = mapAccounts(dump, householdId, createdAt)
  const mappedProperty = mapPropertyHoldings(dump, householdId, createdAt)
  const mappedLiabilities = mapLiabilities(dump, householdId, createdAt)
  const mappedInstallments = mapInstallments(dump, householdId, createdAt)
  const mappedRates = mapRates(dump, householdId, createdAt)
  const mappedCards = mapCards(dump, householdId, createdAt)
  const mappedIncome = mapIncomeSettings(dump, householdId, createdAt)
  const mappedSnapshots = mapSnapshots(dump, householdId, createdAt)

  const accountIdByName = new Map(mappedAccounts.map((a) => [a.name, a.id]))
  const rateIdFor = (assetClass: 'USD', onDate: IsoDate): string => {
    const candidates = mappedRates
      .filter((r) => r.assetClass === assetClass && r.asOf <= onDate)
      .sort((a, b) => (a.asOf < b.asOf ? 1 : -1))
    const chosen = candidates[0]
    if (chosen === undefined) {
      throw new TypeError(
        `No ${assetClass} rate in the dump is dated on or before ${onDate}, ` +
          `so the transaction on that date cannot pin one. Conversion is never ` +
          `resolved forward to a later rate (FR-043).`,
      )
    }
    return chosen.id
  }

  const mappedTransactions = mapTransactions(dump, householdId, createdAt, {
    createdBy: ownerId,
    accountIdByName,
    rateIdFor,
  })

  const db = client.db
  const statements: Statement[] = []

  statements.push(
    db
      .insert(households)
      .values({
        id: householdId,
        name: options.householdName ?? dump.spreadsheetName,
        baseCurrency: 'EGP',
        timezone,
        createdAt,
      })
      .onConflictDoUpdate({
        target: households.id,
        set: { name: options.householdName ?? dump.spreadsheetName, timezone },
      }) as unknown as Statement,
  )

  statements.push(
    db
      .insert(users)
      .values({ id: ownerId, email: ownerEmail, name: null, image: null, createdAt })
      .onConflictDoUpdate({ target: users.id, set: { email: ownerEmail } }) as unknown as Statement,
  )

  statements.push(
    db
      .insert(memberships)
      .values({
        id: derivedId(householdId, 'memberships', ownerEmail),
        householdId,
        userId: ownerId,
        role: 'owner',
        joinedAt: createdAt,
      })
      .onConflictDoUpdate({
        target: memberships.id,
        set: { role: 'owner' },
      }) as unknown as Statement,
  )

  for (const row of mappedAccounts) {
    statements.push(
      db
        .insert(accounts)
        .values(row)
        .onConflictDoUpdate({ target: accounts.id, set: withoutId(row) }) as unknown as Statement,
    )
  }
  for (const row of mappedProperty) {
    statements.push(
      db
        .insert(propertyHoldings)
        .values(row)
        .onConflictDoUpdate({
          target: propertyHoldings.id,
          set: withoutId(row),
        }) as unknown as Statement,
    )
  }
  for (const row of mappedLiabilities) {
    statements.push(
      db
        .insert(liabilities)
        .values(row)
        .onConflictDoUpdate({ target: liabilities.id, set: withoutId(row) }) as unknown as Statement,
    )
  }
  // Rates are written before transactions so the composite FK on `rate_id`
  // resolves inside the same atom.
  for (const row of mappedRates) {
    statements.push(
      db
        .insert(rates)
        .values(row)
        .onConflictDoUpdate({ target: rates.id, set: withoutId(row) }) as unknown as Statement,
    )
  }
  for (const row of mappedInstallments) {
    statements.push(
      db
        .insert(installments)
        .values(row)
        .onConflictDoUpdate({ target: installments.id, set: withoutId(row) }) as unknown as Statement,
    )
  }
  for (const row of mappedCards) {
    statements.push(
      db
        .insert(cards)
        .values(row)
        .onConflictDoUpdate({ target: cards.id, set: withoutId(row) }) as unknown as Statement,
    )
  }
  for (const row of mappedTransactions) {
    statements.push(
      db
        .insert(transactions)
        .values(row)
        .onConflictDoUpdate({ target: transactions.id, set: withoutId(row) }) as unknown as Statement,
    )
  }
  for (const row of mappedSnapshots) {
    statements.push(
      db
        .insert(snapshots)
        .values(row)
        .onConflictDoUpdate({ target: snapshots.id, set: withoutId(row) }) as unknown as Statement,
    )
  }

  statements.push(
    db
      .insert(incomeSettings)
      .values(mappedIncome)
      .onConflictDoUpdate({
        target: incomeSettings.householdId,
        set: {
          salaryMinor: mappedIncome.salaryMinor,
          salaryCurrency: mappedIncome.salaryCurrency,
          payDay: mappedIncome.payDay,
          updatedAt: mappedIncome.updatedAt,
        },
      }) as unknown as Statement,
  )

  // The audit entry is composed into the same atom as the writes it records.
  // An audit entry that can commit separately from its write is not a record
  // of it (Principle II, FR-013).
  statements.push(
    db
      .insert(auditLog)
      .values({
        id: derivedId(householdId, 'audit_log', `import|${dump.extractedAt}`),
        householdId,
        actorId: ownerId,
        actorKind: 'user',
        action: 'import',
        entity: 'household',
        entityId: householdId,
        beforeJson: null,
        afterJson: JSON.stringify({
          dumpExtractedAt: dump.extractedAt,
          spreadsheetId: dump.spreadsheetId,
          sourceTimezone: dump.sourceTimeZone,
        }),
        at: createdAt,
      })
      .onConflictDoUpdate({ target: auditLog.id, set: { at: createdAt } }) as unknown as Statement,
  )

  await atomically(client, statements)

  return {
    householdId,
    counts: {
      households: 1,
      users: 1,
      memberships: 1,
      accounts: mappedAccounts.length,
      propertyHoldings: mappedProperty.length,
      liabilities: mappedLiabilities.length,
      installments: mappedInstallments.length,
      transactions: mappedTransactions.length,
      cards: mappedCards.length,
      // `CC Payments!A2:F10` is genuinely empty. The table exists so feature
      // 004 has somewhere to write.
      cardPayments: 0,
      incomeSettings: 1,
      rates: mappedRates.length,
      snapshots: mappedSnapshots.length,
    },
    preflight: {
      sourceTimezone: preflight.sourceTimezone,
      householdTimezone: preflight.householdTimezone,
      date: preflight.sourceDate,
    },
  }
}

function withoutId<T extends { id?: unknown }>(row: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = row
  return rest
}
