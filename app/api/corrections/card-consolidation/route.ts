import { requireContext } from '../../../../lib/auth/context'
import { applyCardConsolidation } from '../../../../lib/data/index'
import { newId, now } from '../../../../lib/runtime/index'
import { json, respondToError } from '../../_lib/respond'
import { getRuntime } from '../../_lib/runtime'

/**
 * `POST /api/corrections/card-consolidation` (T044, contracts/http-api.md).
 *
 * No request body — the operation's content is fixed by the D7 decision
 * register, nothing parameterized. Admin role (`applyCardConsolidation`
 * asserts it).
 */
export async function POST(request: Request): Promise<Response> {
  const { client, env } = getRuntime()
  try {
    const context = await requireContext(request, client, env)
    const result = await applyCardConsolidation(client, context, {
      ids: {
        adibLiabilityId: newId(),
        adibAuditId: newId(),
        adibArchiveAuditId: newId(),
        hsbcLiabilityId: newId(),
        hsbcAuditId: newId(),
        hsbcArchiveAuditId: newId(),
      },
      at: now(),
    })
    return json(200, result)
  } catch (error) {
    return respondToError(error)
  }
}
