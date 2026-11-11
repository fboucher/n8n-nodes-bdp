import { GraphQLError, Kind, OperationTypeNode, parse } from 'graphql';
import type { IDataObject } from 'n8n-workflow';

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJson(value: unknown, ancestors = new Set<object>()): boolean {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
	if (typeof value === 'number') return Number.isFinite(value);
	if (typeof value !== 'object' || ancestors.has(value)) return false;
	if (
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) !== Object.prototype &&
		Object.getPrototypeOf(value) !== null
	)
		return false;
	ancestors.add(value);
	const valid = Object.values(value).every((entry) => isJson(entry, ancestors));
	ancestors.delete(value);
	return valid;
}

export function prepareGraphqlRequest(
	query: unknown,
	variables: unknown,
	operationName: unknown = '',
): IDataObject {
	if (typeof query !== 'string' || !query.trim()) {
		throw new Error('Query must be a non-empty GraphQL document.');
	}
	if (typeof operationName !== 'string') {
		throw new Error('Operation Name must be a string.');
	}
	const selectedName = operationName.trim();
	let document;
	try {
		document = parse(query);
	} catch (error) {
		if (!(error instanceof GraphQLError)) throw error;
		const location = error.locations?.[0];
		// Parser messages can quote source text, including expression-derived secrets.
		throw new Error(
			`Invalid GraphQL syntax${location ? ` at line ${location.line}, column ${location.column}` : ''}.`,
		);
	}

	const names = new Set<string>();
	let operationCount = 0;
	let anonymous = false;
	for (const definition of document.definitions) {
		if (definition.kind === Kind.FRAGMENT_DEFINITION) continue;
		if (definition.kind !== Kind.OPERATION_DEFINITION) {
			throw new Error('Only executable query and fragment definitions are supported.');
		}
		if (definition.operation !== OperationTypeNode.QUERY) {
			throw new Error(
				'Only read-only queries are allowed; mutations and subscriptions are rejected throughout the document.',
			);
		}
		operationCount++;
		const name = definition.name?.value;
		if (name) {
			if (names.has(name)) throw new Error('Duplicate query operation names are not allowed.');
			names.add(name);
		} else {
			anonymous = true;
		}
	}
	if (operationCount === 0) throw new Error('The document must contain a query operation.');
	if (operationCount > 1 && anonymous) {
		throw new Error('An anonymous query cannot appear alongside another operation.');
	}
	if (operationCount > 1 && !selectedName) {
		throw new Error('Operation Name is required for a document containing multiple queries.');
	}
	if (selectedName && !names.has(selectedName)) {
		throw new Error('Operation Name must identify exactly one named query in the document.');
	}

	let parsedVariables: unknown = variables;
	if (typeof variables === 'string') {
		try {
			parsedVariables = JSON.parse(variables);
		} catch {
			throw new Error('Variables must be valid JSON resolving to an object.');
		}
	}
	if (!isObject(parsedVariables) || !isJson(parsedVariables)) {
		throw new Error('Variables must resolve to a JSON object, not an array, scalar, or null.');
	}
	return {
		query,
		variables: parsedVariables as IDataObject,
		...(selectedName ? { operationName: selectedName } : {}),
	};
}

export function parseGraphqlResponse(body: unknown, secrets: string[] = []): IDataObject {
	if (
		!isObject(body) ||
		!isJson(body) ||
		Object.keys(body).some((key) => !['data', 'errors', 'extensions'].includes(key)) ||
		('extensions' in body && !isObject(body.extensions)) ||
		('errors' in body && !Array.isArray(body.errors))
	) {
		throw new Error(
			'BDP returned an invalid GraphQL envelope; JSON batch and streaming responses are not supported.',
		);
	}
	if (Array.isArray(body.errors) && body.errors.length > 0) {
		const details = body.errors
			.map((error: unknown) => {
				if (!isObject(error) || typeof error.message !== 'string' || !error.message.trim()) {
					throw new Error('BDP returned a malformed GraphQL error.');
				}
				const safe: Record<string, unknown> = { message: error.message };
				if (
					Array.isArray(error.locations) &&
					error.locations.every(
						(location: unknown) =>
							isObject(location) &&
							Number.isInteger(location.line) &&
							Number(location.line) > 0 &&
							Number.isInteger(location.column) &&
							Number(location.column) > 0,
					)
				) {
					safe.locations = error.locations.map((location: Record<string, unknown>) => ({
						line: location.line,
						column: location.column,
					}));
				}
				if (
					Array.isArray(error.path) &&
					error.path.every(
						(part: unknown) =>
							typeof part === 'string' || (Number.isInteger(part) && Number(part) >= 0),
					)
				) {
					safe.path = error.path;
				}
				if (
					isObject(error.extensions) &&
					(typeof error.extensions.code === 'string' || typeof error.extensions.code === 'number')
				) {
					safe.code = error.extensions.code;
				}
				return JSON.stringify(safe);
			})
			.join('; ');
		let message = `BDP GraphQL errors: ${details}`;
		for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) {
			message = message.split(secret).join('[REDACTED]');
		}
		throw new Error(message);
	}
	if (!isObject(body.data)) {
		throw new Error('BDP returned an invalid GraphQL success envelope; data must be an object.');
	}
	return body as IDataObject;
}

export function credentialSecrets(credentials: IDataObject): string[] {
	const secrets: string[] = [];
	function collect(value: unknown): void {
		if (typeof value === 'string' && value) secrets.push(value, JSON.stringify(value).slice(1, -1));
		else if (isObject(value)) Object.values(value).forEach(collect);
	}
	for (const key of ['clientSecret', 'clientId', 'tenantId', 'oauthTokenData']) {
		collect(credentials[key]);
	}
	return secrets;
}
