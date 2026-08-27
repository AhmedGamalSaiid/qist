import type { AppClient, Statement } from '../../db/client'
import { households, memberships, users } from '../../db/schema/index'
import { atomically } from '../../lib/data/atomically'
import type { HouseholdContext } from '../../lib/data/context'

/** Build a household with an owner, for tests that do not import the dump. */
export async function seedHousehold(
  client: AppClient,
  options: { id: string; userId: string; email: string; at?: number },
): Promise<HouseholdContext> {
  const at = options.at ?? 1_787_000_000_000
  const statements: Statement[] = [
    client.db.insert(households).values({
      id: options.id,
      name: `Household ${options.id}`,
      baseCurrency: 'EGP',
      timezone: 'Africa/Cairo',
      createdAt: at,
    }) as unknown as Statement,
    client.db.insert(users).values({
      id: options.userId,
      email: options.email,
      name: null,
      image: null,
      createdAt: at,
    }) as unknown as Statement,
    client.db.insert(memberships).values({
      id: `${options.id}-${options.userId}`,
      householdId: options.id,
      userId: options.userId,
      role: 'owner',
      joinedAt: at,
    }) as unknown as Statement,
  ]

  await atomically(client, statements)

  return {
    householdId: options.id,
    userId: options.userId,
    role: 'owner',
    timezone: 'Africa/Cairo',
    baseCurrency: 'EGP',
  }
}
