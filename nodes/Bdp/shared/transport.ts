import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	IHttpRequestOptions,
} from 'n8n-workflow';
import { NodeOperationError, sleep } from 'n8n-workflow';

export const PAGE_SIZE = 5000;
const MAX_RETRIES = 3;
const MAX_RETRY_AFTER_MS = 60_000;

export type BdpContext = IExecuteFunctions | ILoadOptionsFunctions;

export interface BdpPage {
	data: unknown;
	headers: Record<string, string | string[] | undefined>;
}

export type BdpRequest = (path: string, qs: IDataObject) => Promise<BdpPage>;

function getApiBaseUrl(environment: unknown): string {
	if (environment === 'uat') {
		return 'https://ecostruxure-building-platform-api-uat.se.app';
	}
	if (environment === 'production') {
		return 'https://ecostruxure-building-platform-api.se.app';
	}
	throw new Error('Choose UAT or Production in the BDP API credential.');
}

function errorStatus(error: unknown): number | undefined {
	if (typeof error !== 'object' || error === null) return undefined;
	const record = error as Record<string, unknown>;
	const response = record.response as Record<string, unknown> | undefined;
	const status = response?.statusCode ?? response?.status ?? record.statusCode ?? record.httpCode;
	const parsed = Number(status);
	return Number.isInteger(parsed) ? parsed : undefined;
}

function errorHeaders(error: unknown): Record<string, string | string[] | undefined> {
	if (typeof error !== 'object' || error === null) return {};
	const response = (error as Record<string, unknown>).response as
		| Record<string, unknown>
		| undefined;
	return (response?.headers ?? {}) as Record<string, string | string[] | undefined>;
}

function headerValue(
	headers: Record<string, string | string[] | undefined>,
	name: string,
): string | undefined {
	const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
	const value = key ? headers[key] : undefined;
	return Array.isArray(value) ? value[0] : value;
}

function retryAfterMs(headers: Record<string, string | string[] | undefined>): number | undefined {
	const value = headerValue(headers, 'retry-after');
	if (!value) return undefined;

	const seconds = Number(value);
	const parsedDate = Number.isFinite(seconds) ? undefined : Date.parse(value);
	if (Number.isFinite(seconds) && seconds < 0) return undefined;
	if (parsedDate !== undefined && !Number.isFinite(parsedDate)) return undefined;
	const delay = Number.isFinite(seconds)
		? seconds * 1000
		: Math.max(0, parsedDate! - Date.now());
	if (delay > MAX_RETRY_AFTER_MS) {
		return undefined;
	}
	return delay;
}

function isTransientNetworkError(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) return false;
	const code = (error as Record<string, unknown>).code;
	return ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED'].includes(String(code));
}

function safeFailureMessage(status?: number): string {
	if (status === 401) return 'BDP authentication failed. Check the tenant, client credentials, and scope.';
	if (status === 403) return 'BDP denied access. Check that the application can access the requested data.';
	if (status === 429) return 'BDP rate limit was reached; the bounded retry attempts were exhausted.';
	if (status !== undefined) return `BDP request failed with HTTP ${status}.`;
	return 'BDP request failed. Check network connectivity and the BDP credential.';
}

function isTransientStatus(status?: number): boolean {
	return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export async function requestBdp(
	this: BdpContext,
	path: string,
	qs: IDataObject = {},
): Promise<BdpPage> {
	if (!path.startsWith('/api/') || path.startsWith('//')) {
		throw new NodeOperationError(this.getNode(), 'Only documented BDP API operations are available.');
	}

	const credentials = await this.getCredentials('bdpOAuth2Api');
	const options: IHttpRequestOptions = {
		method: 'GET',
		url: `${getApiBaseUrl(credentials.environment)}${path}`,
		qs,
		headers: {
			'X-Api-Version': '3.0',
			Accept: 'application/json',
		},
		json: true,
		returnFullResponse: true,
	};

	for (let attempt = 0; ; attempt++) {
		try {
			const response = await this.helpers.httpRequestWithAuthentication.call(
				this,
				'bdpOAuth2Api',
				options,
			);
			return {
				data: response.body,
				headers: response.headers ?? {},
			};
		} catch (error) {
			const status = errorStatus(error);
			const headers = errorHeaders(error);
			const retryDelay = retryAfterMs(headers);
			const retryable =
				isTransientStatus(status) || (status === undefined && isTransientNetworkError(error));

			if (!retryable || attempt >= MAX_RETRIES) {
				throw new NodeOperationError(this.getNode(), safeFailureMessage(status));
			}
			if (headerValue(headers, 'retry-after') && retryDelay === undefined) {
				throw new NodeOperationError(this.getNode(), safeFailureMessage(status));
			}

			const backoff = Math.min(250 * 2 ** attempt, 2000);
			await sleep(retryDelay ?? backoff);
		}
	}
}

function totalFromHeaders(headers: BdpPage['headers']): number | undefined {
	for (const name of ['x-total-count', 'x-total-records', 'x-pagination-total-count']) {
		const value = headerValue(headers, name);
		if (value && /^\d+$/.test(value)) return Number(value);
	}
	const contentRange = headerValue(headers, 'content-range');
	const match = contentRange?.match(/\/(\d+)$/);
	return match ? Number(match[1]) : undefined;
}

function hasNextPage(headers: BdpPage['headers']): boolean {
	const link = headerValue(headers, 'link');
	return Boolean(link && /rel\s*=\s*"?next"?/i.test(link));
}

function nextLink(headers: BdpPage['headers']): string | undefined {
	const link = headerValue(headers, 'link');
	return link?.match(/<([^>]+)>\s*;\s*rel\s*=\s*"?next"?/i)?.[1];
}

function nextSkipFromHeaders(headers: BdpPage['headers']): number | undefined {
	for (const name of ['x-next-skip', 'x-pagination-next-skip']) {
		const value = headerValue(headers, name);
		if (value && /^\d+$/.test(value)) return Number(value);
	}
	return undefined;
}

export async function fetchAllPages(
	request: BdpRequest,
	path: string,
	filters: IDataObject,
	options: { returnAll: boolean; limit: number; pageSize?: number },
): Promise<IDataObject[]> {
	const pageSize = Math.min(PAGE_SIZE, Math.max(1, options.pageSize ?? PAGE_SIZE));
	const records: IDataObject[] = [];
	const seenPageSignatures = new Set<string>();
	const seenNextLinks = new Set<string>();
	let skip = 0;

	while (options.returnAll || records.length < options.limit) {
		const take = options.returnAll
			? pageSize
			: Math.min(pageSize, options.limit - records.length);
		const page = await request(path, { ...filters, take, skip });
		if (!Array.isArray(page.data)) {
			throw new Error('BDP returned an invalid list response; no results were returned.');
		}
		if (page.data.length > take) {
			throw new Error('BDP returned more records than requested; pagination stopped safely.');
		}
		const pageSignature = JSON.stringify(page.data);
		if (pageSignature && seenPageSignatures.has(pageSignature)) {
			throw new Error('BDP repeated a page without advancing; refusing to return incomplete results.');
		}
		if (pageSignature) seenPageSignatures.add(pageSignature);

		const total = totalFromHeaders(page.headers);
		const next = hasNextPage(page.headers);
		const link = nextLink(page.headers);
		if (link && seenNextLinks.has(link)) {
			throw new Error('BDP repeated a continuation link; refusing to return incomplete results.');
		}
		if (link) seenNextLinks.add(link);
		if (page.data.length === 0) {
			if (next || (total !== undefined && skip < total)) {
				throw new Error('BDP pagination did not advance; refusing to return incomplete results.');
			}
			break;
		}

		const remaining = options.returnAll ? page.data.length : options.limit - records.length;
		records.push(...(page.data.slice(0, remaining) as IDataObject[]));
		const nextSkip = skip + page.data.length;
		const headerNextSkip = nextSkipFromHeaders(page.headers);
		if (nextSkip <= skip || (headerNextSkip !== undefined && headerNextSkip !== nextSkip)) {
			throw new Error('BDP pagination did not advance; refusing to return incomplete results.');
		}
		if (!options.returnAll && records.length >= options.limit) break;
		if (total !== undefined) {
			if (nextSkip >= total) break;
			skip = nextSkip;
			continue;
		}
		if (next || page.data.length === take) {
			skip = nextSkip;
			continue;
		}
		break;
	}

	return records;
}

export function getBdpRequest(
	context: BdpContext,
): BdpRequest {
	return (path, qs) => requestBdp.call(context, path, qs);
}
