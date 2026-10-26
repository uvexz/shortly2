import { createFileRoute } from '@tanstack/react-router'
import { initDb } from '@/db'
import { jsonResponse } from '@/lib/api-response'
import { PUBLIC_CONFIG_CACHE_CONTROL } from '@/lib/cache'
import {
  getActiveEmailDomains,
  getActiveShortDomains,
} from '@/lib/site-domains'
import { getSiteSettings } from '@/lib/site-settings'

export const Route = createFileRoute('/api/domains')({
  server: {
    handlers: {
      GET: async () => {
        await initDb()

        const [emailDomains, shortDomains, settings] = await Promise.all([
          getActiveEmailDomains(),
          getActiveShortDomains(),
          getSiteSettings(),
        ])

        return jsonResponse(
          {
            emailDomains: emailDomains.map((item) => ({
              host: item.host,
              isDefault: item.isDefaultEmailDomain,
              minLocalPartLength: item.minLocalPartLength,
            })),
            shortDomains: shortDomains.map((item) => ({
              host: item.host,
              isDefault: item.isDefaultShortDomain,
              minSlugLength: item.minSlugLength,
            })),
            telegramBotUsername: settings?.telegramBotUsername || '',
          },
          { headers: { 'Cache-Control': PUBLIC_CONFIG_CACHE_CONTROL } },
        )
      },
    },
  },
})
