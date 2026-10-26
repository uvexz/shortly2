import { eq } from 'drizzle-orm'
import { db, initDb } from '@/db'
import { siteSetting } from '@/db/schema'
import { createTtlCache } from '@/lib/cache'

type SiteSettingsRecord = Awaited<ReturnType<typeof readSiteSettingsFromDb>>

async function readSiteSettingsFromDb() {
  await initDb()
  return db
    .select()
    .from(siteSetting)
    .where(eq(siteSetting.id, 'default'))
    .get()
}

async function ensureSiteSettingsDbReady() {
  await initDb()
}

const siteSettingsStore = createTtlCache<SiteSettingsRecord>(30_000)

export async function getSiteSettings() {
  return siteSettingsStore.get(readSiteSettingsFromDb)
}

export async function getSiteSettingsFresh() {
  return readSiteSettingsFromDb()
}

type SiteSettingsWriteInput = {
  siteName?: string
  siteUrl?: string
  telegramBotUsername?: string
  userMaxLinksPerHour?: number
}

function buildSiteSettingsWrite(input: SiteSettingsWriteInput) {
  return {
    ...(input.siteName === undefined ? {} : { siteName: input.siteName }),
    ...(input.siteUrl === undefined ? {} : { siteUrl: input.siteUrl }),
    ...(input.telegramBotUsername === undefined
      ? {}
      : { telegramBotUsername: input.telegramBotUsername }),
    ...(input.userMaxLinksPerHour === undefined
      ? {}
      : { userMaxLinksPerHour: input.userMaxLinksPerHour }),
  }
}

async function ensureSiteSettingsRow() {
  await ensureSiteSettingsDbReady()
  await db.insert(siteSetting).values({ id: 'default' }).onConflictDoNothing()
}

export async function upsertSiteSettings(input: SiteSettingsWriteInput) {
  await ensureSiteSettingsDbReady()
  const changes = buildSiteSettingsWrite(input)

  if (Object.keys(changes).length === 0) {
    await ensureSiteSettingsRow()
    return
  }

  await db
    .insert(siteSetting)
    .values({ id: 'default', ...changes })
    .onConflictDoUpdate({
      target: siteSetting.id,
      set: changes,
    })
}

export async function writeSiteSettingsAndReadFresh(
  input: SiteSettingsWriteInput,
) {
  await upsertSiteSettings(input)
  siteSettingsStore.invalidate()
  return getSiteSettingsFresh()
}

export async function writeSiteSettings(input: SiteSettingsWriteInput) {
  return writeSiteSettingsAndReadFresh(input)
}
