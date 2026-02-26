import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db, initDb } from "@/lib/db"
import { shortLink } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await initDb()
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session || (session.user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  await db.delete(shortLink).where(eq(shortLink.id, id))
  return NextResponse.json({ success: true })
}
