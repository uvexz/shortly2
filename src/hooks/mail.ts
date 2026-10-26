import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import type {
  Paginated,
  TempMailboxDto,
  TempMessageDetail,
  TempMessagesResponse,
} from '@/lib/api-types'

export const mailKeys = {
  all: ['mail'] as const,
  mailboxes: (page: number, limit: number) =>
    ['mail', 'mailboxes', page, limit] as const,
  mailboxOptions: ['mail', 'mailbox-options'] as const,
  messages: (params: {
    page: number
    limit: number
    search: string
    mailboxId: string
  }) => ['mail', 'messages', params] as const,
  unread: ['mail', 'unread'] as const,
  detail: (id: string | null) => ['mail', 'detail', id] as const,
}

export function useMailboxesPage(page: number, limit = 10) {
  return useQuery({
    queryKey: mailKeys.mailboxes(page, limit),
    queryFn: () =>
      apiFetch<Paginated<TempMailboxDto>>(
        `/api/emails?page=${page}&limit=${limit}`,
      ),
  })
}

export function useMailboxOptions() {
  return useQuery({
    queryKey: mailKeys.mailboxOptions,
    queryFn: () => apiFetch<{ data: TempMailboxDto[] }>('/api/emails/options'),
  })
}

export function useMessages(params: {
  page: number
  limit: number
  search: string
  mailboxId: string
}) {
  return useQuery({
    queryKey: mailKeys.messages(params),
    queryFn: () => {
      const searchParams = new URLSearchParams({
        page: String(params.page),
        limit: String(params.limit),
      })
      if (params.search.trim()) searchParams.set('search', params.search.trim())
      if (params.mailboxId) searchParams.set('mailboxId', params.mailboxId)
      return apiFetch<TempMessagesResponse>(
        `/api/emails/messages?${searchParams.toString()}`,
      )
    },
  })
}

export function useMessageDetail(messageId: string | null) {
  return useQuery({
    queryKey: mailKeys.detail(messageId),
    queryFn: () =>
      apiFetch<{ data: TempMessageDetail }>(
        `/api/emails/messages/${messageId}`,
      ),
    enabled: Boolean(messageId),
  })
}

export function useUnreadCount() {
  return useQuery({
    queryKey: mailKeys.unread,
    queryFn: () =>
      apiFetch<TempMessagesResponse>('/api/emails/messages?page=1&limit=1'),
    select: (data) => data.unread,
  })
}

function useInvalidateMail() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: mailKeys.all })
}

export function useCreateMailbox() {
  const invalidate = useInvalidateMail()
  return useMutation({
    mutationFn: (emailAddress: string) =>
      apiFetch<{ data: TempMailboxDto }>('/api/emails', {
        method: 'POST',
        json: { emailAddress },
      }),
    onSuccess: invalidate,
  })
}

export function useDeleteMailbox() {
  const invalidate = useInvalidateMail()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: true }>(`/api/emails/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

export function useMarkMessageRead() {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateMail()
  return useMutation({
    mutationFn: (messageId: string) =>
      apiFetch<{ success: true }>(`/api/emails/messages/${messageId}/read`, {
        method: 'POST',
      }),
    onSuccess: (_data, messageId) => {
      queryClient.invalidateQueries({ queryKey: mailKeys.detail(messageId) })
      invalidate()
    },
  })
}

export function useDeleteMessage() {
  const invalidate = useInvalidateMail()
  return useMutation({
    mutationFn: (messageId: string) =>
      apiFetch<{ success: true }>(`/api/emails/messages/${messageId}`, {
        method: 'DELETE',
      }),
    onSuccess: invalidate,
  })
}
