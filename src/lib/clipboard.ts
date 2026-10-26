import { toastError, toastSuccess } from '@/lib/toast'

export async function copyText(value: string, successMessage = '已复制') {
  try {
    await navigator.clipboard.writeText(value)
    toastSuccess({ title: successMessage })
    return true
  } catch {
    toastError({ title: '复制失败，请手动选择文本' })
    return false
  }
}
