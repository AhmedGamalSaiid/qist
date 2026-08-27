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
