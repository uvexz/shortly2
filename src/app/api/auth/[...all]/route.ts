import { auth } from "@/lib/auth"
import { initDb } from "@/lib/db"
import { toNextJsHandler } from "better-auth/next-js"

const handler = toNextJsHandler(auth)

export async function GET(req: Request) {
  await initDb()
  return handler.GET(req)
}

export async function POST(req: Request) {
  await initDb()
  return handler.POST(req)
}
