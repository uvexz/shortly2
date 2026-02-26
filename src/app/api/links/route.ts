import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db, initDb } from "@/lib/db"
import { shortLink } from "@/lib/schema"
import { eq, desc } from "drizzle-orm"
import { headers } from "next/headers"

export async function GET() {
  await initDb()
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const links = await db
    .select()
    .from(shortLink)
    .where(eq(shortLink.userId, session.user.id))
    .orderBy(desc(shortLink.createdAt))

  return NextResponse.json(links)
}
