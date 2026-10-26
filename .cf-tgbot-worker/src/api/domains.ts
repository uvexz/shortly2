/** Domain resolution: KV cache → /v1/domains → env fallback. */

import type { DomainInfo, ResolvedDomains, ShortlyApi } from './types';
import type { Bindings } from '../env';
import { getRuntimeConfig } from '../env';
import type { BotStore } from '../state/store';

function normalizeHost(value: string): string {
	return value
		.trim()
		.replace(/^https?:\/\//i, '')
		.replace(/\/+$/, '')
		.toLowerCase();
}

function toDomainInfos(hosts: string[], defaultIndex = 0): DomainInfo[] {
	const seen = new Set<string>();
	const result: DomainInfo[] = [];
	hosts.forEach((rawHost, index) => {
		const host = normalizeHost(rawHost);
		if (!host || seen.has(host)) return;
		seen.add(host);
		result.push({ host, isDefault: index === defaultIndex });
	});
	return result;
}

function normalizeDomainInfos(input: DomainInfo[] | undefined, kind: 'short' | 'email'): DomainInfo[] {
	if (!Array.isArray(input)) return [];

	const normalized: DomainInfo[] = [];
	const seen = new Set<string>();
	for (const item of input) {
		if (!item || typeof item.host !== 'string') continue;
		const host = normalizeHost(item.host);
		if (!host || seen.has(host)) continue;
		seen.add(host);
		normalized.push({
			host,
			isDefault: Boolean(item.isDefault),
			...(kind === 'short' && typeof item.minSlugLength === 'number' ? { minSlugLength: item.minSlugLength } : {}),
			...(kind === 'email' && typeof item.minLocalPartLength === 'number' ? { minLocalPartLength: item.minLocalPartLength } : {}),
		});
	}

	if (!normalized.length) return [];

	// Defaults first, then the rest, mirroring the old worker behaviour.
	const defaults = normalized.filter((item) => item.isDefault);
	const others = normalized.filter((item) => !item.isDefault);
	const ordered = [...defaults, ...others];
	if (!defaults.length) ordered[0] = { ...ordered[0], isDefault: true };
	return ordered;
}

export function pickDefaultDomain(domains: DomainInfo[]): DomainInfo | null {
	if (!domains.length) return null;
	return domains.find((item) => item.isDefault) ?? domains[0];
}

export function findDomain(domains: DomainInfo[], host: string | undefined | null): DomainInfo | null {
	if (!host) return null;
	const normalized = normalizeHost(host);
	return domains.find((item) => item.host === normalized) ?? null;
}

export function resolveDefaultHost(domains: DomainInfo[], preferredHost?: string | null): string {
	return findDomain(domains, preferredHost)?.host ?? pickDefaultDomain(domains)?.host ?? '';
}

export async function resolveDomains(api: ShortlyApi, store: BotStore, env: Bindings): Promise<ResolvedDomains> {
	const config = getRuntimeConfig(env);
	const cached = await store.getDomainCache();
	const cacheFresh = cached ? Date.now() - cached.fetchedAt < config.domainCacheTtlSeconds * 1000 : false;

	if (cached && cacheFresh) {
		return { short: cached.short, email: cached.email };
	}

	const result = await api.getDomains();
	if (result.ok) {
		const short = normalizeDomainInfos(result.data.shortDomains, 'short');
		const email = normalizeDomainInfos(result.data.emailDomains, 'email');
		if (short.length && email.length) {
			await store.saveDomainCache({ short, email, fetchedAt: Date.now() });
			return { short, email };
		}
	}

	if (cached) {
		return { short: cached.short, email: cached.email };
	}

	return {
		short: toDomainInfos(config.fallbackShortDomains),
		email: toDomainInfos(config.fallbackEmailDomains),
	};
}
