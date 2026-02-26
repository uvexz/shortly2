import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db, initDb } from "@/lib/db"
import { siteSetting } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session || (session.user as { role?: string }).role !== "admin") {
    return null
  }
  return session
}

export async function GET() {
  await initDb()
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const settings = await db.select().from(siteSetting).where(eq(siteSetting.id, "default")).get()
  return NextResponse.json(settings)
}

export async function POST(req: NextRequest) {
  await initDb()
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const { siteName, siteUrl, allowAnonymous, anonMaxLinksPerHour, anonMaxClicks, userMaxLinksPerHour } = body

  await db
    .update(siteSetting)
    .set({
      siteName: siteName ?? undefined,
      siteUrl: siteUrl ?? undefined,
      allowAnonymous: allowAnonymous ?? undefined,
      anonMaxLinksPerHour: anonMaxLinksPerHour ?? undefined,
      anonMaxClicks: anonMaxClicks ?? undefined,
      userMaxLinksPerHour: userMaxLinksPerHour ?? undefined,
    })
    .where(eq(siteSetting.id, "default"))

  const updated = await db.select().from(siteSetting).where(eq(siteSetting.id, "default")).get()
  return NextResponse.json(updated)
}
