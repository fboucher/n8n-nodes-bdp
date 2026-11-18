// The explicit allowlist of operations that may send POST, PATCH, PUT or DELETE.
// Anything not listed here cannot issue a write: requestBdpWrite refuses it, and
// tests/write-allowlist.test.cjs fails if an unlisted operation sends one.
//
// To add a write operation, append an entry here (see docs/development.md).

export type WriteMethod = 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface WriteOperationSpec {
	resource: string;
	operation: string;
	method: WriteMethod;
	/** Matches the request path exactly (no query string). */
	path: RegExp;
	/**
	 * True only when repeating the request is harmless (idempotent PATCH replace).
	 * Automatic retry additionally requires the call itself to opt in.
	 */
	idempotent: boolean;
}

const ID = '[^/?#]+';

export const WRITE_ALLOWLIST: readonly WriteOperationSpec[] = [
	// Measurement Point -> Update (single point, then one device group in a batch)
	{
		resource: 'measurementValue',
		operation: 'update',
		method: 'PATCH',
		path: new RegExp(`^/api/MeasurementValues/${ID}$`),
		idempotent: true,
	},
	{
		resource: 'measurementValue',
		operation: 'update',
		method: 'PATCH',
		path: new RegExp(`^/api/DeviceGroups/${ID}/MeasurementValues$`),
		idempotent: true,
	},
];

export function findWriteOperation(
	allowlist: readonly WriteOperationSpec[],
	request: { resource: string; operation: string; method: string; path: string },
): WriteOperationSpec | undefined {
	return allowlist.find(
		(spec) =>
			spec.resource === request.resource &&
			spec.operation === request.operation &&
			spec.method === request.method &&
			spec.path.test(request.path),
	);
}
