import { eq } from 'drizzle-orm'
import { makeSignature } from 'better-auth/crypto'
import { db, initDb } from '../src/db'
import {
  session,
  siteDomain,
  tempEmailMessage,
  tempMailbox,
  user,
} from '../src/db/schema'

const DOMAIN_HOST = 'short.local'

async function ensureDomain() {
  const existing = await db
    .select({ id: siteDomain.id })
    .from(siteDomain)
    .where(eq(siteDomain.host, DOMAIN_HOST))
    .get()

  if (existing) return

  await db.insert(siteDomain).values({
    id: crypto.randomUUID(),
    host: DOMAIN_HOST,
    supportsShortLinks: true,
    shortLinkMinSlugLength: 1,
    supportsTempEmail: true,
    tempEmailMinLocalPartLength: 1,
    isActive: true,
    isDefaultShortDomain: true,
    isDefaultEmailDomain: true,
    createdAt: new Date(),
  })
}

async function ensureUser(input: {
  email: string
  name: string
  role: 'admin' | 'user'
}) {
  const existing = await db
    .select()
    .from(user)
    .where(eq(user.email, input.email))
    .get()

  if (existing) return existing

  const [created] = await db
    .insert(user)
    .values({
      id: crypto.randomUUID(),
      name: input.name,
      email: input.email,
      emailVerified: true,
      role: input.role,
      banned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning()

  return created
}

async function ensureSeedMessages(userId: string) {
  const mailbox = await db
    .select({ id: tempMailbox.id, emailAddress: tempMailbox.emailAddress })
    .from(tempMailbox)
    .where(eq(tempMailbox.userId, userId))
    .get()

  if (!mailbox) return

  await db
    .insert(tempEmailMessage)
    .values({
      id: 'seed-message-welcome',
      mailboxId: mailbox.id,
      messageId: 'seed-message-welcome@short.local',
      from: 'noreply@github.com',
      fromName: 'GitHub',
      subject: '新的登录提醒',
      text: '我们检测到你的账户在新的设备上登录。如果这是你本人操作，可以忽略这封邮件。',
      html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto"><h2 style="font-size:18px">新的登录提醒</h2><p style="color:#525252;line-height:1.7">我们检测到你的账户在新的设备上登录。</p><div style="margin:20px 0;padding:16px;border:1px solid #e5e5e5;border-radius:8px;background:#fafafa"><p style="margin:0;font-size:13px;color:#737373">如果这是你本人操作，可以忽略这封邮件。</p></div><p style="font-size:12px;color:#a3a3a3">这是一封来自 Shortly 联通性测试的示例邮件。</p></div>`,
      receivedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      isRead: false,
      ccJson: '[]',
      replyToJson: '[]',
      headersJson: JSON.stringify([
        { name: 'From', value: 'GitHub <noreply@github.com>' },
        { name: 'To', value: mailbox.emailAddress },
        { name: 'Subject', value: '新的登录提醒' },
      ]),
      createdAt: new Date(),
    })
    .onConflictDoNothing()

  await db
    .insert(tempEmailMessage)
    .values({
      id: 'seed-message-receipt',
      mailboxId: mailbox.id,
      messageId: 'seed-message-receipt@short.local',
      from: 'billing@example.com',
      fromName: 'Example Billing',
      subject: '支付确认 · ¥ 69.00',
      text: '你的订阅已成功续费。金额：¥ 69.00。如需帮助，请回复这封邮件。',
      html: `<div style="font-family:sans-serif;padding:8px"><h2 style="font-size:16px">支付确认</h2><p style="color:#525252">你的订阅已成功续费。</p><p style="font-size:24px;font-weight:600">¥ 69.00</p><p style="font-size:12px;color:#a3a3a3">示例邮件 · 请勿用于真实支付。</p></div>`,
      receivedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
      isRead: true,
      ccJson: '[]',
      replyToJson: '[]',
      headersJson: '[]',
      createdAt: new Date(),
    })
    .onConflictDoNothing()
}

async function createSessionCookie(userId: string) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID().replace(/-/g, '')}`
  await db.delete(session).where(eq(session.userId, userId))
  await db.insert(session).values({
    id: crypto.randomUUID(),
    token,
    userId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) {
    throw new Error('BETTER_AUTH_SECRET is missing')
  }
  const signature = await makeSignature(token, secret)
  return `better-auth.session_token=${token}.${signature}`
}

await initDb()
await ensureDomain()

const admin = await ensureUser({
  email: 'admin@short.local',
  name: 'JK',
  role: 'admin',
})
const member = await ensureUser({
  email: 'user@short.local',
  name: 'Regular User',
  role: 'user',
})
await ensureSeedMessages(admin.id)

console.log(`domain: https://${DOMAIN_HOST}`)
console.log(`admin:  ${await createSessionCookie(admin.id)}`)
console.log(`member: ${await createSessionCookie(member.id)}`)
