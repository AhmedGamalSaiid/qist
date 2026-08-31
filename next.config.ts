import type { NextConfig } from 'next'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

/**
 * Headless by design (spec, UI / Design Constraint). This feature ships no
 * page, layout, or component — the App Router surface is `app/api/**` route
 * handlers only.
 */

initOpenNextCloudflareForDev()

const nextConfig: NextConfig = {}

export default nextConfig
