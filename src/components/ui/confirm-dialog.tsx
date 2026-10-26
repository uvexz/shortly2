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
      <Dialog size="base" className="w-[calc(100vw-2rem)] p-0">
        <div className="p-6">
          <Dialog.Title className="text-lg font-semibold text-kumo-strong">
            {title}
          </Dialog.Title>
          {description ? (
            <Dialog.Description className="mt-2 text-base leading-6 text-kumo-subtle">
              {description}
            </Dialog.Description>
          ) : null}
          {children ? <div className="mt-4">{children}</div> : null}
          <div className="mt-6 flex justify-end gap-2 border-t border-kumo-hairline pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant={destructive ? 'destructive' : 'primary'}
              onClick={onConfirm}
              loading={loading}
              disabled={loading}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </Dialog>
    </Dialog.Root>
  )
}
