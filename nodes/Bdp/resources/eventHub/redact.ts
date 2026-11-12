import type { IDataObject } from 'n8n-workflow';

export const REDACTED = '[REDACTED]';

// Event hub records can describe a connection to an external messaging service.
// Any field that looks like a credential is replaced so workflows do not leak it
// into execution data, logs or downstream nodes. The match is on the field name
// at any depth; non-secret fields keep their native types.
const SECRET_KEY =
	/connection[-_ ]?string|secret|password|passwd|passphrase|token|credential|bearer|signature|^sas|[-_ ]sas$|^key$|(access|primary|secondary|shared|api|private|signing|account|auth)[-_ ]?key/i;

function redactValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(redactValue);
	if (typeof value === 'object' && value !== null) {
		return Object.fromEntries(
			Object.entries(value).map(([key, inner]) => [
				key,
				SECRET_KEY.test(key) && inner !== null && inner !== undefined
					? REDACTED
					: redactValue(inner),
			]),
		);
	}
	return value;
}

export function redactEventHub(record: IDataObject): IDataObject {
	return redactValue(record) as IDataObject;
}
