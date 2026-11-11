const assert = require('node:assert/strict');
const test = require('node:test');
const {
	prepareGraphqlRequest,
	parseGraphqlResponse,
} = require('../dist/nodes/Bdp/shared/graphql.js');
const { requestBdpGraphql } = require('../dist/nodes/Bdp/shared/transport.js');
const { Bdp } = require('../dist/nodes/Bdp/Bdp.node.js');
const { Workflow } = require('n8n-workflow');

const query = `
# mutation and subscription here are not operations
query First($take: Int!, $skip: Int!, $include: Boolean = true) {
  alias: buildings(take: $take, skip: $skip, where: {name: {eq: "mutation"}}) {
    ...Identity
    ... on Building { name @include(if: $include) }
  }
}
query Second($take: Int!, $skip: Int!) {
  buildings(take: $take, skip: $skip) { ...Identity }
}
fragment Identity on Building { id }
`;

function contextFor(
	handler,
	{ environment = 'uat', parameters = [{}], continueOnFail = false } = {},
) {
	const calls = [];
	let credentialsRead = 0;
	const context = {
		getNode: () => ({ name: 'BDP', type: 'n8n-nodes-bdp.bdp' }),
		getCredentials: async () => {
			credentialsRead++;
			return {
				environment,
				clientSecret: 'synthetic-secret',
				oauthTokenData: { access_token: 'synthetic-token' },
			};
		},
		getInputData: () => parameters.map(() => ({ json: {} })),
		getNodeParameter: (name, index, fallback) =>
			Object.hasOwn(parameters[index], name) ? parameters[index][name] : fallback,
		continueOnFail: () => continueOnFail,
		helpers: {
			httpRequestWithAuthentication: async function (credential, options) {
				assert.equal(this, context);
				assert.equal(credential, 'bdpOAuth2Api');
				calls.push(options);
				return handler(options, calls.length);
			},
		},
	};
	return { context, calls, credentialsRead: () => credentialsRead };
}

for (const document of ['{ buildings { id } }', 'query Named { buildings { id } }']) {
	test(`accepts a single anonymous or named query: ${document}`, () => {
		assert.deepEqual(prepareGraphqlRequest(document, '{}'), { query: document, variables: {} });
	});
}

test('preserves original document, fragments, directives, aliases and JSON variable types', () => {
	const variables = { take: 2, skip: 0, include: false, nested: { list: [1, true, null, 'text'] } };
	assert.deepEqual(prepareGraphqlRequest(query, JSON.stringify(variables), 'First'), {
		query,
		variables,
		operationName: 'First',
	});
	assert.deepEqual(prepareGraphqlRequest(query, variables, 'Second').variables, variables);
	assert.equal(
		prepareGraphqlRequest(
			'{ buildings(where: {name: {eq: """subscription mutation"""}}) { id } }',
			{},
		).operationName,
		undefined,
	);
});

const invalidDocuments = [
	['', /non-empty/],
	['# comment only', /syntax/],
	['{ buildings(', /syntax/],
	['fragment Identity on Building { id }', /contain a query/],
	['type Building { id: ID! }', /executable/],
	['schema { query: Query }', /executable/],
	['mutation { updatePoint { id } }', /read-only/],
	['subscription { points { id } }', /read-only/],
	['query Good { buildings { id } } mutation Bad { updatePoint { id } }', /read-only/, 'Good'],
	['query Good { buildings { id } } subscription Bad { points { id } }', /read-only/, 'Good'],
	[query, /Operation Name is required/],
	[query, /exactly one/, 'Missing'],
	['query Same { buildings { id } } query Same { points { id } }', /Duplicate/, 'Same'],
	['{ buildings { id } } query Named { points { id } }', /anonymous/, 'Named'],
	['{ buildings { id } }', /exactly one/, 'Named'],
	['query Named { buildings { id } }', /exactly one/, 'Other'],
	[null, /non-empty/],
];
for (const [document, message, operationName] of invalidDocuments) {
	test(`rejects invalid document/selection locally: ${String(document).slice(0, 60)} (${operationName ?? ''})`, async () => {
		const fixture = contextFor(() => {
			throw new Error('must not dispatch');
		});
		await assert.rejects(
			requestBdpGraphql.call(fixture.context, document, {}, operationName),
			message,
		);
		assert.equal(fixture.calls.length, 0);
		assert.equal(fixture.credentialsRead(), 0);
	});
}

for (const variables of [
	'{',
	'[]',
	'null',
	'true',
	'12',
	'"text"',
	[],
	null,
	2,
	false,
	{ missing: undefined },
	{ bad: Infinity },
	{ date: new Date() },
]) {
	test(`rejects non-object or non-JSON variables: ${String(variables)}`, async () => {
		const { context, calls } = contextFor(() => {});
		await assert.rejects(
			requestBdpGraphql.call(context, '{ buildings { id } }', variables),
			/Variables/,
		);
		assert.equal(calls.length, 0);
	});
}

test('rejects cyclic variables and non-string operation selection', () => {
	const cyclic = {};
	cyclic.self = cyclic;
	assert.throws(() => prepareGraphqlRequest('{ buildings { id } }', cyclic), /Variables/);
	assert.throws(() => prepareGraphqlRequest(query, {}, 2), /must be a string/);
});

test('syntax errors retain locations without echoing query text', () => {
	assert.throws(
		() => prepareGraphqlRequest('query { field(arg: "private-value" ???) }', {}),
		(error) => {
			assert.match(error.message, /line 1, column/);
			assert.doesNotMatch(error.message, /private-value|\?\?\?/);
			return true;
		},
	);
});

for (const environment of ['uat', 'production']) {
	test(`maps authenticated JSON POST to ${environment}, without REST headers or query rewriting`, async () => {
		const envelope = {
			data: { alias: [{ id: 'synthetic', n: 1, flag: false, value: null, nested: [] }] },
			extensions: { cost: 3 },
			errors: [],
		};
		const { context, calls } = contextFor(() => ({ body: envelope, headers: {} }), { environment });
		assert.deepEqual(
			await requestBdpGraphql.call(context, query, { take: 2, skip: 0 }, 'Second'),
			envelope,
		);
		assert.equal(calls.length, 1);
		assert.equal(
			calls[0].url,
			`https://ecostruxure-building-platform-api${environment === 'uat' ? '-uat' : ''}.se.app/graphql`,
		);
		assert.equal(calls[0].method, 'POST');
		assert.deepEqual(calls[0].headers, {
			Accept: 'application/json',
			'Content-Type': 'application/json',
		});
		assert.deepEqual(calls[0].body, {
			query,
			variables: { take: 2, skip: 0 },
			operationName: 'Second',
		});
		assert.equal(calls[0].json, true);
		assert.equal(calls[0].skipSslCertificateValidation, undefined);
		assert.equal(calls[0].qs, undefined);
	});
}

test('rejects an unknown credential environment before dispatch', async () => {
	const { context, calls } = contextFor(() => {}, { environment: 'custom' });
	await assert.rejects(
		requestBdpGraphql.call(context, '{ buildings { id } }', {}),
		/Choose UAT or Production/,
	);
	assert.equal(calls.length, 0);
});

test('preserves empty collections and nullable root fields inside one envelope', () => {
	const envelope = { data: { buildings: [], selected: null }, extensions: {} };
	assert.equal(parseGraphqlResponse(envelope), envelope);
});

for (const body of [
	null,
	[],
	[{ data: {} }],
	'not JSON',
	{},
	{ data: null },
	{ data: [] },
	{ data: 'text' },
	{ data: {}, errors: {} },
	{ data: {}, extensions: null },
	{ data: {}, hasNext: true },
	{ incremental: [] },
	{ data: { value: undefined } },
]) {
	test(`rejects malformed or unsupported response: ${JSON.stringify(body)}`, () => {
		assert.throws(() => parseGraphqlResponse(body), /invalid GraphQL/);
	});
}

test('fails on partial data and retains selected error diagnostics, never extra payloads', async () => {
	const { context, calls } = contextFor(() => ({
		body: {
			data: { buildings: [{ id: 'must-not-emit' }] },
			errors: [
				{
					message: 'Denied synthetic-secret synthetic-token',
					locations: [{ line: 2, column: 3 }],
					path: ['buildings', 0],
					extensions: { code: 'FORBIDDEN', private: 'do-not-dump' },
				},
			],
		},
	}));
	await assert.rejects(requestBdpGraphql.call(context, '{ buildings { id } }', {}), (error) => {
		assert.match(error.message, /Denied/);
		assert.match(error.message, /FORBIDDEN/);
		assert.match(error.message, /locations.*line.*2.*column.*3/);
		assert.match(error.message, /path.*buildings.*0/);
		assert.doesNotMatch(
			error.message,
			/must-not-emit|do-not-dump|synthetic-secret|synthetic-token/,
		);
		return true;
	});
	assert.equal(calls.length, 1);
});

test('error-only envelopes fail, and malformed error entries never become success', () => {
	assert.throws(
		() =>
			parseGraphqlResponse({
				errors: [{ message: 'Unknown field', extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } }],
			}),
		/Unknown field/,
	);
	for (const error of [null, {}, { message: 1 }, { message: '' }]) {
		assert.throws(
			() => parseGraphqlResponse({ data: {}, errors: [error] }),
			/malformed GraphQL error/,
		);
	}
});

test('rejects streaming content types and never retries permanent GraphQL errors on HTTP failures', async () => {
	const stream = contextFor(() => ({
		body: { data: {} },
		headers: { 'Content-Type': 'multipart/mixed; boundary=test' },
	}));
	await assert.rejects(
		requestBdpGraphql.call(stream.context, '{ field }', {}),
		/unsupported GraphQL content type/,
	);
	for (const status of [400, 500]) {
		const fixture = contextFor(() => {
			const error = httpFailure(status);
			error.response.data = {
				errors: [{ message: 'Unknown field', extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } }],
			};
			throw error;
		});
		await assert.rejects(requestBdpGraphql.call(fixture.context, '{ field }', {}), /Unknown field/);
		assert.equal(fixture.calls.length, 1);
	}
});

function httpFailure(statusCode, headers = {}) {
	const error = new Error('private upstream body');
	error.response = { statusCode, headers };
	return error;
}

for (const status of [400, 401, 403, 404, 422]) {
	test(`does not retry or leak permanent HTTP ${status} errors`, async () => {
		const { context, calls } = contextFor(() => {
			throw httpFailure(status);
		});
		await assert.rejects(requestBdpGraphql.call(context, '{ buildings { id } }', {}), (error) => {
			assert.doesNotMatch(error.message, /private upstream/);
			return true;
		});
		assert.equal(calls.length, 1);
	});
}

for (const status of [429, 500, 502, 503, 504]) {
	test(`reuses bounded transient retry for HTTP ${status} with identical payloads`, async () => {
		const { context, calls } = contextFor((_options, count) => {
			if (count < 4) throw httpFailure(status, { 'Retry-After': '0' });
			return { body: { data: {} } };
		});
		await requestBdpGraphql.call(context, query, {}, 'First');
		assert.equal(calls.length, 4);
		for (const call of calls) assert.deepEqual(call, calls[0]);
	});
}

test('exhausts retries and rejects unusable Retry-After rather than retrying indefinitely', async () => {
	for (const [retryAfter, expectedCount] of [
		['0', 4],
		['120', 1],
		['invalid', 1],
		['-1', 1],
	]) {
		const { context, calls } = contextFor(() => {
			throw httpFailure(429, { 'retry-after': retryAfter });
		});
		await assert.rejects(requestBdpGraphql.call(context, '{ buildings { id } }', {}), /rate limit/);
		assert.equal(calls.length, expectedCount);
	}
});

test('retries eligible network failures, but not invalid JSON parsing', async () => {
	const { context, calls } = contextFor((_options, count) => {
		if (count === 1) throw Object.assign(new Error('reset'), { code: 'ECONNRESET' });
		return { body: { data: {} } };
	});
	await requestBdpGraphql.call(context, '{ buildings { id } }', {});
	assert.equal(calls.length, 2);
	const invalid = contextFor(() => {
		throw new SyntaxError('private invalid JSON');
	});
	await assert.rejects(
		requestBdpGraphql.call(invalid.context, '{ buildings { id } }', {}),
		/invalid JSON GraphQL response/,
	);
	assert.equal(invalid.calls.length, 1);
});

test('node exposes GraphQL fields without changing REST defaults or exposing automatic pagination', () => {
	const properties = new Bdp().description.properties;
	const operation = properties.find(
		(p) => p.name === 'operation' && p.displayOptions?.show.resource.includes('graphql'),
	);
	assert.equal(operation.default, 'executeQuery');
	assert.equal(properties.find((p) => p.name === 'resource').default, 'building');
	assert.equal(properties.find((p) => p.name === 'query').required, true);
	assert.ok(properties.find((p) => p.name === 'query').typeOptions.rows > 1);
	assert.equal(properties.find((p) => p.name === 'variables').default, '{}');
	assert.equal(properties.find((p) => p.name === 'operationName').default, '');
	assert.ok(
		properties
			.filter((p) => ['limit', 'returnAll', 'buildingLimit', 'returnAllBuildings'].includes(p.name))
			.every((p) => !p.displayOptions.show.resource.includes('graphql')),
	);
});

test('node resolves every GraphQL input separately and emits exactly one paired envelope per input', async () => {
	const parameters = [
		{
			resource: 'graphql',
			operation: 'executeQuery',
			query,
			variables: '{"take":2,"skip":0}',
			operationName: 'First',
		},
		{
			resource: 'graphql',
			operation: 'executeQuery',
			query,
			variables: { take: 2, skip: 2 },
			operationName: 'Second',
		},
	];
	const envelopes = [
		{ data: { buildings: [] } },
		{ data: { buildings: [{ id: 'synthetic' }] }, extensions: { n: 2 } },
	];
	const { context, calls } = contextFor((_options, count) => ({ body: envelopes[count - 1] }), {
		parameters,
	});
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(
		output,
		envelopes.map((json, item) => ({ json, pairedItem: { item } })),
	);
	assert.deepEqual(
		calls.map((call) => call.body.operationName),
		['First', 'Second'],
	);
	assert.deepEqual(
		calls.map((call) => call.body.variables),
		[
			{ take: 2, skip: 0 },
			{ take: 2, skip: 2 },
		],
	);
});

test('real n8n expressions resolve document, variables and operation name against each input item', async () => {
	const node = {
		name: 'BDP',
		type: 'n8n-nodes-bdp.bdp',
		typeVersion: 1,
		position: [0, 0],
		parameters: {
			resource: 'graphql',
			operation: 'executeQuery',
			query: '={{ $json.document }}',
			variables: '={{ { take: $json.take, skip: $json.skip, flag: $json.flag } }}',
			operationName: '={{ $json.selected }}',
		},
	};
	const workflow = new Workflow({
		nodes: [node],
		connections: {},
		active: false,
		nodeTypes: { getByNameAndVersion: () => new Bdp() },
	});
	const items = [
		{ json: { document: query, take: 2, skip: 0, flag: true, selected: 'First' } },
		{ json: { document: query, take: 2, skip: 2, flag: false, selected: 'Second' } },
	];
	const fixture = contextFor(() => ({ body: { data: {} } }));
	fixture.context.getInputData = () => items;
	fixture.context.getNodeParameter = (name, index, fallback) =>
		workflow.expression.getParameterValue(
			node.parameters[name] ?? fallback,
			null,
			0,
			index,
			node.name,
			items,
			'internal',
			{},
		);
	await new Bdp().execute.call(fixture.context);
	assert.deepEqual(
		fixture.calls.map(({ body }) => body),
		[
			{ query, variables: { take: 2, skip: 0, flag: true }, operationName: 'First' },
			{ query, variables: { take: 2, skip: 2, flag: false }, operationName: 'Second' },
		],
	);
});

test('continue-on-error returns a linked failure, not partial data, and continues subsequent items', async () => {
	const parameters = [
		{ resource: 'graphql', operation: 'executeQuery', query: 'mutation { write }' },
		{ resource: 'graphql', operation: 'executeQuery', query: '{ buildings { id } }' },
		{ resource: 'graphql', operation: 'executeQuery', query: '{ buildings { id } }' },
	];
	const { context, calls } = contextFor(
		(_options, count) => ({
			body:
				count === 1
					? { data: { buildings: [] }, errors: [{ message: 'Forbidden' }] }
					: { data: { buildings: [] } },
		}),
		{ parameters, continueOnFail: true },
	);
	const [output] = await new Bdp().execute.call(context);
	assert.equal(output.length, 3);
	assert.deepEqual(
		output.map((item) => item.pairedItem.item),
		[0, 1, 2],
	);
	assert.match(output[0].json.error, /read-only/);
	assert.match(output[1].json.error, /Forbidden/);
	assert.equal(output[1].json.data, undefined);
	assert.deepEqual(output[2].json, { data: { buildings: [] } });
	assert.equal(calls.length, 2);
});

test('node fails normally on GraphQL errors', async () => {
	const { context, calls } = contextFor(
		() => ({ body: { data: {}, errors: [{ message: 'Unknown field' }] } }),
		{
			parameters: [{ resource: 'graphql', operation: 'executeQuery', query: '{ unknown }' }],
		},
	);
	await assert.rejects(new Bdp().execute.call(context), /Unknown field/);
	assert.equal(calls.length, 1);
});
