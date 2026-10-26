import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { AppShell } from '@/components/layout/app-shell'
import { QuickActionsProvider } from '@/components/dashboard/quick-actions'
import { getSessionUser } from '@/lib/server-fns'

export const Route = createFileRoute('/dashboard')({
  beforeLoad: async () => {
    const user = await getSessionUser()
    if (!user) {
      throw redirect({ to: '/login' })
    }
    return { user }
  },
  component: DashboardLayout,
})

function DashboardLayout() {
  return (
    <QuickActionsProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </QuickActionsProvider>
  )
}
