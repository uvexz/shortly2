import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db, initDb } from "@/lib/db"
import { shortLink } from "@/lib/schema"
import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await initDb()
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const link = await db
    .select()
    .from(shortLink)
    .where(and(eq(shortLink.id, id), eq(shortLink.userId, session.user.id)))
    .get()

  if (!link) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 })
  }

  await db.delete(shortLink).where(eq(shortLink.id, id))
  return NextResponse.json({ success: true })
}
