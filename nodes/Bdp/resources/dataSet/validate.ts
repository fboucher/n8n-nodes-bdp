import type { PatchValidator } from '../../shared/write';
import { patchValue, requireUuid } from '../../shared/write';
import { normalizeTimestamp } from '../../shared/time';

export const MEMBER_CATEGORIES = [
	'buildings',
	'floors',
	'spaces',
	'devices',
	'measurementValues',
] as const;

const CATEGORY_LABELS: Record<(typeof MEMBER_CATEGORIES)[number], string> = {
	buildings: 'Buildings',
	floors: 'Floors',
	spaces: 'Spaces',
	devices: 'Devices',
	measurementValues: 'Measurement Points',
};

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/**
 * Dataset members are always replaced as a whole. Missing categories become empty lists so
 * the request states exactly what the dataset will contain; unknown categories and
 * non-UUID IDs are rejected.
 */
export const validateMembers: PatchValidator = (value) => {
	let members = value;
	if (typeof members === 'string') {
		members = parseJson(members);
		if (members === undefined) throw new Error('Members must be valid JSON.');
	}
	if (typeof members !== 'object' || members === null || Array.isArray(members)) {
		throw new Error('Members must be a JSON object such as {"buildings": ["<uuid>"]}.');
	}
	const record = members as Record<string, unknown>;
	for (const key of Object.keys(record)) {
		if (!(MEMBER_CATEGORIES as readonly string[]).includes(key)) {
			throw new Error(
				`Members has an unsupported category "${key}". Use: ${MEMBER_CATEGORIES.join(', ')}.`,
			);
		}
	}
	const normalized: Record<string, string[]> = {};
	for (const category of MEMBER_CATEGORIES) {
		const entries = record[category] ?? [];
		if (!Array.isArray(entries)) {
			throw new Error(`Members: ${CATEGORY_LABELS[category]} must be a list of IDs.`);
		}
		normalized[category] = entries.map((entry, index) =>
			requireUuid(entry, `Members: ${CATEGORY_LABELS[category]} entry ${index + 1}`),
		);
	}
	return normalized;
};

export const validateName: PatchValidator = patchValue.nonEmptyString('Name');

export const validateExpiresOn: PatchValidator = (value) => {
	if (typeof value !== 'string') {
		throw new Error('Expires On must be an ISO 8601 timestamp with seconds and an explicit UTC offset or Z.');
	}
	return normalizeTimestamp(value, 'Expires On');
};

export const DATA_SET_PATCH_PATHS: Record<string, PatchValidator> = {
	'/name': validateName,
	'/expiresOn': validateExpiresOn,
	'/members': validateMembers,
};
