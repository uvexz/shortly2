import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { AuthForm } from "@/components/auth-form"
import Link from "next/link"
import { KeyRound } from "lucide-react"

export default async function RegisterPage() {
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
          <p className="mt-2 text-sm text-muted-foreground">创建免费账户</p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <AuthForm
            mode="register"
            enableEmail={enableEmail}
            enableGithub={enableGithub}
            callbackUrl="/dashboard"
          />
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
          <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>注册后，系统会提示您保存 Passkey，以便下次快速登录。当然您也可以跳过。</span>
        </div>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          已有账户？{" "}
          <Link href="/login" className="text-foreground font-medium hover:underline">
            立即登录
          </Link>
        </p>
      </div>
    </main>
  )
}
