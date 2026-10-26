import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import type {
  AdminArchiveDetail,
  AdminArchiveSummary,
  AdminDomainDto,
  AdminLinkDto,
  AdminMailboxDto,
  AdminMessageDetail,
  AdminMessageSummary,
  AdminUserDto,
  Paginated,
  SiteSettingsDto,
} from '@/lib/api-types'

export const adminKeys = {
  all: ['admin'] as const,
  links: (page: number, limit: number) =>
    ['admin', 'links', page, limit] as const,
  users: (page: number, limit: number) =>
    ['admin', 'users', page, limit] as const,
  domains: ['admin', 'domains'] as const,
  settings: ['admin', 'settings'] as const,
  mailboxes: (page: number, limit: number, search: string) =>
    ['admin', 'mailboxes', page, limit, search] as const,
  messages: (page: number, limit: number, search: string) =>
    ['admin', 'messages', page, limit, search] as const,
  archives: (page: number, limit: number, search: string) =>
    ['admin', 'archives', page, limit, search] as const,
  messageDetail: (id: string | null) =>
    ['admin', 'message-detail', id] as const,
  archiveDetail: (id: string | null) =>
    ['admin', 'archive-detail', id] as const,
}

export function useAdminLinks(page: number, limit = 20) {
  return useQuery({
    queryKey: adminKeys.links(page, limit),
    queryFn: () =>
      apiFetch<Paginated<AdminLinkDto>>(
        `/api/admin/links?page=${page}&limit=${limit}`,
      ),
  })
}

export function useDeleteAdminLink() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: true }>(`/api/admin/links/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.all })
    },
  })
}

export function useAdminUsers(page: number, limit = 20) {
  return useQuery({
    queryKey: adminKeys.users(page, limit),
    queryFn: () =>
      apiFetch<Paginated<AdminUserDto>>(
        `/api/admin/users?page=${page}&limit=${limit}`,
      ),
  })
}

export function useSetUserBan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      banned,
      banReason,
    }: {
      id: string
      banned: boolean
      banReason?: string
    }) =>
      apiFetch<{ user: AdminUserDto }>(`/api/admin/users/${id}`, {
        method: 'PATCH',
        json: { banned, banReason },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.users(1, 20) })
      queryClient.invalidateQueries({ queryKey: adminKeys.all })
    },
  })
}

export function useAdminDomains() {
  return useQuery({
    queryKey: adminKeys.domains,
    queryFn: () => apiFetch<{ data: AdminDomainDto[] }>('/api/admin/domains'),
  })
}

export type DomainWriteInput = {
  host: string
  supportsShortLinks: boolean
  shortLinkMinSlugLength: number
  supportsTempEmail: boolean
  tempEmailMinLocalPartLength: number
  isActive: boolean
  isDefaultShortDomain: boolean
  isDefaultEmailDomain: boolean
}

export function useCreateAdminDomain() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: DomainWriteInput) =>
      apiFetch<{ data: AdminDomainDto }>('/api/admin/domains', {
        method: 'POST',
        json: input,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.domains })
      queryClient.invalidateQueries({ queryKey: ['public-domains'] })
    },
  })
}

export function useUpdateAdminDomain() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      changes,
    }: {
      id: string
      changes: Partial<DomainWriteInput>
    }) =>
      apiFetch<{ data: AdminDomainDto }>(`/api/admin/domains/${id}`, {
        method: 'PATCH',
        json: changes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.domains })
      queryClient.invalidateQueries({ queryKey: ['public-domains'] })
    },
  })
}

export function useDeleteAdminDomain() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: true }>(`/api/admin/domains/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.domains })
      queryClient.invalidateQueries({ queryKey: ['public-domains'] })
    },
  })
}

export function useAdminSettings() {
  return useQuery({
    queryKey: adminKeys.settings,
    queryFn: () => apiFetch<SiteSettingsDto>('/api/admin/settings'),
  })
}

export function useUpdateAdminSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<Omit<SiteSettingsDto, 'id'>>) =>
      apiFetch<SiteSettingsDto>('/api/admin/settings', {
        method: 'POST',
        json: input,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.settings })
      queryClient.invalidateQueries({ queryKey: ['public-domains'] })
    },
  })
}

export function useAdminMailboxes(page: number, limit = 20, search = '') {
  return useQuery({
    queryKey: adminKeys.mailboxes(page, limit, search),
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })
      if (search.trim()) params.set('search', search.trim())
      return apiFetch<Paginated<AdminMailboxDto>>(
        `/api/admin/emails/mailboxes?${params.toString()}`,
      )
    },
  })
}

export function useAdminMessages(page: number, limit = 20, search = '') {
  return useQuery({
    queryKey: adminKeys.messages(page, limit, search),
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })
      if (search.trim()) params.set('search', search.trim())
      return apiFetch<Paginated<AdminMessageSummary>>(
        `/api/admin/emails/messages?${params.toString()}`,
      )
    },
  })
}

export function useAdminArchives(page: number, limit = 20, search = '') {
  return useQuery({
    queryKey: adminKeys.archives(page, limit, search),
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })
      if (search.trim()) params.set('search', search.trim())
      return apiFetch<Paginated<AdminArchiveSummary>>(
        `/api/admin/emails/archives?${params.toString()}`,
      )
    },
  })
}

export function useAdminMessageDetail(messageId: string | null) {
  return useQuery({
    queryKey: adminKeys.messageDetail(messageId),
    queryFn: () =>
      apiFetch<{ data: AdminMessageDetail }>(
        `/api/admin/emails/messages/${messageId}`,
      ),
    enabled: Boolean(messageId),
  })
}

export function useAdminArchiveDetail(archiveId: string | null) {
  return useQuery({
    queryKey: adminKeys.archiveDetail(archiveId),
    queryFn: () =>
      apiFetch<{ data: AdminArchiveDetail }>(
        `/api/admin/emails/archives/${archiveId}`,
      ),
    enabled: Boolean(archiveId),
  })
}
