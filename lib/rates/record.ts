import type { AppClient, Statement } from '../../db/client'
import { rates } from '../../db/schema/index'
import { atomically } from '../data/atomically'
import { recordAudit } from '../data/audit'
import type { HouseholdContext } from '../data/context'
import type { ConvertibleClass, IsoDate, MinorUnits } from '../money/types'
import { RATE_SCALE } from '../money/types'

/**
 * The rate write path (T085, FR-038, FR-039).
 *
 * **Append-only, and one path for every source.** Recording a rate inserts; it
 * never updates. Superseding a rate does not remove it, so the history stays
 * complete and a past figure stays reproducible.
 *
 * Manual, imported and fetched rates all go through here. A fetch that wrote
 * by some other route would be a second write path with its own bugs and its
 * own audit story, which is how "the automated rate is different somehow"
 * becomes true.
 */

export type RateSource = 'manual' | 'fetch' | 'imported'

export interface RecordRateInput {
  readonly id: string
  readonly assetClass: ConvertibleClass
  readonly rateMinor: MinorUnits
  readonly asOf: IsoDate
  readonly source: RateSource
  readonly at: number
  readonly auditId: string
  /** Overrides the class default; the stored scale is what makes a rate readable. */
  readonly scale?: number
}

export async function recordRate(
  client: AppClient,
  ctx: HouseholdContext,
  input: RecordRateInput,
): Promise<void> {
  const scale = input.scale ?? RATE_SCALE[input.assetClass]

  const statements: Statement[] = [
    client.db.insert(rates).values({
      id: input.id,
      householdId: ctx.householdId,
      assetClass: input.assetClass,
      rateMinor: input.rateMinor,
      scale,
      asOf: input.asOf,
      source: input.source,
      // A fetched rate has no user behind it. The `fetch` source is itself the
      // attributable actor (FR-039) — inventing a user id would make the audit
      // trail say something untrue.
      createdBy: input.source === 'fetch' ? null : ctx.userId,
      createdAt: input.at,
    }) as unknown as Statement,
    recordAudit(client, ctx, {
      id: input.auditId,
      action: 'create',
      entity: 'rates',
      entityId: input.id,
      after: { assetClass: input.assetClass, rateMinor: input.rateMinor, asOf: input.asOf, source: input.source },
      at: input.at,
      actorKind: input.source === 'fetch' ? 'system' : 'user',
    }),
  ]

  await atomically(client, statements)
}
