import { Plus } from '@phosphor-icons/react'

export const FAQ_ITEMS = [
  {
    question: '使用 Shortly 需要付费吗？',
    answer: '当前免费开放，注册后即可使用，无需绑卡。',
  },
  {
    question: '短链接可以怎么设置？',
    answer:
      '可以自定义后缀、有效期和点击上限。链接过期或达到上限后会停止跳转，也可以随时在工作台删除。',
  },
  {
    question: '临时邮箱能收哪些邮件？',
    answer:
      '文本邮件和 HTML 邮件都可以接收，附件会显示元数据。HTML 内容在沙箱 iframe 中渲染。',
  },
  {
    question: '临时邮箱会自动过期吗？',
    answer: '不会。地址会保留到你在工作台手动删除。',
  },
  {
    question: '支持哪些登录方式？',
    answer: 'GitHub、Passkey 和邮箱验证码。Shortly 不启用邮箱密码登录。',
  },
  {
    question: '点击数据能看到什么？',
    answer:
      '每条链接都有访问次数和最近访问记录。分析页按链接展示来源与时间；全局趋势基于最近 500 条链接样本，界面会标注范围。',
  },
  {
    question: 'API 怎么接入？',
    answer:
      '在 API 管理页创建 Key，然后把 Bearer 头带上。可调用 /v1/shorten、/v1/emails 等接口，ShareX 配置可以一键导出。',
  },
  {
    question: '链接和邮件数据安全吗？',
    answer:
      '会话由 Better Auth 管理，OAuth Token 加密存储，API Key 只保存前缀与加盐哈希。HTML 邮件在沙箱中打开。',
  },
] as const

export function LandingFaq() {
  return (
    <div className="border-t border-kumo-line">
      {FAQ_ITEMS.map((item) => (
        <details
          key={item.question}
          className="group border-b border-kumo-line"
        >
          <summary className="focus-ring flex cursor-pointer list-none items-start justify-between gap-4 py-4 text-base font-medium text-kumo-strong transition-colors duration-300 ease-base hover:text-kumo-strong [&::-webkit-details-marker]:hidden">
            {item.question}
            <Plus className="mt-0.5 size-4 shrink-0 text-kumo-subtle transition-transform duration-500 ease-base group-open:rotate-45" />
          </summary>
          <p className="max-w-[640px] pb-4 pr-8 text-base leading-6 text-kumo-subtle text-pretty">
            {item.answer}
          </p>
        </details>
      ))}
    </div>
  )
}
