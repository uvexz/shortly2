import { createKumoToastManager } from '@cloudflare/kumo'

export const appToastManager = createKumoToastManager()

type ToastInput = {
  title: string
  description?: string
  timeout?: number
}

export function toastSuccess({
  title,
  description,
  timeout = 3000,
}: ToastInput) {
  appToastManager.add({ title, description, variant: 'success', timeout })
}

export function toastError({ title, description, timeout = 4500 }: ToastInput) {
  appToastManager.add({ title, description, variant: 'error', timeout })
}
