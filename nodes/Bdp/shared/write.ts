// Pure helpers for write requests: JSON Patch building, input validation and
// response normalization. Nothing here touches credentials or the network, so
// every check runs before any request is made.

export type JsonPatchOperation = { op: 'replace'; path: string; value: unknown };

/** Validates a patch value and returns the (possibly normalized) value to send. Throws on invalid input. */
export type PatchValidator = (value: unknown) => unknown;

export const patchValue = {
	finiteNumber(label: string): PatchValidator {
		return (value) => {
			if (typeof value !== 'number' || !Number.isFinite(value)) {
				throw new Error(`${label} must be a finite number.`);
			}
			return value;
		};
	},
	integer(label: string): PatchValidator {
		return (value) => {
			if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
				throw new Error(`${label} must be a whole number.`);
			}
			return value;
		};
	},
	nonEmptyString(label: string): PatchValidator {
		return (value) => {
			if (typeof value !== 'string' || !value.trim()) {
				throw new Error(`${label} must be a non-empty text value.`);
			}
			return value;
		};
	},
	stringArray(label: string): PatchValidator {
		return (value) => {
			if (
				!Array.isArray(value) ||
				value.some((entry) => typeof entry !== 'string' || !entry.trim())
			) {
				throw new Error(`${label} must be a list of non-empty text values.`);
			}
			return value;
		};
	},
	plainObject(label: string): PatchValidator {
		return (value) => {
			if (typeof value !== 'object' || value === null || Array.isArray(value)) {
				throw new Error(`${label} must be a JSON object.`);
			}
			return value;
		};
	},
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUuid(value: unknown, label: string): string {
	if (typeof value !== 'string' || !UUID.test(value.trim())) {
		throw new Error(`${label} must be a valid UUID.`);
	}
	return value.trim();
}

/**
 * Builds a JSON Patch document made only of `replace` operations.
 * `allowed` maps each permitted path to the validator for its value; any other
 * path, a repeated path, a missing value or an empty change list is rejected.
 */
export function buildReplacePatch(
	changes: Array<{ op?: string; path: string; value: unknown }>,
	allowed: Record<string, PatchValidator>,
): JsonPatchOperation[] {
	if (changes.length === 0) {
		throw new Error('Nothing to update: choose at least one field to change.');
	}
	const seen = new Set<string>();
	return changes.map(({ op = 'replace', path, value }) => {
		if (op !== 'replace') throw new Error('Only the JSON Patch "replace" operation is supported.');
		if (!Object.prototype.hasOwnProperty.call(allowed, path)) {
			throw new Error(`Patching "${path}" is not supported for this operation.`);
		}
		if (seen.has(path)) throw new Error(`"${path}" can only be replaced once per update.`);
		seen.add(path);
		if (value === undefined) throw new Error(`A value is required for "${path}".`);
		return { op: 'replace', path, value: allowed[path](value) };
	});
}

export type WriteItemStatus = {
	id?: string;
	path?: string;
	statusCode?: number;
	ok: boolean;
	errorCode?: string;
	error?: string;
	value?: unknown;
	timeStamp?: string;
};

export type WriteResult =
	| { outcome: 'noContent'; statusCode: number }
	| { outcome: 'success'; statusCode: number; data: unknown }
	| {
			outcome: 'partial';
			statusCode: 206;
			data: unknown;
			items: WriteItemStatus[];
			itemErrors: WriteItemStatus[];
	  };

function text(value: unknown, max = 500): string | undefined {
	if (typeof value !== 'string' || !value) return undefined;
	return value.length > max ? `${value.slice(0, max)}...` : value;
}

/**
 * Normalizes the per-item entries of a 206 Partial Content body (BDP "Ok206").
 * Deliberate decision: the service's own per-item error text (metadata.ErrorText) is passed
 * through as BDP sent it (only capped at 500 characters), so n8n users get the same diagnostics
 * as API users. Unlike HTTP failure messages, it is not status-derived and is not filtered.
 */
export function normalizePartialItems(data: unknown): WriteItemStatus[] {
	if (!Array.isArray(data)) return [];
	return data.map((entry): WriteItemStatus => {
		const record = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<
			string,
			unknown
		>;
		const identity = (typeof record.identity === 'object' && record.identity !== null
			? record.identity
			: {}) as Record<string, unknown>;
		const metadata = (typeof record.metadata === 'object' && record.metadata !== null
			? record.metadata
			: {}) as Record<string, unknown>;
		const statusCode = typeof record.statusCode === 'number' ? record.statusCode : undefined;
		const errorCode = text(metadata.ErrorCode, 100);
		const errorText = text(metadata.ErrorText);
		const failedStatus = statusCode !== undefined && (statusCode < 200 || statusCode > 299);
		const ok = !failedStatus && !errorCode && !errorText;
		const id = text(identity.id, 200);
		const path = text(identity.path, 500);
		const timeStamp = text(record.timeStamp, 100);
		return {
			...(id ? { id } : {}),
			...(path ? { path } : {}),
			...(statusCode !== undefined ? { statusCode } : {}),
			ok,
			...(!ok
				? {
						...(errorCode ? { errorCode } : {}),
						error: errorText ?? text(metadata.ResponseCode, 100) ?? 'The item was rejected by BDP.',
					}
				: {}),
			...(record.value !== undefined ? { value: record.value } : {}),
			...(timeStamp ? { timeStamp } : {}),
		};
	});
}

function isEmptyBody(body: unknown): boolean {
	return body === undefined || body === null || body === '';
}

/** Distinguishes 204/empty, 200 with a body, and 206 with per-item errors. */
export function normalizeWriteResponse(statusCode: number | undefined, body: unknown): WriteResult {
	const status = statusCode ?? (isEmptyBody(body) ? 204 : 200);
	if (status === 206) {
		const items = normalizePartialItems(body);
		return {
			outcome: 'partial',
			statusCode: 206,
			data: body,
			items,
			itemErrors: items.filter((item) => !item.ok),
		};
	}
	if (status === 204 || isEmptyBody(body)) return { outcome: 'noContent', statusCode: status };
	return { outcome: 'success', statusCode: status, data: body };
}

/** What a write failure may say: status-derived text only, never credentials or request bodies. */
export function safeWriteFailureMessage(status?: number): string {
	switch (status) {
		case 400:
			return 'BDP rejected the write (HTTP 400). Check the IDs, value types, and that the target accepts writes. The request body is not shown.';
		case 401:
			return 'BDP authentication failed. Check the tenant, client credentials, and scope.';
		case 403:
			return 'BDP denied the write (HTTP 403). Check that the application is allowed to write to this target.';
		case 404:
			return 'BDP could not find the target (HTTP 404). Check the ID or path.';
		case 413:
			return 'BDP rejected the write as too large (HTTP 413). Send fewer items per request.';
		case 415:
			return 'BDP did not accept the content type of the write (HTTP 415).';
		case 424:
			return 'BDP could not complete the write because a dependency failed (HTTP 424). Check the referenced device or IDs.';
		case 429:
			return 'BDP rate limit was reached (HTTP 429). The write was not retried automatically; wait and retry deliberately.';
		case 504:
			return 'BDP timed out (HTTP 504). The write was not retried automatically and its outcome is unknown; check the target before repeating it.';
		default:
			return status !== undefined
				? `BDP write failed with HTTP ${status}. The write was not retried automatically and its outcome may be unknown.`
				: 'BDP write failed before a response was received. The write was not retried automatically and its outcome may be unknown.';
	}
}
