import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { emailOTP } from 'better-auth/plugins/email-otp'
import { passkey } from '@better-auth/passkey'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { Resend } from 'resend'
import { db } from '@/db'
import * as schema from '@/db/schema'
import { eq } from 'drizzle-orm'
import { APIError } from 'better-auth/api'

const resendApiKey = process.env.RESEND_API_KEY
const resendFrom = process.env.RESEND_FROM_EMAIL || 'noreply@example.com'
const githubClientId = process.env.GITHUB_CLIENT_ID
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET
const bootstrapAdminEmails = new Set(
  (process.env.BOOTSTRAP_ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
)

const plugins: Parameters<typeof betterAuth>[0]['plugins'] = [
  passkey({
    rpName: 'Shortly',
  }),
]

const devOtpLog =
  !resendApiKey &&
  process.env.NODE_ENV !== 'production' &&
  process.env.AUTH_OTP_DEV_LOG === 'true'

if (resendApiKey || devOtpLog) {
  const resend = resendApiKey ? new Resend(resendApiKey) : null
  plugins.push(
    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        if (!resend) {
          console.log(`[auth] development OTP for ${email}: ${otp}`)
          return
        }

        await resend.emails.send({
          from: resendFrom,
          to: email,
          subject: 'Your Shortly login code',
          html: `<p>Your verification code is: <strong>${otp}</strong></p><p>This code expires in 10 minutes.</p>`,
        })
      },
      otpLength: 6,
      expiresIn: 600,
      // Never persist the plaintext OTP: a database leak must not allow account
      // takeover. `hashed` stores a one-way hash of the code instead.
      storeOTP: 'hashed',
    }),
  )
}

const socialProviders: Parameters<typeof betterAuth>[0]['socialProviders'] = {}

if (githubClientId && githubClientSecret) {
  socialProviders.github = {
    clientId: githubClientId,
    clientSecret: githubClientSecret,
  }
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET!,
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    // Run Better Auth's multi-step writes (OAuth user + account, OTP user +
    // session, passkey counter + session + challenge) inside DB transactions so
    // a partial failure cannot leave half-created auth rows behind.
    transaction: true,
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      passkey: schema.passkey,
    },
  }),
  account: {
    // OAuth provider tokens are secrets: never store them in plaintext.
    encryptOAuthTokens: true,
  },
  emailAndPassword: {
    enabled: false,
  },
  session: {
    cookieCache: {
      enabled: true,
      // Serve session from the signed cookie for up to 5 minutes before
      // re-reading the session table. Cuts a DB round-trip off most
      // authenticated requests. Trade-off: role/ban changes take up to
      // this long to propagate to an already-signed-in client.
      maxAge: 300,
    },
  },
  socialProviders,
  plugins: [...plugins, tanstackStartCookies()],
  user: {
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'user',
        input: false,
      },
      banned: {
        type: 'boolean',
        defaultValue: false,
        input: false,
      },
      banReason: {
        type: 'string',
        required: false,
        input: false,
      },
      banExpires: {
        type: 'date',
        required: false,
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Promote bootstrap admins in the same insert that creates the user:
        // an `after` hook would need a second write and silently fail to
        // promote on a transient error after the user row already exists.
        before: async (user) => {
          if (!bootstrapAdminEmails.has(user.email.trim().toLowerCase())) {
            return
          }

          return { data: { ...user, role: 'admin' } }
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          // v1 enforces one session row per user via a unique index. Better Auth
          // otherwise inserts a second row on re-login, so clear the previous
          // session before creating the new one.
          await db
            .delete(schema.session)
            .where(eq(schema.session.userId, session.userId))

          const user = await db
            .select({
              id: schema.user.id,
              banned: schema.user.banned,
              banExpires: schema.user.banExpires,
            })
            .from(schema.user)
            .where(eq(schema.user.id, session.userId))
            .get()

          if (!user?.banned) {
            return
          }

          if (user.banExpires && user.banExpires.getTime() <= Date.now()) {
            await db
              .update(schema.user)
              .set({
                banned: false,
                banReason: null,
                banExpires: null,
                updatedAt: new Date(),
              })
              .where(eq(schema.user.id, user.id))
            return
          }

          throw APIError.from('FORBIDDEN', {
            message: '账号已被封禁。如有疑问，请联系管理员。',
            code: 'BANNED_USER',
          })
        },
      },
    },
  },
})

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
