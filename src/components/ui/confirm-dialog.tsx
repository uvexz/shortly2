import type { ReactNode } from 'react'
import { Button, Dialog } from '@cloudflare/kumo'

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  onConfirm,
  loading = false,
  destructive = false,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  loading?: boolean
  destructive?: boolean
  children?: ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog className="w-[calc(100vw-2rem)] max-w-md p-0">
        <div className="p-6">
          <Dialog.Title className="text-base font-semibold text-neutral-900">
            {title}
          </Dialog.Title>
          {description ? (
            <Dialog.Description className="mt-2 text-sm leading-6 text-neutral-500">
              {description}
            </Dialog.Description>
          ) : null}
          {children ? <div className="mt-4">{children}</div> : null}
          <div className="mt-6 flex justify-end gap-2 border-t border-neutral-100 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="h-9 px-3 text-xs"
            >
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant={destructive ? 'destructive' : 'primary'}
              onClick={onConfirm}
              loading={loading}
              disabled={loading}
              className="h-9 px-3 text-xs"
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </Dialog>
    </Dialog.Root>
  )
}
