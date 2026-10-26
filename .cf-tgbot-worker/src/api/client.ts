/** Typed client for Shortly's public /v1 API. All failures are normalised to ApiResult. */

import type { Bindings } from '../env';
import { getRuntimeConfig } from '../env';
import type {
	ApiFailure,
	ApiResult,
	CreateMailboxResult,
	DomainsResponse,
	LinkItem,
	MailboxMessagePage,
	MailboxItem,
	MessageDetail,
	Paginated,
	ShortenInput,
	ShortenResult,
	ShortlyApi,
} from './types';

const REQUEST_TIMEOUT_MS = 10000;
const MAX_ERROR_MESSAGE_LENGTH = 300;

function classifyStatus(status: number): ApiFailure['kind'] {
	if (status === 401) return 'unauthorized';
	if (status === 404) return 'not_found';
	if (status === 429) return 'rate_limited';
	if (status === 400 || status === 409 || status === 422) return 'bad_request';
	return 'server';
}

async function readErrorMessage(response: Response): Promise<string> {
	const fallback = `HTTP ${response.status}`;
	try {
		const contentType = response.headers.get('content-type') ?? '';
		if (contentType.includes('application/json')) {
			const data = (await response.json()) as { error?: unknown; message?: unknown } | null;
			const raw = data?.error ?? data?.message;
			if (typeof raw === 'string' && raw.trim()) return raw.trim().slice(0, MAX_ERROR_MESSAGE_LENGTH);
		}
		const text = (await response.text()).trim();
		return text.slice(0, MAX_ERROR_MESSAGE_LENGTH) || fallback;
	} catch {
		return fallback;
	}
}

export function createShortlyApi(env: Bindings, fetchImpl: typeof fetch = fetch): ShortlyApi {
	const config = getRuntimeConfig(env);
	const baseUrl = config.apiBaseUrl;

	async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
		if (!baseUrl) {
			return { ok: false, error: { status: 0, kind: 'network', message: 'API_BASE_URL 未配置' } };
		}

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
		try {
			const response = await fetchImpl(`${baseUrl}${path}`, {
				...init,
				headers: {
					accept: 'application/json',
					...(init.body ? { 'content-type': 'application/json' } : {}),
					...init.headers,
				},
				signal: controller.signal,
			});

			if (!response.ok) {
				return {
					ok: false,
					error: { status: response.status, kind: classifyStatus(response.status), message: await readErrorMessage(response) },
				};
			}

			const payload = (await response.json().catch(() => null)) as unknown;
			if (payload === null || typeof payload !== 'object') {
				return { ok: false, error: { status: response.status, kind: 'invalid_response', message: '接口返回格式异常' } };
			}

			return { ok: true, data: payload as T };
		} catch (error) {
			console.error(`Shortly API request failed (${path}):`, error);
			return { ok: false, error: { status: 0, kind: 'network', message: '无法连接 Shortly API，请稍后再试' } };
		} finally {
			clearTimeout(timer);
		}
	}

	function authHeaders(apiKey: string): Record<string, string> {
		return { authorization: `Bearer ${apiKey}` };
	}

	return {
		getDomains() {
			return request<DomainsResponse>('/domains', { method: 'GET' });
		},

		shorten(apiKey, input: ShortenInput) {
			return request<ShortenResult>('/shorten', {
				method: 'POST',
				headers: authHeaders(apiKey),
				body: JSON.stringify(input),
			});
		},

		listLinks(apiKey, page, limit = 5) {
			return request<Paginated<LinkItem>>(`/links?page=${page}&limit=${limit}`, {
				method: 'GET',
				headers: authHeaders(apiKey),
			});
		},

		listMailboxes(apiKey, page, limit = 5) {
			return request<Paginated<MailboxItem>>(`/emails?page=${page}&limit=${limit}`, {
				method: 'GET',
				headers: authHeaders(apiKey),
			});
		},

		createMailbox(apiKey, emailAddress) {
			return request<CreateMailboxResult>('/emails', {
				method: 'POST',
				headers: authHeaders(apiKey),
				body: JSON.stringify({ emailAddress }),
			});
		},

		deleteMailbox(apiKey, mailboxId) {
			return request<{ success: boolean }>(`/emails/${encodeURIComponent(mailboxId)}`, {
				method: 'DELETE',
				headers: authHeaders(apiKey),
			});
		},

		listMessages(apiKey, mailboxId, page, limit = 5) {
			return request<MailboxMessagePage>(`/emails/${encodeURIComponent(mailboxId)}/messages?page=${page}&limit=${limit}`, {
				method: 'GET',
				headers: authHeaders(apiKey),
			});
		},

		getMessage(apiKey, messageId) {
			return request<{ data: MessageDetail }>(`/emails/messages/${encodeURIComponent(messageId)}`, {
				method: 'GET',
				headers: authHeaders(apiKey),
			});
		},

		markMessageRead(apiKey, messageId) {
			return request<{ success: boolean }>(`/emails/messages/${encodeURIComponent(messageId)}/read`, {
				method: 'POST',
				headers: authHeaders(apiKey),
			});
		},

		deleteMessage(apiKey, messageId) {
			return request<{ success: boolean }>(`/emails/messages/${encodeURIComponent(messageId)}`, {
				method: 'DELETE',
				headers: authHeaders(apiKey),
			});
		},

		bindTelegram(apiKey, chatId, username) {
			return request<{ success?: boolean; data?: unknown }>('/integrations/telegram/bind', {
				method: 'POST',
				headers: authHeaders(apiKey),
				body: JSON.stringify({ chatId, ...(username ? { username } : {}) }),
			});
		},
	};
}
