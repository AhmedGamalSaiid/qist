import type { ValidationReason } from '../errors'

/**
 * Card input validation (T032, spec FR-017).
 *
 * Full-reasons — every applicable rule is checked and every violation
 * reported, never first-failure-only, so a single `422` response tells the
 * caller everything wrong with their submission at once.
 *
 * Input arrives as whatever a JSON request body actually contains, which is
 * not guaranteed to match `CardInput`'s shape (a float `limitMinor`, a
 * numeric `name`, ...) — every field is read as `unknown` and validated
 * defensively rather than assumed.
 */

export interface CardInput {
  readonly name: string
  /** `null` clears (update only); omitted on create means "leave unset". */
  readonly limitMinor?: number | null
  readonly statementDay?: number | null
  readonly dueDay?: number | null
}

export interface RawCardInput {
  readonly name?: unknown
  readonly limitMinor?: unknown
  readonly statementDay?: unknown
  readonly dueDay?: unknown
}

const NAME_MAX_LENGTH = 120

/**
 * `mode: 'create'` requires `name`; `mode: 'update'` validates only the
 * fields present in `input` (any subset), matching FR-015's "including
 * setting a previously unset field and clearing an optional field."
 *
 * `existingNamesLowercase` feeds the case-insensitive uniqueness check from
 * the caller's own pre-read (create: every other card's name in the
 * household; update: every other card's name, excluding the one being
 * updated). This is UX — the full reasons list — not the integrity
 * guarantee, which is the `cards_household_name_unique` index (R7).
 */
export function validateCardInput(
  input: RawCardInput,
  options: { mode: 'create' | 'update'; existingNamesLowercase: ReadonlySet<string> },
): ValidationReason[] {
  const reasons: ValidationReason[] = []

  if (options.mode === 'create' || 'name' in input) {
    validateName(input.name, options.existingNamesLowercase, reasons)
  }

  if (input.limitMinor !== undefined) {
    validateNonNegativeIntegerOrNull('limitMinor', input.limitMinor, reasons)
  }
  if (input.statementDay !== undefined) {
    validateDayOrNull('statementDay', input.statementDay, reasons)
  }
  if (input.dueDay !== undefined) {
    validateDayOrNull('dueDay', input.dueDay, reasons)
  }

  return reasons
}

function validateName(
  value: unknown,
  existingNamesLowercase: ReadonlySet<string>,
  reasons: ValidationReason[],
): void {
  if (typeof value !== 'string') {
    reasons.push({ field: 'name', message: 'is required and must be a string' })
    return
  }
  const trimmed = value.trim()
  if (trimmed === '') {
    reasons.push({ field: 'name', message: 'must not be empty' })
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    reasons.push({ field: 'name', message: `must be ${NAME_MAX_LENGTH} characters or fewer` })
  }
  if (trimmed !== '' && existingNamesLowercase.has(trimmed.toLowerCase())) {
    reasons.push({ field: 'name', message: 'must be unique within the household (case-insensitive)' })
  }
}

function validateNonNegativeIntegerOrNull(field: string, value: unknown, reasons: ValidationReason[]): void {
  if (value === null) return
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    reasons.push({ field, message: 'must be a non-negative integer (minor units), or null' })
  }
}

function validateDayOrNull(field: string, value: unknown, reasons: ValidationReason[]): void {
  if (value === null) return
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 31) {
    reasons.push({ field, message: 'must be an integer from 1 to 31, or null' })
  }
}

/** The cleaned, trimmed name — call only after `validateCardInput` reports no reasons. */
export function cleanName(name: unknown): string {
  return String(name).trim()
}
