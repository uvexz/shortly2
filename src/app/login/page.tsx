import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { AuthForm } from "@/components/auth-form"
import Link from "next/link"

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session) redirect("/dashboard")

  const enableEmail = !!process.env.RESEND_API_KEY
  const enableGithub = !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="text-2xl font-bold tracking-tight hover:opacity-80 transition-opacity">
            Shortly
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">登录至 Shortly</p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <AuthForm
            mode="login"
            enableEmail={enableEmail}
            enableGithub={enableGithub}
            callbackUrl="/dashboard"
          />
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          没有账户？{" "}
          <Link href="/register" className="text-foreground font-medium hover:underline">
            立即注册
          </Link>
        </p>
      </div>
    </main>
  )
}
