import { eq } from 'drizzle-orm'
import { createLocalClient } from '../db/client-local'
import { users } from '../db/schema/index'
import { claimMigratedHousehold, findUnclaimedMigratedHouseholdId } from '../lib/data/provisioning'
import { newId, now } from '../lib/runtime/index'

/**
 * `npm run claim -- --email <owner> [--db <path>]` (T029, research.md R4 —
 * the recovery path).
 *
 * For the residual mis-designation edge: `OWNER_EMAIL` was set to the wrong
 * address, so the real owner already signed in and was provisioned an
 * ordinary household instead of claiming the migrated one. This repoints the
 * migrated household's owner membership to the real user **and** parks
 * their empty auto-provisioned shell in the same atom — refusing outright if
 * that shell holds any domain row, since parking it would then discard real
 * data (`claimMigratedHousehold`'s precondition). Exits non-zero with the
 * stated reason on any refusal; nothing is ever deleted.
 */

function argValue(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag)
  if (index === -1) return fallback
  const value = process.argv[index + 1]
  if (value === undefined || value.startsWith('--')) {
    console.error(`${flag} needs a value`)
    process.exit(2)
  }
  return value
}

const email = argValue('--email', '')
if (email === '') {
  console.error('Usage: npm run claim -- --email <owner> [--db <path>]')
  process.exit(2)
}

const dbPath = argValue('--db', process.env.LOCAL_DB_PATH ?? '.data/local.db')
const client = createLocalClient(dbPath)

try {
  const migratedHouseholdId = await findUnclaimedMigratedHouseholdId(client)
  if (migratedHouseholdId === null) {
    console.error('No unclaimed migrated household exists in this database. Nothing to claim.')
    process.exit(1)
  }

  const userRows = await client.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  const user = userRows[0]
  if (user === undefined) {
    console.error(`No user with email ${email} in ${dbPath}. They must sign in at least once first.`)
    process.exit(1)
  }

  await claimMigratedHousehold(client, {
    migratedHouseholdId,
    newOwnerUserId: user.id,
    recoverEmptyShell: true,
    ids: { auditId: newId(), shellAuditId: newId() },
    at: now(),
  })

  console.log(`Claimed household ${migratedHouseholdId} for ${email} (${user.id}).`)
  console.log('Their previously auto-provisioned shell household has been parked (not deleted).')
} catch (error) {
  console.error(`\nRefusing to claim.\n\n${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
} finally {
  client.raw.close()
}
