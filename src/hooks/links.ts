import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import type { LinkLogsResponse, Paginated, ShortLinkDto } from '@/lib/api-types'

export const RECENT_LINKS_CAP = 500

export const linkKeys = {
  all: ['links'] as const,
  list: (page: number, limit: number) =>
    ['links', 'list', page, limit] as const,
  recent: ['links', 'recent'] as const,
  logs: (linkId: string, page: number, pageSize: number) =>
    ['links', 'logs', linkId, page, pageSize] as const,
}

export function useLinksPage(page: number, limit = 10) {
  return useQuery({
    queryKey: linkKeys.list(page, limit),
    queryFn: () =>
      apiFetch<Paginated<ShortLinkDto>>(
        `/api/links?page=${page}&limit=${limit}`,
      ),
  })
}

export type RecentLinksResult = {
  links: ShortLinkDto[]
  total: number
  sampled: boolean
}

export function useRecentLinks(enabled = true) {
  return useQuery({
    queryKey: linkKeys.recent,
    enabled,
    queryFn: async (): Promise<RecentLinksResult> => {
      const first = await apiFetch<Paginated<ShortLinkDto>>(
        '/api/links?page=1&limit=100',
      )
      const pageCount = Math.min(
        first.totalPages,
        Math.ceil(RECENT_LINKS_CAP / 100),
      )
      const rest =
        pageCount > 1
          ? await Promise.all(
              Array.from({ length: pageCount - 1 }, (_, index) =>
                apiFetch<Paginated<ShortLinkDto>>(
                  `/api/links?page=${index + 2}&limit=100`,
                ),
              ),
            )
          : []
      const links = [first, ...rest].flatMap((item) => item.data)
      return {
        links,
        total: first.total,
        sampled: links.length < first.total,
      }
    },
  })
}

export function useCreateLink() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      url: string
      customSlug?: string
      domain?: string
      expiresIn?: string
      maxClicks?: number
    }) =>
      apiFetch<{
        shortUrl: string
        slug: string
        domain: string
        maxClicks: number | null
      }>('/api/shorten', { method: 'POST', json: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: linkKeys.all })
    },
  })
}

export function useDeleteLink() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: true }>(`/api/links/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: linkKeys.all })
    },
  })
}

export function useLinkLogs(
  linkId: string | null,
  page: number,
  pageSize = 50,
  enabled = true,
) {
  return useQuery({
    queryKey: linkKeys.logs(linkId ?? '', page, pageSize),
    queryFn: () =>
      apiFetch<LinkLogsResponse>(
        `/api/logs/${linkId}?page=${page}&pageSize=${pageSize}`,
      ),
    enabled: Boolean(linkId) && enabled,
  })
}
