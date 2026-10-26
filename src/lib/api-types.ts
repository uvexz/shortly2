export type Paginated<T> = {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export type LinkStatusFields = {
  hasClickLimit: boolean
  hasExpiration: boolean
  isExpired: boolean
  expiredByClicks: boolean
  expiredByDate: boolean
}

export type ShortLinkDto = LinkStatusFields & {
  id: string
  slug: string
  domain: string
  shortUrl: string
  originalUrl: string
  clicks: number
  maxClicks: number | null
  expiresAt: string | null
  createdAt: string
}

export type LinkLogDto = {
  id: string
  linkId: string | null
  linkSlug: string
  ownerUserId: string | null
  eventType: string
  referrer: string | null
  userAgent: string | null
  ipAddress: string | null
  statusCode: number | null
  createdAt: string
}

export type LinkLogsResponse = {
  data: LinkLogDto[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type TempMailboxDto = {
  id: string
  emailAddress: string
  domain: string
  createdAt: string
  unreadCount: number
  messageCount: number
}

export type TempMessageSummary = {
  id: string
  mailboxId: string
  mailboxEmailAddress: string
  messageId: string | null
  from: string
  fromName: string | null
  subject: string
  preview: string
  receivedAt: string
  isRead: boolean
  hasAttachments: boolean
}

export type TempMessagesResponse = Paginated<TempMessageSummary> & {
  unread: number
}

export type MailboxMessagesResponse = {
  mailbox: { id: string; emailAddress: string }
  data: Array<{
    id: string
    messageId: string | null
    from: string
    fromName: string | null
    subject: string
    text: string
    html: string
    receivedAt: string
    isRead: boolean
    hasAttachments: boolean
  }>
  total: number
  page: number
  limit: number
  totalPages: number
}

export type MessageContact = {
  name?: string | null
  address?: string | null
}

export type MessageHeader = {
  name: string
  value: string
}

export type MessageAttachment = {
  id: string
  filename: string
  mimeType: string
  size: number
}

export type TempMessageDetail = {
  id: string
  mailboxId: string
  mailboxEmailAddress: string
  messageId: string | null
  from: string
  fromName: string | null
  subject: string
  text: string
  html: string
  receivedAt: string
  isRead: boolean
  cc: MessageContact[]
  replyTo: MessageContact[]
  headers: MessageHeader[]
  attachments: MessageAttachment[]
  hasText: boolean
  hasHtml: boolean
  hasAttachments: boolean
}

export type PublicDomainsResponse = {
  emailDomains: Array<{
    host: string
    isDefault: boolean
    minLocalPartLength: number
  }>
  shortDomains: Array<{
    host: string
    isDefault: boolean
    minSlugLength: number
  }>
  telegramBotUsername: string
}

export type ApiKeyDto = {
  id: string
  name: string
  keyPrefix: string
  lastUsedAt: string | null
  createdAt: string
}

export type CreateApiKeyResponse = {
  data: ApiKeyDto
  plainKey: string
}

export type SiteSettingsDto = {
  id: string
  siteName: string
  siteUrl: string
  telegramBotUsername: string
  userMaxLinksPerHour: number
}

export type AdminLinkDto = ShortLinkDto & {
  userId: string | null
  userName: string | null
  userEmail: string | null
}

export type AdminUserDto = {
  id: string
  name: string
  email: string
  role: string
  emailVerified: boolean
  image: string | null
  banned: boolean
  banReason: string | null
  banExpires: string | null
  createdAt: string
  linkCount: number
}

export type AdminDomainDto = {
  id: string
  host: string
  supportsShortLinks: boolean
  shortLinkMinSlugLength: number
  supportsTempEmail: boolean
  tempEmailMinLocalPartLength: number
  isActive: boolean
  isDefaultShortDomain: boolean
  isDefaultEmailDomain: boolean
  createdAt: string
}

export type AdminMailboxDto = {
  id: string
  emailAddress: string
  domain: string
  isActive: boolean
  createdAt: string
  userId: string
  userName: string | null
  userEmail: string | null
  unreadCount: number
  messageCount: number
}

export type AdminMessageSummary = TempMessageSummary & {
  userId: string
  userName: string | null
  userEmail: string | null
}

export type AdminArchiveSummary = {
  id: string
  toEmail: string
  messageId: string | null
  from: string
  fromName: string | null
  subject: string
  preview: string
  receivedAt: string
  failureReason: string
  hasAttachments: boolean
}

export type AdminMessageDetail = TempMessageDetail & {
  userId: string
  userName: string | null
  userEmail: string | null
}

export type AdminArchiveDetail = {
  id: string
  toEmail: string
  messageId: string | null
  from: string
  fromName: string | null
  subject: string
  text: string
  html: string
  receivedAt: string
  cc: MessageContact[]
  replyTo: MessageContact[]
  headers: MessageHeader[]
  attachments: MessageAttachment[]
  failureReason: string
  hasText: boolean
  hasHtml: boolean
  hasAttachments: boolean
}
