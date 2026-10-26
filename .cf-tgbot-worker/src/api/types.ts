/** Data shapes returned by Shortly's /v1 API. Keep in sync with src/lib/api-types.ts in the app. */

export type DomainInfo = {
	host: string;
	isDefault: boolean;
	minSlugLength?: number;
	minLocalPartLength?: number;
};

export type DomainsResponse = {
	emailDomains?: DomainInfo[];
	shortDomains?: DomainInfo[];
	telegramBotUsername?: string;
};

export type ResolvedDomains = {
	short: DomainInfo[];
	email: DomainInfo[];
};

export type ExpiryValue = '1h' | '1d' | '1w' | '1m' | '3m' | '6m' | '1y';

export type ShortenInput = {
	url: string;
	customSlug?: string;
	domain?: string;
	expiresIn?: ExpiryValue;
	maxClicks?: number;
};

export type ShortenResult = {
	shortUrl: string;
	slug: string;
	domain: string;
	maxClicks: number | null;
};

export type LinkItem = {
	id: string;
	slug: string;
	domain: string;
	shortUrl: string;
	originalUrl: string;
	clicks: number;
	maxClicks: number | null;
	expiresAt: string | number | null;
	createdAt: string | number | null;
	hasClickLimit: boolean;
	hasExpiration: boolean;
	isExpired: boolean;
	expiredByClicks: boolean;
	expiredByDate: boolean;
};

export type Paginated<T> = {
	data: T[];
	total: number;
	page: number;
	limit: number;
	totalPages: number;
};

export type MailboxItem = {
	id: string;
	emailAddress: string;
	domain: string;
	createdAt: string | number | null;
	unreadCount: number;
	messageCount: number;
};

export type MailMessageItem = {
	id: string;
	messageId: string | null;
	from: string;
	fromName: string | null;
	subject: string | null;
	text: string | null;
	html: string | null;
	receivedAt: string | number | Date | null;
	isRead: boolean;
	hasAttachments: boolean;
};

export type MailboxMessagePage = Paginated<MailMessageItem> & {
	mailbox: { id: string; emailAddress: string };
};

export type MessageContact = {
	name?: string | null;
	address?: string | null;
};

export type MessageHeader = {
	name?: string | null;
	value?: string | null;
};

export type MessageAttachment = {
	id?: string;
	filename?: string | null;
	mimeType?: string | null;
	size?: number | null;
};

export type MessageDetail = {
	id: string;
	mailboxId: string;
	mailboxEmailAddress: string;
	messageId?: string | null;
	from: string;
	fromName?: string | null;
	subject?: string | null;
	text?: string | null;
	html?: string | null;
	receivedAt?: string | number | Date | null;
	isRead?: boolean;
	cc?: MessageContact[];
	replyTo?: MessageContact[];
	headers?: MessageHeader[];
	attachments?: MessageAttachment[];
	hasText?: boolean;
	hasHtml?: boolean;
	hasAttachments?: boolean;
};

export type CreateMailboxResult = {
	data: MailboxItem;
};

export type ApiFailureKind = 'unauthorized' | 'rate_limited' | 'not_found' | 'bad_request' | 'server' | 'network' | 'invalid_response';

export type ApiFailure = {
	status: number;
	message: string;
	kind: ApiFailureKind;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure };

export type ShortlyApi = {
	getDomains(): Promise<ApiResult<DomainsResponse>>;
	shorten(apiKey: string, input: ShortenInput): Promise<ApiResult<ShortenResult>>;
	listLinks(apiKey: string, page: number, limit?: number): Promise<ApiResult<Paginated<LinkItem>>>;
	listMailboxes(apiKey: string, page: number, limit?: number): Promise<ApiResult<Paginated<MailboxItem>>>;
	createMailbox(apiKey: string, emailAddress: string): Promise<ApiResult<CreateMailboxResult>>;
	deleteMailbox(apiKey: string, mailboxId: string): Promise<ApiResult<{ success: boolean }>>;
	listMessages(apiKey: string, mailboxId: string, page: number, limit?: number): Promise<ApiResult<MailboxMessagePage>>;
	getMessage(apiKey: string, messageId: string): Promise<ApiResult<{ data: MessageDetail }>>;
	markMessageRead(apiKey: string, messageId: string): Promise<ApiResult<{ success: boolean }>>;
	deleteMessage(apiKey: string, messageId: string): Promise<ApiResult<{ success: boolean }>>;
	bindTelegram(apiKey: string, chatId: string, username?: string): Promise<ApiResult<{ success?: boolean; data?: unknown }>>;
};

export const EXPIRY_OPTIONS: Array<{ value: ExpiryValue; label: string; short: string }> = [
	{ value: '1h', label: '1 小时', short: '1h' },
	{ value: '1d', label: '1 天', short: '1d' },
	{ value: '1w', label: '1 周', short: '1w' },
	{ value: '1m', label: '1 个月', short: '1m' },
	{ value: '3m', label: '3 个月', short: '3m' },
	{ value: '6m', label: '6 个月', short: '6m' },
	{ value: '1y', label: '1 年', short: '1y' },
];

export const CLICK_LIMIT_OPTIONS = [10, 100, 1000, 10000] as const;
