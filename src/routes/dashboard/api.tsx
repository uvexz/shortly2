import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Button, Input, Table, Tabs } from '@cloudflare/kumo'
import {
  ArrowSquareOut,
  CheckCircle,
  Copy,
  Download,
  Key,
  PaperPlaneTilt,
  Plus,
  Trash,
} from '@phosphor-icons/react'
import type { ApiKeyDto } from '@/lib/api-types'
import {
  useApiKeys,
  useCreateApiKey,
  useDeleteApiKey,
  usePublicDomains,
} from '@/hooks/settings'
import { getErrorMessage } from '@/lib/api-client'
import { copyText } from '@/lib/clipboard'
import { formatDateTime, formatNumber } from '@/lib/format'
import { PageHeader, Panel } from '@/components/ui/page-header'
import { CopyButton } from '@/components/ui/copy-button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { TableLoading } from '@/components/ui/loading'
import { CodeBlock } from '@/components/ui/code-block'
import { toastError, toastSuccess } from '@/lib/toast'

const tabs = [
  { value: 'keys', label: '密钥' },
  { value: 'docs', label: 'API 文档' },
  { value: 'bitwarden', label: 'Bitwarden 别名' },
  { value: 'sharex', label: 'ShareX' },
]

export const Route = createFileRoute('/dashboard/api')({
  component: ApiPage,
})

function ApiPage() {
  const keysQuery = useApiKeys()
  const domainsQuery = usePublicDomains()
  const createKey = useCreateApiKey()
  const deleteKey = useDeleteApiKey()
  const [tab, setTab] = useState('keys')
  const [keyName, setKeyName] = useState('')
  const [latestPlainKey, setLatestPlainKey] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ApiKeyDto | null>(null)
  const [sharexKey, setSharexKey] = useState('')
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const emailDomains = domainsQuery.data?.emailDomains ?? []
  const shortDomains = domainsQuery.data?.shortDomains ?? []
  const telegramBotUsername = (
    domainsQuery.data?.telegramBotUsername ?? ''
  ).replace(/^@+/, '')
  const keys = keysQuery.data?.data ?? []
  const apiBase = origin || 'https://your-domain.com'
  const sampleEmailDomain = emailDomains[0]?.host ?? 'mail.example.com'
  const sampleEmailAddress = `demo@${sampleEmailDomain}`
  const activeKey = latestPlainKey || sharexKey || 'YOUR_API_KEY'

  const sharexConfig = useMemo(
    () =>
      JSON.stringify(
        {
          Version: '17.0.0',
          Name: 'Shortly URL Shortener',
          DestinationType: 'URLShortener',
          RequestMethod: 'POST',
          RequestURL: `${apiBase}/v1/shorten`,
          Headers: {
            Authorization: `Bearer ${sharexKey || 'YOUR_API_KEY'}`,
          },
          Body: 'JSON',
          Data: JSON.stringify({ url: '$input$' }),
          URL: '$json:shortUrl$',
          DeletionURL: '',
          ErrorMessage: '$json:error$',
        },
        null,
        2,
      ),
    [apiBase, sharexKey],
  )

  async function handleCreateKey() {
    try {
      const result = await createKey.mutateAsync(keyName.trim() || undefined)
      setLatestPlainKey(result.plainKey)
      setSharexKey(result.plainKey)
      setKeyName('')
      toastSuccess({ title: 'API Key 已创建，请立即复制保存' })
    } catch (error) {
      toastError({ title: getErrorMessage(error, '创建 API Key 失败') })
    }
  }

  async function handleDeleteKey() {
    if (!pendingDelete) return
    try {
      await deleteKey.mutateAsync(pendingDelete.id)
      toastSuccess({ title: 'API Key 已删除' })
      setPendingDelete(null)
    } catch (error) {
      toastError({ title: getErrorMessage(error, '删除 API Key 失败') })
    }
  }

  function downloadSharexConfig() {
    const blob = new Blob([sharexConfig], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'shortly-sharex.sxcu'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <PageHeader
        title="API 管理"
        description="创建密钥，接入 OpenAPI、ShareX 和别名工具。"
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="活跃密钥" value={formatNumber(keys.length)} icon={Key} />
        <Metric
          label="短链域名"
          value={formatNumber(shortDomains.length)}
          icon={ArrowSquareOut}
        />
        <Metric
          label="邮箱域名"
          value={formatNumber(emailDomains.length)}
          icon={PaperPlaneTilt}
        />
        <Metric
          label="Telegram"
          value={telegramBotUsername ? `@${telegramBotUsername}` : '未配置'}
          icon={PaperPlaneTilt}
        />
      </div>

      <Panel className="overflow-hidden">
        <div className="border-b border-neutral-100 px-4 pt-3">
          <Tabs
            tabs={tabs}
            value={tab}
            onValueChange={setTab}
            variant="underline"
            size="sm"
          />
        </div>

        {tab === 'keys' ? (
          <div>
            <div className="border-b border-neutral-100 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="mb-2 block text-xs font-medium text-neutral-700">
                    密钥名称（可选）
                  </label>
                  <Input
                    value={keyName}
                    onChange={(event) => setKeyName(event.target.value)}
                    placeholder="例如：CLI、ShareX、CI"
                    maxLength={60}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        void handleCreateKey()
                      }
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="primary"
                  className="h-10 gap-2 px-4 text-xs"
                  loading={createKey.isPending}
                  onClick={() => void handleCreateKey()}
                  icon={<Plus className="size-3.5" weight="bold" />}
                >
                  创建 API Key
                </Button>
              </div>
              {latestPlainKey ? (
                <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-neutral-800">
                        新密钥只在本次显示，请立即复制保存
                      </p>
                      <p className="mt-1 break-all font-mono text-[11px] text-neutral-600">
                        {latestPlainKey}
                      </p>
                    </div>
                    <CopyButton
                      value={latestPlainKey}
                      successMessage="API Key 已复制"
                      variant="secondary"
                    />
                  </div>
                </div>
              ) : null}
              {telegramBotUsername ? (
                <div className="mt-3 rounded-lg bg-neutral-50 p-3 text-[11px] leading-5 text-neutral-500">
                  在 Telegram 中打开 @{telegramBotUsername}，发送{' '}
                  <code className="rounded bg-white px-1 py-0.5 text-neutral-800">
                    /setkey {activeKey}
                  </code>{' '}
                  即可绑定通知。
                </div>
              ) : null}
            </div>

            {keysQuery.isPending ? (
              <TableLoading rows={3} />
            ) : !keys.length ? (
              <EmptyState
                icon={<Key className="size-5" />}
                title="还没有 API Key"
                description="创建一个密钥，用于调用 /v1 开放接口。"
              />
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[620px]">
                  <Table.Header>
                    <Table.Row>
                      <Table.Head className="px-4 py-3 text-[10px]">
                        名称
                      </Table.Head>
                      <Table.Head className="px-4 py-3 text-[10px]">
                        前缀
                      </Table.Head>
                      <Table.Head className="px-4 py-3 text-[10px]">
                        最近使用
                      </Table.Head>
                      <Table.Head className="px-4 py-3 text-[10px]">
                        创建时间
                      </Table.Head>
                      <Table.Head className="px-4 py-3 text-right text-[10px]">
                        操作
                      </Table.Head>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {keys.map((key) => (
                      <Table.Row key={key.id} className="text-xs">
                        <Table.Cell className="px-4 py-3 font-medium text-neutral-900">
                          {key.name}
                        </Table.Cell>
                        <Table.Cell className="px-4 py-3 font-mono text-[11px] text-neutral-500">
                          {key.keyPrefix}…
                        </Table.Cell>
                        <Table.Cell className="px-4 py-3 text-neutral-500">
                          {key.lastUsedAt
                            ? formatDateTime(key.lastUsedAt)
                            : '从未使用'}
                        </Table.Cell>
                        <Table.Cell className="px-4 py-3 text-neutral-500">
                          {formatDateTime(key.createdAt)}
                        </Table.Cell>
                        <Table.Cell className="px-4 py-3 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            shape="square"
                            size="sm"
                            icon={<Trash className="size-4" />}
                            aria-label="删除 API Key"
                            onClick={() => setPendingDelete(key)}
                          />
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              </div>
            )}
          </div>
        ) : null}

        {tab === 'docs' ? (
          <div className="space-y-5 p-4 sm:p-5">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">
                API 端点
              </h2>
              <p className="mt-1 text-xs text-neutral-500">
                所有 /v1 接口使用 Bearer API Key 鉴权；浏览器会话接口使用
                Cookie。
              </p>
            </div>
            <CodeBlock
              title="创建短链接"
              code={`curl -X POST '${apiBase}/v1/shorten' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -d '{
    "url": "https://example.com/long-page"
  }'`}
            />
            <CodeBlock
              title="创建短链接（自定义后缀 / 上限 / 有效期）"
              code={`curl -X POST '${apiBase}/v1/shorten' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -d '{
    "url": "https://example.com/long-page",
    "customSlug": "my-custom-slug",
    "maxClicks": 100,
    "expiresIn": "1m"
  }'`}
            />
            <CodeBlock
              title="创建临时邮箱"
              code={`curl -X POST '${apiBase}/v1/emails' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -d '{
    "emailAddress": "${sampleEmailAddress}"
  }'`}
            />
            <CodeBlock
              title="获取邮件列表"
              code={`curl '${apiBase}/v1/emails/MAILBOX_ID/messages?page=1&limit=20' \\
  -H 'Authorization: Bearer YOUR_API_KEY'`}
            />
            <div className="rounded-lg bg-neutral-50 p-3 text-[11px] leading-5 text-neutral-500">
              可用短链域名：
              {shortDomains.map((item) => item.host).join('、') || '暂无'}
              <br />
              可用邮箱域名：
              {emailDomains.map((item) => item.host).join('、') || '暂无'}
            </div>
          </div>
        ) : null}

        {tab === 'bitwarden' ? (
          <div className="space-y-5 p-4 sm:p-5">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">
                Bitwarden / Addy.io 别名生成
              </h2>
              <p className="mt-1 text-xs leading-5 text-neutral-500">
                Shortly 兼容 Addy.io 的别名接口。在 Bitwarden 生成器中添加自建
                Addy.io 服务，即可使用临时邮箱生成别名。
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow label="Server URL" value={`${apiBase}/api/v1/aliases`} />
              <InfoRow label="API Access Token" value={activeKey} />
              <InfoRow label="示例邮箱域名" value={sampleEmailDomain} />
              <InfoRow
                label="请求头"
                value="Authorization: Bearer YOUR_API_KEY"
              />
            </div>
            <ol className="list-decimal space-y-2 pl-5 text-xs leading-6 text-neutral-600">
              <li>打开 Bitwarden 生成器，选择 Addy.io。</li>
              <li>将 Server URL 填入上面的别名接口地址。</li>
              <li>将 API Key 填入 Base64 编码前的 API Key 位置。</li>
              <li>选择可用邮箱域名后生成别名。</li>
            </ol>
            <CodeBlock
              title="兼容接口测试"
              code={`curl -X POST '${apiBase}/api/v1/aliases' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer ${activeKey}' \\
  -H 'X-Requested-With: XMLHttpRequest' \\
  -d '{
    "domain": "${sampleEmailDomain}",
    "description": "Website: example.com. Generated by Bitwarden."
  }'`}
            />
          </div>
        ) : null}

        {tab === 'sharex' ? (
          <div className="space-y-5 p-4 sm:p-5">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">
                ShareX 集成
              </h2>
              <p className="mt-1 text-xs leading-5 text-neutral-500">
                生成 ShareX 自定义上传器配置，下载后导入 ShareX
                即可快速分享短链接。
              </p>
            </div>
            <Input
              label="API Key（用于生成配置）"
              value={sharexKey}
              onChange={(event) => setSharexKey(event.target.value)}
              placeholder="sk_shortly_..."
            />
            <CodeBlock title="shortly-sharex.sxcu" code={sharexConfig} />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                className="h-10 gap-2 px-4 text-xs"
                onClick={downloadSharexConfig}
                icon={<Download className="size-3.5" />}
              >
                下载 .sxcu
              </Button>
              <Button
                variant="secondary"
                className="h-10 gap-2 px-4 text-xs"
                onClick={() => void copyText(sharexConfig, 'ShareX 配置已复制')}
                icon={<Copy className="size-3.5" />}
              >
                复制配置
              </Button>
            </div>
          </div>
        ) : null}
      </Panel>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title="删除 API Key"
        description={
          pendingDelete
            ? `删除后，使用 ${pendingDelete.keyPrefix}… 的外部客户端将立即失效。`
            : undefined
        }
        confirmLabel="删除"
        onConfirm={handleDeleteKey}
        loading={deleteKey.isPending}
        destructive
      />
    </>
  )
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded-xl border border-neutral-200/80 bg-white p-4 app-shadow">
      <span className="flex size-8 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
        <Icon className="size-4" />
      </span>
      <p className="mt-3 text-xs text-neutral-500">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold tracking-tight text-neutral-900">
        {value}
      </p>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <div className="min-w-0">
        <p className="text-[10px] text-neutral-400">{label}</p>
        <p className="mt-1 truncate font-mono text-[11px] text-neutral-700">
          {value}
        </p>
      </div>
      <CopyButton value={value} successMessage={`${label} 已复制`} />
    </div>
  )
}
