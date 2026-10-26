import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'
import type {
  ApiKeyDto,
  CreateApiKeyResponse,
  PublicDomainsResponse,
} from '@/lib/api-types'

export const apiKeyKeys = {
  all: ['api-keys'] as const,
}

export const domainKeys = {
  public: ['public-domains'] as const,
}

export function useApiKeys() {
  return useQuery({
    queryKey: apiKeyKeys.all,
    queryFn: () => apiFetch<{ data: ApiKeyDto[] }>('/v1/keys'),
  })
}

export function useCreateApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name?: string) =>
      apiFetch<CreateApiKeyResponse>('/v1/keys', {
        method: 'POST',
        json: name ? { name } : {},
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
    },
  })
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: true }>(`/v1/keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
    },
  })
}

export function usePublicDomains() {
  return useQuery({
    queryKey: domainKeys.public,
    queryFn: () => apiFetch<PublicDomainsResponse>('/api/domains'),
  })
}
