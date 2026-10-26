import { useState } from 'react'
import { Button, Input } from '@cloudflare/kumo'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Fingerprint,
  GithubLogo,
  Key,
  EnvelopeSimple,
} from '@phosphor-icons/react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { authClient } from '@/lib/auth-client'
import { getErrorMessage } from '@/lib/api-client'
import { toastError, toastSuccess } from '@/lib/toast'

type Step = 'email' | 'otp' | 'add-passkey'

export function AuthForm({
  mode,
  enableEmail,
  enableGithub,
}: {
  mode: 'login' | 'register'
  enableEmail: boolean
  enableGithub: boolean
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<Step>('email')
  const [loading, setLoading] = useState(false)

  const supportsPasskey =
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined'
  const hasPasskeyLogin = mode === 'login' && supportsPasskey
  const hasSecondaryProviders = enableGithub || hasPasskeyLogin
  const providerCount = (enableGithub ? 1 : 0) + (hasPasskeyLogin ? 1 : 0)

  async function finish() {
    await router.invalidate()
    await navigate({ to: '/dashboard' })
  }

  async function handleSendOtp() {
    if (!email.trim()) {
      toastError({ title: '请输入邮箱地址' })
      return
    }
    setLoading(true)
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: email.trim(),
        type: 'sign-in',
      })
      if (result.error) {
        toastError({
          title: getErrorMessage(result.error, '发送验证码失败'),
        })
        return
      }
      setStep('otp')
      toastSuccess({ title: '验证码已发送', description: email.trim() })
    } catch (error) {
      toastError({ title: getErrorMessage(error, '发送验证码失败') })
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp() {
    if (otp.trim().length < 6) {
      toastError({ title: '请输入 6 位验证码' })
      return
    }
    setLoading(true)
    try {
      const result = await authClient.signIn.emailOtp({
        email: email.trim(),
        otp: otp.trim(),
      })
      if (result.error) {
        toastError({
          title: getErrorMessage(result.error, '验证码验证失败'),
        })
        return
      }

      if (mode === 'register' && supportsPasskey) {
        setStep('add-passkey')
      } else {
        toastSuccess({ title: '登录成功' })
        await finish()
      }
    } catch (error) {
      toastError({ title: getErrorMessage(error, '验证码验证失败') })
    } finally {
      setLoading(false)
    }
  }

  async function handleGithub() {
    setLoading(true)
    try {
      const result = await authClient.signIn.social({
        provider: 'github',
        callbackURL: '/dashboard',
      })
      if (result?.error) {
        toastError({ title: getErrorMessage(result.error, 'GitHub 登录失败') })
      }
    } catch (error) {
      toastError({ title: getErrorMessage(error, 'GitHub 登录失败') })
    } finally {
      setLoading(false)
    }
  }

  async function handlePasskeyLogin() {
    setLoading(true)
    try {
      const result = await authClient.signIn.passkey()
      if (result?.error) {
        toastError({ title: getErrorMessage(result.error, 'Passkey 登录失败') })
        return
      }
      toastSuccess({ title: '登录成功' })
      await finish()
    } catch (error) {
      toastError({ title: getErrorMessage(error, 'Passkey 登录失败') })
    } finally {
      setLoading(false)
    }
  }

  async function handleAddPasskey() {
    setLoading(true)
    try {
      const result = await authClient.passkey.addPasskey({
        name: `${navigator.platform || '设备'} · ${new Date().toLocaleDateString()}`,
      })
      if (result?.error) {
        toastError({ title: getErrorMessage(result.error, '无法保存 Passkey') })
        return
      }
      toastSuccess({ title: 'Passkey 已保存，下次可一键登录' })
      await finish()
    } catch (error) {
      toastError({ title: getErrorMessage(error, '无法保存 Passkey') })
    } finally {
      setLoading(false)
    }
  }

  if (step === 'add-passkey') {
    return (
      <div className="flex flex-col items-center gap-6 py-2 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-neutral-100 text-neutral-900">
          <CheckCircle className="size-6" weight="fill" />
        </span>
        <div>
          <p className="text-lg font-semibold text-neutral-900">账户创建成功</p>
          <p className="mt-2 max-w-xs text-sm leading-6 text-neutral-500">
            保存 Passkey，以便下次无需验证码即可立即登录。
          </p>
        </div>
        <div className="flex w-full flex-col gap-2">
          <Button
            variant="primary"
            className="h-10 w-full gap-2 text-xs"
            loading={loading}
            onClick={() => void handleAddPasskey()}
            icon={<Key className="size-4" />}
          >
            保存 Passkey
          </Button>
          <Button
            variant="ghost"
            className="h-10 w-full text-xs"
            disabled={loading}
            onClick={() => void finish()}
          >
            跳过并进入工作台
          </Button>
        </div>
      </div>
    )
  }

  if (!enableEmail && !hasSecondaryProviders) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-xs leading-5 text-neutral-500">
        当前没有启用可用的登录方式。请稍后再试，或联系站点管理员。
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {enableEmail ? (
        step === 'email' ? (
          <div className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="auth-email"
                className="mb-2 block text-xs font-medium text-neutral-700"
              >
                电子邮箱地址
              </label>
              <div className="relative">
                <EnvelopeSimple className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
                <Input
                  id="auth-email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  spellCheck={false}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void handleSendOtp()
                  }}
                  disabled={loading}
                  className="w-full pl-9"
                  aria-label="电子邮箱地址"
                />
              </div>
            </div>
            <Button
              variant="primary"
              className="h-10 w-full gap-2 text-xs"
              loading={loading}
              disabled={loading || !email.trim()}
              onClick={() => void handleSendOtp()}
              icon={<ArrowRight className="size-4" />}
            >
              {mode === 'register' ? '继续创建账户' : '获取登录验证码'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="auth-otp"
                className="mb-2 block text-xs font-medium text-neutral-700"
              >
                输入验证码
              </label>
              <div className="mb-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <p className="text-[10px] text-neutral-400">验证码已发送至</p>
                <p className="mt-1 break-all text-xs font-medium text-neutral-800">
                  {email}
                </p>
              </div>
              <Input
                id="auth-otp"
                type="text"
                inputMode="numeric"
                placeholder="123456"
                autoComplete="one-time-code"
                spellCheck={false}
                value={otp}
                onChange={(event) =>
                  setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleVerifyOtp()
                }}
                disabled={loading}
                className="h-12 w-full text-center font-mono text-lg tracking-[0.4em]"
                aria-label="六位验证码"
              />
            </div>
            <Button
              variant="primary"
              className="h-10 w-full text-xs"
              loading={loading}
              disabled={loading || otp.length < 6}
              onClick={() => void handleVerifyOtp()}
            >
              完成验证并登录
            </Button>
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                className="h-9 gap-2 px-2 text-xs"
                disabled={loading}
                onClick={() => {
                  setStep('email')
                  setOtp('')
                }}
                icon={<ArrowLeft className="size-3.5" />}
              >
                修改邮箱
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-9 px-2 text-xs"
                disabled={loading}
                onClick={() => void handleSendOtp()}
              >
                重新发送
              </Button>
            </div>
          </div>
        )
      ) : null}

      {step === 'email' && enableEmail && hasSecondaryProviders ? (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-1">
          <span className="h-px bg-neutral-200" />
          <span className="text-[10px] text-neutral-400">或使用其他方式</span>
          <span className="h-px bg-neutral-200" />
        </div>
      ) : null}

      {!enableEmail && !enableGithub && hasPasskeyLogin ? (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-[11px] leading-5 text-neutral-500">
          当前站点仅启用了 Passkey 登录。请使用已注册通行密钥的设备，并在 HTTPS
          或 localhost 环境下继续。
        </div>
      ) : null}

      {step === 'email' && hasSecondaryProviders ? (
        <div
          className={
            providerCount > 1
              ? 'grid grid-cols-1 gap-2 sm:grid-cols-2'
              : 'grid grid-cols-1 gap-2'
          }
        >
          {enableGithub ? (
            <Button
              variant="secondary"
              className="h-10 w-full gap-2 text-xs"
              disabled={loading}
              onClick={() => void handleGithub()}
              icon={<GithubLogo className="size-4" />}
            >
              GitHub
            </Button>
          ) : null}
          {hasPasskeyLogin ? (
            <Button
              variant="secondary"
              className="h-10 w-full gap-2 text-xs"
              disabled={loading}
              onClick={() => void handlePasskeyLogin()}
              icon={<Fingerprint className="size-4" />}
            >
              Passkey
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
