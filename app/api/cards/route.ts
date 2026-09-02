import { requireContext } from '../../../lib/auth/context'
import { createCard, createRepository } from '../../../lib/data/index'
import { newId, now } from '../../../lib/runtime/index'
import { cardResponseShape } from '../_lib/card-shape'
import { json, respondToError } from '../_lib/respond'
import { getRuntime } from '../_lib/runtime'

/**
 * `GET`/`POST /api/cards` (T035, contracts/http-api.md).
 *
 * `GET` — any authenticated member (viewer included), the caller's
 * household only, ordered by `sortOrder`. `POST` — writer role
 * (`createCard` asserts it), `201` with the created card.
 */

export async function GET(request: Request): Promise<Response> {
  const { client, env } = getRuntime()
  try {
    const context = await requireContext(request, client, env)
    const repository = createRepository(client, context)
    const [cardRows, liabilities] = await Promise.all([
      repository.ledger.cards(),
      repository.holdings.liabilities(),
    ])
    return json(200, { cards: cardRows.map((row) => cardResponseShape(row, liabilities)) })
  } catch (error) {
    return respondToError(error)
  }
}

export async function POST(request: Request): Promise<Response> {
  const { client, env } = getRuntime()
  try {
    const context = await requireContext(request, client, env)
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

    const id = newId()
    await createCard(client, context, { ...body, id, auditId: newId(), at: now() })

    const repository = createRepository(client, context)
    const [cardRows, liabilities] = await Promise.all([
      repository.ledger.cards(),
      repository.holdings.liabilities(),
    ])
    const created = cardRows.find((row) => row.id === id)
    if (created === undefined) {
      throw new Error(`createCard reported success but card ${id} is not readable afterward.`)
    }

    return json(201, cardResponseShape(created, liabilities))
  } catch (error) {
    return respondToError(error)
  }
}
