import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { BootstrapData } from '@/lib/server-fns'

const BootstrapContext = createContext<BootstrapData | null>(null)

export function BootstrapProvider({
  value,
  children,
}: {
  value: BootstrapData
  children: ReactNode
}) {
  return (
    <BootstrapContext.Provider value={value}>
      {children}
    </BootstrapContext.Provider>
  )
}

export function useBootstrap() {
  const value = useContext(BootstrapContext)
  if (!value) {
    throw new Error('useBootstrap must be used inside BootstrapProvider')
  }
  return value
}
