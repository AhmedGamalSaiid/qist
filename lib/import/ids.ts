import { createHash } from 'node:crypto'

/**
 * Deterministic import identifiers (T031, FR-003, SC-006).
 *
 *     id = ulid_from(sha256(household_id || table || natural_key)[0:16])
 *
 * Random ULIDs cannot satisfy FR-003: a re-import would produce a fresh set of
 * ids for the same rows, so the second run would not be a no-op and SC-006's
 * byte-identical re-run would be impossible to assert. Deriving the id from
 * the row's natural key makes the same dump always produce the same ids.
 *
 * The 128 bits are laid into ULID's Crockford base-32 encoding directly, so
 * ids stay 26 characters and no column type changes. They are *not*
 * time-sortable — `sort_order` and `created_at` carry ordering instead, which
 * is why every imported table already has one.
 *
 * **Row order is load-bearing.** The sheet has no stable identifier of its
 * own, so the row number is the natural key. Reordering rows in the source and
 * re-importing would rewrite ids. The dump is a frozen artifact, so this holds
 * for this migration; it does not survive a second extraction and must not be
 * relied on past cutover.
 */

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const ULID_LENGTH = 26

/** Encode 16 bytes as a 26-character Crockford base-32 string. */
export function ulidFromBytes(bytes: Uint8Array): string {
  if (bytes.length !== 16) {
    throw new TypeError(`A ULID is 16 bytes; got ${bytes.length}`)
  }

  let value = 0n
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte)
  }

  let out = ''
  for (let i = 0; i < ULID_LENGTH; i += 1) {
    const index = Number(value & 31n)
    out = CROCKFORD[index] + out
    value >>= 5n
  }
  return out
}

/**
 * Tables the importer writes, with the natural key each uses. Keeping the set
 * closed means a new imported table has to declare its key rather than
 * silently inheriting someone else's.
 */
export type ImportTable =
  | 'households'
  | 'users'
  | 'memberships'
  | 'accounts'
  | 'property_holdings'
  | 'liabilities'
  | 'transactions'
  | 'installments'
  | 'cards'
  | 'rates'
  | 'snapshots'
  | 'audit_log'

export function derivedId(householdId: string, table: ImportTable, naturalKey: string): string {
  const digest = createHash('sha256')
    .update(householdId, 'utf8')
    .update(table, 'utf8')
    .update(naturalKey, 'utf8')
    .digest()
  return ulidFromBytes(new Uint8Array(digest.subarray(0, 16)))
}

/**
 * The household's own id is derived from the source spreadsheet, so importing
 * the same workbook twice targets the same household rather than creating a
 * second one.
 */
export function derivedHouseholdId(spreadsheetId: string): string {
  const digest = createHash('sha256')
    .update('household', 'utf8')
    .update(spreadsheetId, 'utf8')
    .digest()
  return ulidFromBytes(new Uint8Array(digest.subarray(0, 16)))
}
