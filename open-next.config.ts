import { defineCloudflareConfig } from '@opennextjs/cloudflare'

/**
 * Local dev + CI bundle check only (research.md R10). Production deployment
 * configuration (routes, custom domains, cron) remains deferred.
 */
export default defineCloudflareConfig()
