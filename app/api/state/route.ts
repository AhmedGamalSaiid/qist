import { requireContext } from '../../../lib/auth/context'
import { createRepository, loadHouseholdState } from '../../../lib/data/index'
import { todayFor } from '../../../lib/derive/dates'
import { now } from '../../../lib/runtime/index'
import { json, respondToError } from '../_lib/respond'
import { getRuntime } from '../_lib/runtime'

/**
 * `GET /api/state` — the one aggregated read (T022, contracts/http-api.md,
 * spec FR-010). Household scope comes exclusively from `requireContext`; no
 * request field influences it.
 */
export async function GET(request: Request): Promise<Response> {
  const { client, env } = getRuntime()

  try {
    const context = await requireContext(request, client, env)
    const repository = createRepository(client, context)
    const today = todayFor(context, new Date(now()))
    const state = await loadHouseholdState(repository, { today })

    return json(200, state)
  } catch (error) {
    return respondToError(error)
  }
}
