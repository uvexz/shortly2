import { createFileRoute, redirect } from '@tanstack/react-router'
import { AuthForm } from '@/components/auth/auth-form'
import { AuthPageShell } from '@/components/auth/auth-page-shell'
import { useBootstrap } from '@/lib/bootstrap'
import { getSessionUser } from '@/lib/server-fns'

export const Route = createFileRoute('/register')({
  beforeLoad: async () => {
    const user = await getSessionUser()
    if (user) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: RegisterPage,
})

function RegisterPage() {
  const { siteName, enableEmail, enableGithub } = useBootstrap()

  return (
    <AuthPageShell siteName={siteName} mode="register">
      <AuthForm
        mode="register"
        enableEmail={enableEmail}
        enableGithub={enableGithub}
      />
    </AuthPageShell>
  )
}
