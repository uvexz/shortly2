import { useEffect, useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Button, Input } from '@cloudflare/kumo'
import { CheckCircle, GearSix, TelegramLogo } from '@phosphor-icons/react'
import { useAdminSettings, useUpdateAdminSettings } from '@/hooks/admin'
import { getErrorMessage } from '@/lib/api-client'
import { PageHeader, Panel, PanelHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingBlock } from '@/components/ui/loading'
import { toastError, toastSuccess } from '@/lib/toast'

export const Route = createFileRoute('/admin/settings')({
  component: AdminSettingsPage,
})

function AdminSettingsPage() {
  const router = useRouter()
  const settingsQuery = useAdminSettings()
  const updateSettings = useUpdateAdminSettings()
  const [siteName, setSiteName] = useState('')
  const [siteUrl, setSiteUrl] = useState('')
  const [telegramBotUsername, setTelegramBotUsername] = useState('')
  const [userMaxLinksPerHour, setUserMaxLinksPerHour] = useState('50')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!settingsQuery.data) return
    setSiteName(settingsQuery.data.siteName)
    setSiteUrl(settingsQuery.data.siteUrl)
    setTelegramBotUsername(settingsQuery.data.telegramBotUsername)
    setUserMaxLinksPerHour(String(settingsQuery.data.userMaxLinksPerHour))
  }, [settingsQuery.data])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    const trimmedName = siteName.trim()
    const trimmedUrl = siteUrl.trim()
    const trimmedTelegram = telegramBotUsername.trim().replace(/^@+/, '')
    const limit = Number(userMaxLinksPerHour)

    if (!trimmedName) {
      setError('站点名称不能为空')
      return
    }
    if (trimmedUrl) {
      try {
        const parsed = new URL(trimmedUrl)
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error('invalid protocol')
        }
      } catch {
        setError('站点地址必须是合法的 http(s) URL，或留空')
        return
      }
    }
    if (trimmedTelegram && !/^[a-zA-Z0-9_]{5,32}$/.test(trimmedTelegram)) {
      setError('Telegram Bot 用户名仅允许 5-32 位字母、数字或下划线')
      return
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100000) {
      setError('每小时创建上限必须是 1-100000 的整数')
      return
    }

    try {
      await updateSettings.mutateAsync({
        siteName: trimmedName,
        siteUrl: trimmedUrl,
        telegramBotUsername: trimmedTelegram,
        userMaxLinksPerHour: limit,
      })
      await router.invalidate()
      toastSuccess({ title: '站点设置已保存' })
    } catch (submitError) {
      const message = getErrorMessage(submitError, '保存站点设置失败')
      setError(message)
      toastError({ title: message })
    }
  }

  return (
    <>
      <PageHeader
        title="站点设置"
        description="配置站点名称、地址、Telegram 通知和创建限额。"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel>
          <PanelHeader
            title="基础配置"
            description="保存后会刷新站点名称与公开域名信息"
          />
          {settingsQuery.isPending ? (
            <LoadingBlock rows={4} className="p-5" />
          ) : settingsQuery.isError ? (
            <EmptyState
              title="设置加载失败"
              description={getErrorMessage(settingsQuery.error, '请稍后重试')}
              action={
                <Button
                  variant="secondary"
                  onClick={() => void settingsQuery.refetch()}
                >
                  重试
                </Button>
              }
            />
          ) : (
            <form className="space-y-4 p-5" onSubmit={handleSubmit}>
              <Input
                label="站点名称"
                required
                maxLength={80}
                value={siteName}
                onChange={(event) => setSiteName(event.target.value)}
                description="显示在页面标题、侧栏和登录页。"
                disabled={updateSettings.isPending}
                className="w-full"
              />
              <Input
                label="站点地址"
                maxLength={2000}
                placeholder="https://shortly.example.com"
                value={siteUrl}
                onChange={(event) => setSiteUrl(event.target.value)}
                description="用于生成绝对链接和校验写操作来源；留空时使用当前请求地址。"
                disabled={updateSettings.isPending}
                className="w-full"
              />
              <Input
                label="Telegram Bot 用户名"
                maxLength={64}
                placeholder="my_shortly_bot"
                value={telegramBotUsername}
                onChange={(event) => setTelegramBotUsername(event.target.value)}
                description="填写 Bot 用户名（不含 @）。配置后用户会在 API 页面看到绑定命令。"
                disabled={updateSettings.isPending}
                className="w-full"
              />
              <Input
                label="每小时创建上限"
                type="number"
                min={1}
                max={100000}
                value={userMaxLinksPerHour}
                onChange={(event) => setUserMaxLinksPerHour(event.target.value)}
                description="同时用于短链接创建和临时邮箱创建的小时限额。"
                disabled={updateSettings.isPending}
                className="w-full"
              />

              {error ? (
                <p className="rounded-lg bg-kumo-danger-tint px-3 py-2 text-xs text-kumo-danger">
                  {error}
                </p>
              ) : null}

              <div className="flex justify-end border-t border-kumo-hairline pt-4">
                <Button
                  type="submit"
                  variant="primary"
                  loading={updateSettings.isPending}
                  disabled={updateSettings.isPending}
                >
                  保存设置
                </Button>
              </div>
            </form>
          )}
        </Panel>

        <aside className="space-y-4">
          <Panel className="p-4">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-kumo-brand/10 text-kumo-brand-hover">
                <GearSix className="size-4" />
              </span>
              <h2 className="text-base font-semibold text-kumo-strong">
                当前配置
              </h2>
            </div>
            <div className="mt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-kumo-subtle">站点名称</span>
                <span className="truncate font-medium text-kumo-default">
                  {settingsQuery.data?.siteName ?? '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-kumo-subtle">站点地址</span>
                <span className="max-w-48 truncate text-kumo-default">
                  {settingsQuery.data?.siteUrl || '使用请求地址'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-kumo-subtle">小时限额</span>
                <span className="numeric text-kumo-default">
                  {settingsQuery.data?.userMaxLinksPerHour ?? '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-kumo-subtle">Telegram Bot</span>
                <span className="truncate text-kumo-default">
                  {settingsQuery.data?.telegramBotUsername
                    ? `@${settingsQuery.data.telegramBotUsername.replace(/^@+/, '')}`
                    : '未配置'}
                </span>
              </div>
            </div>
          </Panel>

          <Panel className="p-4">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-kumo-brand/10 text-kumo-brand-hover">
                <TelegramLogo className="size-4" />
              </span>
              <h2 className="text-base font-semibold text-kumo-strong">
                Telegram 通知
              </h2>
            </div>
            <p className="mt-3 text-sm leading-5 text-kumo-subtle">
              配置 Bot 用户名后，用户可以在 Telegram 中发送{' '}
              <code className="rounded bg-kumo-control px-1 py-0.5 font-mono text-[0.9em] text-kumo-default ring ring-kumo-hairline">
                /setkey &lt;api_key&gt;
              </code>{' '}
              绑定通知。主程序需要同时配置 TELEGRAM_BOT_TOKEN
              才会推送新邮件提醒。
            </p>
          </Panel>

          <Panel className="bg-kumo-success-tint p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="size-4 text-kumo-success" weight="fill" />
              <h2 className="text-base font-semibold text-kumo-strong">
                保存后即时生效
              </h2>
            </div>
            <p className="mt-2 text-sm leading-5 text-kumo-default/80">
              站点名称、Telegram
              用户名和创建限额会立即刷新；域名配置请前往「域名管理」。
            </p>
          </Panel>
        </aside>
      </div>
    </>
  )
}
