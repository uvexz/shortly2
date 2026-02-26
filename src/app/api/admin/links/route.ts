import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db, initDb } from "@/lib/db"
import { shortLink, user } from "@/lib/schema"
import { desc, eq } from "drizzle-orm"
import { headers } from "next/headers"

export async function GET() {
  await initDb()
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session || (session.user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const links = await db
    .select({
      id: shortLink.id,
      userId: shortLink.userId,
      userName: user.name,
      userEmail: user.email,
      originalUrl: shortLink.originalUrl,
      slug: shortLink.slug,
      clicks: shortLink.clicks,
      createdAt: shortLink.createdAt,
    })
    .from(shortLink)
    .leftJoin(user, eq(shortLink.userId, user.id))
    .orderBy(desc(shortLink.createdAt))

  return NextResponse.json(links)
}
