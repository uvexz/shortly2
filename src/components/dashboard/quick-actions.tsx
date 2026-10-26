import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CreateLinkDialog } from '@/components/dashboard/create-link-dialog'
import { CreateMailboxDialog } from '@/components/dashboard/create-mailbox-dialog'

type QuickActionsContextValue = {
  openCreateLink: () => void
  openCreateMailbox: () => void
}

const QuickActionsContext = createContext<QuickActionsContextValue | null>(null)

export function QuickActionsProvider({ children }: { children: ReactNode }) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [mailboxOpen, setMailboxOpen] = useState(false)

  const value = useMemo(
    () => ({
      openCreateLink: () => setLinkOpen(true),
      openCreateMailbox: () => setMailboxOpen(true),
    }),
    [],
  )

  return (
    <QuickActionsContext.Provider value={value}>
      {children}
      <CreateLinkDialog open={linkOpen} onOpenChange={setLinkOpen} />
      <CreateMailboxDialog open={mailboxOpen} onOpenChange={setMailboxOpen} />
    </QuickActionsContext.Provider>
  )
}

export function useQuickActions() {
  const value = useContext(QuickActionsContext)
  if (!value) {
    throw new Error('useQuickActions must be used inside QuickActionsProvider')
  }
  return value
}
