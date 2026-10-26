import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { AppShell } from '@/components/layout/app-shell'
import { QuickActionsProvider } from '@/components/dashboard/quick-actions'
import { getSessionUser } from '@/lib/server-fns'

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    const user = await getSessionUser()
    if (!user) {
      throw redirect({ to: '/login' })
    }
    if (user.role !== 'admin') {
      throw redirect({ to: '/dashboard' })
    }
    return { user }
  },
  component: AdminLayout,
})

function AdminLayout() {
  return (
    <QuickActionsProvider>
      <AppShell admin>
        <Outlet />
      </AppShell>
    </QuickActionsProvider>
  )
}
