const assert = require('node:assert/strict');
const test = require('node:test');
const { Bdp } = require('../dist/nodes/Bdp/Bdp.node.js');
const { getEventHubs } = require('../dist/nodes/Bdp/resources/eventHub/listSearch.js');
const { REDACTED, redactEventHub } = require('../dist/nodes/Bdp/resources/eventHub/redact.js');
const { createContext, errorWithStatus, paths } = require('./helpers.cjs');

test('Event Hub List returns native records with filters across pages and per-item links', async () => {
	const eventHub = { id: 'eh-1', name: 'Ingest', type: 'Telemetry', metadata: null, active: true };
	const filters = { name: 'Ingest', orderBy: 'NameAscending' };
	const { context, calls } = createContext(
		[
			{ resource: 'eventHub', operation: 'getAll', returnAll: true, ...filters },
			{ resource: 'eventHub', operation: 'getAll', limit: 1 },
		],
		[
			{ body: [eventHub], headers: { 'x-total-count': '2' } },
			{ body: [{ id: 'eh-2' }], headers: { 'x-total-count': '2' } },
			{ body: [{ id: 'eh-3' }], headers: { 'x-total-count': '3' } },
		],
		[{ json: {} }, { json: {} }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output, [
		{ json: eventHub, pairedItem: { item: 0 } },
		{ json: { id: 'eh-2' }, pairedItem: { item: 0 } },
		{ json: { id: 'eh-3' }, pairedItem: { item: 1 } },
	]);
	assert.deepEqual(paths(calls), ['/api/EventHubs', '/api/EventHubs', '/api/EventHubs']);
	assert.deepEqual(calls.map(({ qs }) => qs), [
		{ ...filters, take: 5000, skip: 0 },
		{ ...filters, take: 5000, skip: 1 },
		{ take: 1, skip: 0 },
	]);
});

test('Event Hub List defaults to Limit 100, omits empty filters and returns no items when empty', async () => {
	const { context, calls } = createContext([{ resource: 'eventHub', operation: 'getAll', name: '' }], [{ body: [], headers: {} }]);
	assert.deepEqual(await new Bdp().execute.call(context), [[]]);
	assert.deepEqual(calls[0].qs, { take: 100, skip: 0 });
});

test('Event Hub Get uses selected or manual IDs', async () => {
	for (const mode of ['list', 'id']) {
		const eventHub = { id: 'eh/1', type: 'Telemetry', metadata: { a: null } };
		const { context, calls } = createContext(
			[{ resource: 'eventHub', operation: 'getById', eventHubId: { mode, value: 'eh/1' } }],
			[{ body: eventHub, headers: {} }],
		);
		assert.deepEqual(await new Bdp().execute.call(context), [[{ json: eventHub, pairedItem: { item: 0 } }]]);
		assert.deepEqual(paths(calls), ['/api/EventHubs/eh%2F1']);
	}
});

test('Event Hub operations only send GET requests and expose no PATCH operation', async () => {
	const { context, calls } = createContext(
		[
			{ resource: 'eventHub', operation: 'getAll' },
			{ resource: 'eventHub', operation: 'getById', eventHubId: { mode: 'id', value: 'eh-1' } },
		],
		[{ body: [], headers: {} }, { body: { id: 'eh-1' }, headers: {} }],
		[{ json: {} }, { json: {} }],
	);
	await new Bdp().execute.call(context);
	assert.equal(calls.length, 2);
	for (const call of calls) assert.equal(call.method, 'GET');
	assert.ok(calls.every(({ method }) => !['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)));
	assert.ok(calls.every(({ url }) => !/OnDemand/i.test(url)));

	const operationProperty = new Bdp().description.properties.find(
		(p) => p.name === 'operation' && p.displayOptions?.show?.resource?.includes('eventHub'),
	);
	assert.deepEqual(operationProperty.options.map(({ value }) => value), ['getAll', 'getById']);

	for (const operation of ['update', 'patch', 'post', 'delete']) {
		const { context: c, calls: rejected } = createContext([{ resource: 'eventHub', operation }], []);
		await assert.rejects(new Bdp().execute.call(c), /not supported/);
		assert.equal(rejected.length, 0);
	}
});

test('Event Hub operations reject missing IDs, invalid limits, malformed responses and safe API errors', async () => {
	for (const [parameters, message] of [
		[{ operation: 'getById' }, /Event Hub ID is required/],
		[{ operation: 'getById', eventHubId: { mode: 'id', value: ' ' } }, /Event Hub ID is required/],
		[{ operation: 'getAll', limit: 0 }, /positive whole number/],
	]) {
		const { context, calls } = createContext([{ resource: 'eventHub', ...parameters }], []);
		await assert.rejects(new Bdp().execute.call(context), message);
		assert.equal(calls.length, 0);
	}
	for (const [operation, body, message] of [
		['getAll', {}, /invalid list response/],
		['getById', [], /invalid event hub detail response/],
		['getById', null, /invalid event hub detail response/],
	]) {
		const { context } = createContext(
			[{ resource: 'eventHub', operation, eventHubId: { mode: 'id', value: 'eh-1' } }],
			[{ body, headers: {} }],
		);
		await assert.rejects(new Bdp().execute.call(context), message);
	}
	for (const [operation, status, message] of [['getAll', 403, /denied access/], ['getById', 404, /HTTP 404/]]) {
		const { context } = createContext(
			[{ resource: 'eventHub', operation, eventHubId: { mode: 'id', value: 'eh-1' } }],
			[errorWithStatus(status)],
		);
		await assert.rejects(new Bdp().execute.call(context), (error) => {
			assert.match(error.message, message);
			assert.doesNotMatch(error.message, /private response body/);
			return true;
		});
	}
});

test('Event Hub locator is searchable, pages by name and handles bad responses and errors', async () => {
	const locator = new Bdp().description.properties.find((p) => p.name === 'eventHubId');
	assert.equal(locator.modes[0].typeOptions.searchListMethod, 'getEventHubs');
	assert.equal(locator.modes[0].typeOptions.searchable, true);
	assert.equal(locator.modes[1].type, 'string');
	assert.equal(typeof new Bdp().methods.listSearch.getEventHubs, 'function');

	const { context, calls } = createContext([{}], [
		{ body: Array.from({ length: 50 }, (_, i) => ({ id: `eh-${i}`, name: i ? null : 'Ingest' })), headers: {} },
		{ body: [], headers: {} },
	]);
	const first = await getEventHubs.call(context, 'Inge');
	assert.deepEqual(first.results[0], { name: 'Ingest (eh-0)', value: 'eh-0' });
	assert.deepEqual(first.results[1], { name: 'Event Hub eh-1', value: 'eh-1' });
	assert.equal(first.paginationToken, '50');
	assert.deepEqual(await getEventHubs.call(context, 'Inge', first.paginationToken), { results: [], paginationToken: undefined });
	assert.deepEqual(calls.map(({ qs }) => qs), [
		{ take: 50, skip: 0, name: 'Inge' },
		{ take: 50, skip: 50, name: 'Inge' },
	]);
	assert.deepEqual(paths(calls), ['/api/EventHubs', '/api/EventHubs']);
	await assert.rejects(getEventHubs.call(createContext([{}], []).context, '', '-1'), /pagination token/);
	await assert.rejects(getEventHubs.call(createContext([{}], [{ body: {}, headers: {} }]).context), /invalid event hub search response/);
	await assert.rejects(getEventHubs.call(createContext([{}], [errorWithStatus(403)]).context), /denied access/);
});

test('Event Hub List and Get redact credential-like fields, keeping other fields native', async () => {
	const hub = {
		id: 'eh-1', name: 'Ingest', partitionCount: 4, enabled: true, metadata: null,
		connectionString: 'Endpoint=sb://private/;SharedAccessKey=abc', sharedAccessKey: 'abc', apiKey: null,
		settings: { endpoint: 'sb://host', password: 'p', nested: [{ clientSecret: 's', region: 'eu' }] },
	};
	const expected = {
		id: 'eh-1', name: 'Ingest', partitionCount: 4, enabled: true, metadata: null,
		connectionString: REDACTED, sharedAccessKey: REDACTED, apiKey: null,
		settings: { endpoint: 'sb://host', password: REDACTED, nested: [{ clientSecret: REDACTED, region: 'eu' }] },
	};
	const { context } = createContext(
		[{ resource: 'eventHub', operation: 'getAll' }, { resource: 'eventHub', operation: 'getById', eventHubId: { mode: 'id', value: 'eh-1' } }],
		[{ body: [hub], headers: {} }, { body: hub, headers: {} }],
		[{ json: {} }, { json: {} }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output.map(({ json }) => json), [expected, expected]);
	assert.doesNotMatch(JSON.stringify(output), /SharedAccessKey=abc|"abc"|"p"|"s"/);
	assert.equal(hub.connectionString.startsWith('Endpoint'), true, 'input record is not mutated');
});

test('redaction matches secret-like names only and handles non-object values', () => {
	assert.deepEqual(
		redactEventHub({
			name: 'n', keyName: 'k', monkey: 1, hubKey: 'x', key: 'a', secondaryKey: 'b', accessToken: 't',
			sasToken: 's', Credential: 'c', description: 'tokenized text stays', count: 0, flag: false, list: ['a', { primaryKey: 'z' }],
		}),
		{
			name: 'n', keyName: 'k', monkey: 1, hubKey: 'x', key: REDACTED, secondaryKey: REDACTED, accessToken: REDACTED,
			sasToken: REDACTED, Credential: REDACTED, description: 'tokenized text stays', count: 0, flag: false,
			list: ['a', { primaryKey: REDACTED }],
		},
	);
});
