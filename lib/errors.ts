/**
 * Typed failures (T095).
 *
 * Every one of these exists because the alternative is a silent wrong number.
 * Each message states what was wrong and what to do about it — a bare
 * `Error("missing rate")` would satisfy the type system and nothing else.
 */

export class MissingRateError extends Error {
  readonly assetClass: string
  readonly onDate: string
  readonly earliestKnown: string | null

  constructor(assetClass: string, onDate: string, earliestKnown: string | null) {
    const known =
      earliestKnown === null
        ? `no ${assetClass} rate has been recorded at all`
        : `the earliest recorded ${assetClass} rate is dated ${earliestKnown}`
    super(
      `No ${assetClass} rate is in force on ${onDate}: ${known}. ` +
        `Record a rate dated on or before ${onDate} and retry. ` +
        `A missing rate is never treated as zero and never resolved forward to a later rate (FR-019, FR-043).`,
    )
    this.name = 'MissingRateError'
    this.assetClass = assetClass
    this.onDate = onDate
    this.earliestKnown = earliestKnown
  }
}

export class IncompleteDumpError extends Error {
  readonly missing: string[]

  constructor(missing: string[]) {
    super(
      `The spreadsheet dump is incomplete and will not be imported (FR-002). Missing or truncated:\n` +
        missing.map((m) => `  - ${m}`).join('\n') +
        `\nRe-extract the sheet and retry. A partial import would leave the reconciliation ` +
        `report reading against a half-populated database.`,
    )
    this.name = 'IncompleteDumpError'
    this.missing = missing
  }
}

export class TimezonePreflightError extends Error {
  readonly sourceTimezone: string
  readonly householdTimezone: string
  readonly extractedAt: string
  readonly sourceDate: string
  readonly householdDate: string

  constructor(args: {
    sourceTimezone: string
    householdTimezone: string
    extractedAt: string
    sourceDate: string
    householdDate: string
  }) {
    super(
      `Timezone preflight failed (FR-048). The dump was extracted at ${args.extractedAt}, ` +
        `which is ${args.sourceDate} in the spreadsheet's zone (${args.sourceTimezone}) ` +
        `but ${args.householdDate} in the household's zone (${args.householdTimezone}). ` +
        `Every TODAY()-dependent figure in the dump is therefore internally inconsistent with ` +
        `the dates this system will compute. Re-extract the sheet outside the window where the ` +
        `two zones disagree, or switch the spreadsheet's timezone to ${args.householdTimezone}.`,
    )
    this.name = 'TimezonePreflightError'
    this.sourceTimezone = args.sourceTimezone
    this.householdTimezone = args.householdTimezone
    this.extractedAt = args.extractedAt
    this.sourceDate = args.sourceDate
    this.householdDate = args.householdDate
  }
}

export class CorrectionCycleError extends Error {
  readonly chain: string[]

  constructor(chain: string[]) {
    super(
      `This correction would create a cycle in the reverses_id chain and was rejected. ` +
        `Chain walked: ${chain.join(' -> ')}. ` +
        `A correction may itself be corrected — that is a linear chain and is allowed — ` +
        `but a cycle would make the net effect of the ledger undefined.`,
    )
    this.name = 'CorrectionCycleError'
    this.chain = chain
  }
}

/**
 * Feature 004's typed failures (contracts/data-layer.md). Each maps to
 * exactly one HTTP outcome in `app/api/_lib/respond.ts` — one mapping table,
 * never per-handler discretion.
 */

export class UnauthenticatedError extends Error {
  constructor() {
    super('No valid session is present. Sign in and retry.')
    this.name = 'UnauthenticatedError'
  }
}

export class NoHouseholdError extends Error {
  readonly userId: string

  constructor(userId: string) {
    super(
      `User ${userId} holds no household membership. Provisioning happens on first sign-in ` +
        `(the auth hook), never as a side effect of a read.`,
    )
    this.name = 'NoHouseholdError'
    this.userId = userId
  }
}

export class MultipleHouseholdsError extends Error {
  readonly userId: string
  readonly householdIds: string[]

  constructor(userId: string, householdIds: string[]) {
    super(
      `User ${userId} holds ${householdIds.length} household memberships (${householdIds.join(', ')}), ` +
        `so no single context can be resolved. Membership management is deferred; failing loudly beats guessing.`,
    )
    this.name = 'MultipleHouseholdsError'
    this.userId = userId
    this.householdIds = householdIds
  }
}

export class UnauthorizedRoleError extends Error {
  readonly role: string
  readonly requires: 'writer' | 'admin'

  constructor(role: string, requires: 'writer' | 'admin') {
    super(`Role "${role}" cannot perform this action; it requires ${requires} or above.`)
    this.name = 'UnauthorizedRoleError'
    this.role = role
    this.requires = requires
  }
}

export class OwnerUnconfiguredError extends Error {
  constructor() {
    super(
      `An unclaimed migrated household exists and OWNER_EMAIL is not configured. Sign-in is ` +
        `refused rather than silently provisioning a competing shell household — set OWNER_EMAIL ` +
        `to the migrated household's real owner and retry (research.md R4).`,
    )
    this.name = 'OwnerUnconfiguredError'
  }
}

export class CardNotFoundError extends Error {
  readonly cardId: string

  constructor(cardId: string) {
    super(`No card ${cardId} in this household.`)
    this.name = 'CardNotFoundError'
    this.cardId = cardId
  }
}

export interface ValidationReason {
  readonly field: string
  readonly message: string
}

export class CardValidationError extends Error {
  readonly reasons: ValidationReason[]

  constructor(reasons: ValidationReason[]) {
    super(`Card input is invalid: ${reasons.map((r) => `${r.field} — ${r.message}`).join('; ')}`)
    this.name = 'CardValidationError'
    this.reasons = reasons
  }
}

export class ProvisioningConflictError extends Error {
  readonly userId: string

  constructor(userId: string) {
    super(`User ${userId} already holds a household membership; provisioning refuses to add a second one.`)
    this.name = 'ProvisioningConflictError'
    this.userId = userId
  }
}

export class ClaimAlreadyMadeError extends Error {
  readonly householdId: string

  constructor(householdId: string) {
    super(
      `Household ${householdId}'s owner membership no longer belongs to the importer's placeholder ` +
        `user — it has already been claimed. A claim is one-time by construction.`,
    )
    this.name = 'ClaimAlreadyMadeError'
    this.householdId = householdId
  }
}

export class AlreadyAppliedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AlreadyAppliedError'
  }
}

export class NotApplicableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotApplicableError'
  }
}
