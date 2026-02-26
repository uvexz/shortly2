import { auth } from "@/lib/auth"
import { initDb } from "@/lib/db"
import { getAvatarUrl } from "@/lib/gravatar"
import { UrlShortener } from "@/components/url-shortener"
import { UserMenu } from "@/components/user-menu"
import { Button } from "@/components/ui/button"
import { headers } from "next/headers"
import Link from "next/link"

export default async function HomePage() {
  await initDb()
  const session = await auth.api.getSession({ headers: await headers() })
  const user = session?.user
    ? {
      name: session.user.name,
      email: session.user.email,
      image: getAvatarUrl(session.user.email, session.user.image),
      role: (session.user as { role?: string }).role,
    }
    : null

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div className="absolute top-4 right-4">
        {user ? (
          <UserMenu user={user} />
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">登录</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">注册</Link>
            </Button>
          </div>
        )}
      </div>

      <UrlShortener user={user} />
    </main>
  )
}
