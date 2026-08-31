import { requireContext } from '../../../../lib/auth/context'
import { createRepository, updateCard } from '../../../../lib/data/index'
import { newId, now } from '../../../../lib/runtime/index'
import { cardResponseShape } from '../../_lib/card-shape'
import { json, respondToError } from '../../_lib/respond'
import { getRuntime } from '../../_lib/runtime'

/**
 * `PATCH /api/cards/{id}` (T036, contracts/http-api.md) — writer role
 * (`updateCard` asserts it). `{id}` resolves only within the caller's
 * household; anything else is the uniform `404` (`CardNotFoundError`).
 * Deliberately no `DELETE` (card archival is deferred).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { client, env } = getRuntime()
  try {
    const { id } = await params
    const context = await requireContext(request, client, env)
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

    await updateCard(client, context, { ...body, cardId: id, auditId: newId(), at: now() })

    const repository = createRepository(client, context)
    const [cardRows, liabilities] = await Promise.all([
      repository.ledger.cards(),
      repository.holdings.liabilities(),
    ])
    const updated = cardRows.find((row) => row.id === id)
    if (updated === undefined) {
      throw new Error(`updateCard reported success but card ${id} is not readable afterward.`)
    }

    return json(200, cardResponseShape(updated, liabilities))
  } catch (error) {
    return respondToError(error)
  }
}
