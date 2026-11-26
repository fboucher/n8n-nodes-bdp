const assert = require('node:assert/strict');
const test = require('node:test');
const { Bdp } = require('../dist/nodes/Bdp/Bdp.node.js');
const { REDACTED } = require('../dist/nodes/Bdp/resources/eventHub/redact.js');
const { createContext, errorWithStatus, paths } = require('./helpers.cjs');

const ref = (value, mode = 'id') => ({ mode, value });
const U1 = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const U2 = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
const allMembers = (extra = {}) => ({ buildings: [], floors: [], spaces: [], devices: [], measurementValues: [], ...extra });

// ---------------------------------------------------------------- Data Set

const create = (extra = {}) => ({
	resource: 'dataSet',
	operation: 'create',
	dataSetName: 'Energy',
	dataSetExpiresOn: '2026-12-31T02:00:00+02:00',
	dataSetMembers: { buildings: [U1] },
	...extra,
});

test('Data Set Create posts name, normalized expiry and complete members, and returns the native record', async () => {
	const created = { id: 'ds-1', name: 'Energy', expiresOn: '2026-12-31T00:00:00Z', members: allMembers({ buildings: [U1] }) };
	const { context, calls } = createContext([create()], [{ body: created, statusCode: 200, headers: {} }]);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output, [{ json: created, pairedItem: { item: 0 } }]);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].method, 'POST');
	assert.deepEqual(paths(calls), ['/api/DataSets']);
	assert.equal(calls[0].headers['Content-Type'], 'application/json');
	assert.deepEqual(calls[0].body, {
		name: 'Energy',
		expiresOn: '2026-12-31T00:00:00.000Z',
		members: allMembers({ buildings: [U1] }),
	});
});

test('Data Set Create accepts members as JSON text', async () => {
	const { context, calls } = createContext(
		[create({ dataSetMembers: JSON.stringify({ devices: [U2] }) })],
		[{ body: { id: 'ds-1' }, statusCode: 200, headers: {} }],
	);
	await new Bdp().execute.call(context);
	assert.deepEqual(calls[0].body.members, allMembers({ devices: [U2] }));
});

test('Data Set Create still reports success when BDP returns no record', async () => {
	const { context } = createContext([create()], [{ body: undefined, statusCode: 200, headers: {} }]);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output[0].json, { name: 'Energy', status: 'created', statusCode: 200 });
});

test('Data Set Create validates name, expiry and members before any request', async () => {
	for (const [extra, message] of [
		[{ dataSetName: '  ' }, /Name must be a non-empty/],
		[{ dataSetName: 5 }, /Name must be a non-empty/],
		[{ dataSetExpiresOn: '2026-12-31' }, /explicit UTC offset/],
		[{ dataSetExpiresOn: '2026-12-31T00:00:00' }, /explicit UTC offset/],
		[{ dataSetExpiresOn: '2026-02-30T00:00:00Z' }, /not a valid ISO 8601/],
		[{ dataSetExpiresOn: '' }, /explicit UTC offset/],
		[{ dataSetMembers: '{bad json' }, /valid JSON/],
		[{ dataSetMembers: [U1] }, /JSON object/],
		[{ dataSetMembers: { rooms: [] } }, /unsupported category "rooms"/],
		[{ dataSetMembers: { buildings: 'x' } }, /Buildings must be a list/],
		[{ dataSetMembers: { buildings: ['nope'] } }, /Buildings entry 1 must be a valid UUID/],
		[{ dataSetMembers: { devices: [U1, 7] } }, /Devices entry 2 must be a valid UUID/],
	]) {
		const { context, calls } = createContext([create(extra)], []);
		let credentialLookups = 0;
		context.getCredentials = async () => {
			credentialLookups++;
			return { environment: 'uat' };
		};
		await assert.rejects(new Bdp().execute.call(context), message);
		assert.equal(calls.length, 0);
		assert.equal(credentialLookups, 0);
	}
});

test('Data Set Create is never retried, even on transient failures', async () => {
	for (const error of [errorWithStatus(503, { 'retry-after': '0' }), errorWithStatus(429, { 'retry-after': '0' }), Object.assign(new Error('x'), { code: 'ECONNRESET' })]) {
		const { context, calls } = createContext([create()], [error, { body: { id: 'dup' }, statusCode: 200, headers: {} }]);
		await assert.rejects(new Bdp().execute.call(context));
		assert.equal(calls.length, 1);
	}
});

const update = (fields, extra = {}) => ({
	resource: 'dataSet',
	operation: 'update',
	dataSetId: ref('ds/1'),
	dataSetUpdateFields: fields,
	...extra,
});

test('Data Set Update builds one replace operation per changed field', async () => {
	const updated = { id: 'ds/1', name: 'New' };
	const { context, calls } = createContext(
		[update({ name: 'New', expiresOn: '2027-01-01T00:00:00Z', members: { floors: [U1] } })],
		[{ body: updated, statusCode: 200, headers: {} }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output, [{ json: updated, pairedItem: { item: 0 } }]);
	assert.equal(calls[0].method, 'PATCH');
	assert.deepEqual(paths(calls), ['/api/DataSets/ds%2F1']);
	assert.equal(calls[0].headers['Content-Type'], 'application/json-patch+json');
	assert.deepEqual(calls[0].body, [
		{ op: 'replace', path: '/name', value: 'New' },
		{ op: 'replace', path: '/expiresOn', value: '2027-01-01T00:00:00.000Z' },
		{ op: 'replace', path: '/members', value: allMembers({ floors: [U1] }) },
	]);
});

test('Data Set Update sends only the fields that changed, and replaces members as a whole', async () => {
	let { context, calls } = createContext([update({ name: 'Only' })], [{ body: { id: 'x' }, statusCode: 200, headers: {} }]);
	await new Bdp().execute.call(context);
	assert.deepEqual(calls[0].body, [{ op: 'replace', path: '/name', value: 'Only' }]);

	({ context, calls } = createContext([update({ members: { spaces: [U2] } })], [{ body: { id: 'x' }, statusCode: 200, headers: {} }]));
	await new Bdp().execute.call(context);
	assert.deepEqual(calls[0].body, [{ op: 'replace', path: '/members', value: allMembers({ spaces: [U2] }) }]);
	assert.ok(calls[0].body.every(({ path }) => !path.startsWith('/members/')));
});

test('Data Set Update rejects no changes, bad values and missing IDs before any request', async () => {
	for (const [parameters, message] of [
		[update({}), /Nothing to update/],
		[update({ unknown: 'x' }), /Nothing to update/],
		[update({ name: '' }), /Name must be a non-empty/],
		[update({ expiresOn: 'tomorrow' }), /explicit UTC offset/],
		[update({ members: { buildings: ['x'] } }), /valid UUID/],
		[update({ name: 'x' }, { dataSetId: ref('  ') }), /Dataset ID is required/],
	]) {
		const { context, calls } = createContext([parameters], []);
		await assert.rejects(new Bdp().execute.call(context), message);
		assert.equal(calls.length, 0);
	}
});

test('Data Set Update properties describe whole-member replacement and offer no partial member edits', () => {
	const property = new Bdp().description.properties.find((p) => p.name === 'dataSetUpdateFields');
	const members = property.options.find((o) => o.name === 'members');
	assert.match(members.displayName, /Replaces All Members/);
	assert.match(members.description, /REPLACES all current members/);
	assert.deepEqual(property.options.map(({ name }) => name).sort(), ['expiresOn', 'members', 'name']);
});

test('Data Set Delete targets only the selected or entered ID and confirms the deletion', async () => {
	for (const mode of ['list', 'id']) {
		const { context, calls } = createContext(
			[{ resource: 'dataSet', operation: 'delete', dataSetId: ref('ds/1', mode) }],
			[{ body: undefined, statusCode: 200, headers: {} }],
		);
		const [output] = await new Bdp().execute.call(context);
		assert.deepEqual(output, [{ json: { id: 'ds/1', status: 'deleted', statusCode: 200 }, pairedItem: { item: 0 } }]);
		assert.equal(calls.length, 1);
		assert.equal(calls[0].method, 'DELETE');
		assert.deepEqual(paths(calls), ['/api/DataSets/ds%2F1']);
		assert.equal(calls[0].body, undefined);
		assert.equal(calls[0].headers['Content-Type'], undefined);
	}
	const { context, calls } = createContext([{ resource: 'dataSet', operation: 'delete', dataSetId: ref('') }], []);
	await assert.rejects(new Bdp().execute.call(context), /Dataset ID is required/);
	assert.equal(calls.length, 0);
});

test('Data Set Delete is not retried and its notice says deletion cannot be undone', async () => {
	const { context, calls } = createContext(
		[{ resource: 'dataSet', operation: 'delete', dataSetId: ref('ds-1') }],
		[errorWithStatus(503, { 'retry-after': '0' }), { body: undefined, statusCode: 200, headers: {} }],
	);
	await assert.rejects(new Bdp().execute.call(context), /HTTP 503/);
	assert.equal(calls.length, 1);
	const notice = new Bdp().description.properties.find((p) => p.name === 'dataSetDeleteNotice');
	assert.match(notice.displayName, /cannot be undone/);
});

test('Data Set writes map 400, 404, 413 and 424 to safe messages without echoing bodies', async () => {
	const cases = [
		[update({ name: 'secret-name-value' }), [400, 404, 413, 424]],
		[create({ dataSetName: 'secret-name-value' }), [400, 413, 424]],
		[{ resource: 'dataSet', operation: 'delete', dataSetId: ref('ds-1') }, [404]],
	];
	for (const [parameters, statuses] of cases) {
		for (const status of statuses) {
			const { context, calls } = createContext([parameters], [errorWithStatus(status)]);
			await assert.rejects(new Bdp().execute.call(context), (error) => {
				assert.match(error.message, new RegExp(`HTTP ${status}`));
				assert.doesNotMatch(error.message, /private response body|secret-name-value/);
				return true;
			});
			assert.equal(calls.length, 1);
		}
	}
});

test('Data Set List and Get remain GET-only next to the writes', async () => {
	for (const parameters of [
		{ resource: 'dataSet', operation: 'getAll' },
		{ resource: 'dataSet', operation: 'getById', dataSetId: ref('ds-1') },
	]) {
		const { context, calls } = createContext([parameters], [{ body: parameters.operation === 'getAll' ? [] : { id: 'ds-1' }, headers: {} }]);
		await new Bdp().execute.call(context);
		for (const call of calls) assert.equal(call.method, 'GET');
	}
});

// ---------------------------------------------------------------- Event Hub

const hub = (fields, extra = {}) => ({
	resource: 'eventHub',
	operation: 'update',
	eventHubId: ref('eh/1'),
	eventHubUpdateFields: fields,
	...extra,
});

test('Event Hub Update builds one replace per supported property and redacts the response', async () => {
	const response = { id: 'eh/1', name: 'Ingest', partitionCount: 4, connectionString: 'Endpoint=secret', consumerGroups: ['a'] };
	const { context, calls } = createContext(
		[hub({ partitionCount: 4, retentionPolicy: '7d', consumerGroups: 'a, b ,, c', telemetryPayloadFormat: 'json' })],
		[{ body: response, statusCode: 200, headers: {} }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output[0].json, { ...response, connectionString: REDACTED });
	assert.equal(calls[0].method, 'PATCH');
	assert.deepEqual(paths(calls), ['/api/EventHubs/eh%2F1']);
	assert.equal(calls[0].headers['Content-Type'], 'application/json-patch+json');
	assert.deepEqual(calls[0].body, [
		{ op: 'replace', path: '/partitionCount', value: 4 },
		{ op: 'replace', path: '/retentionPolicy', value: '7d' },
		{ op: 'replace', path: '/consumerGroups', value: ['a', 'b', 'c'] },
		{ op: 'replace', path: '/telemetryPayloadFormat', value: 'json' },
	]);
});

test('Event Hub Update sends each property on its own and accepts a consumer group array', async () => {
	for (const [fields, expected] of [
		[{ partitionCount: 2 }, [{ op: 'replace', path: '/partitionCount', value: 2 }]],
		[{ retentionPolicy: 'x' }, [{ op: 'replace', path: '/retentionPolicy', value: 'x' }]],
		[{ consumerGroups: ['g1', 'g2'] }, [{ op: 'replace', path: '/consumerGroups', value: ['g1', 'g2'] }]],
		[{ telemetryPayloadFormat: 'avro' }, [{ op: 'replace', path: '/telemetryPayloadFormat', value: 'avro' }]],
	]) {
		const { context, calls } = createContext([hub(fields)], [{ body: { id: 'eh/1' }, statusCode: 200, headers: {} }]);
		await new Bdp().execute.call(context);
		assert.deepEqual(calls[0].body, expected);
	}
});

test('Event Hub Update without a response body reports the update and the secrets rule still applies', async () => {
	const { context } = createContext([hub({ partitionCount: 2 })], [{ body: undefined, statusCode: 204, headers: {} }]);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output[0].json, { id: 'eh/1', status: 'updated', statusCode: 204 });
});

test('Event Hub Update validates types and rejects empty updates before any request', async () => {
	for (const [parameters, message] of [
		[hub({}), /Nothing to update/],
		[hub({ partitionCount: 2.5 }), /whole number/],
		[hub({ partitionCount: '4' }), /whole number/],
		[hub({ retentionPolicy: ' ' }), /Retention Policy must be a non-empty/],
		[hub({ telemetryPayloadFormat: 5 }), /non-empty text/],
		[hub({ consumerGroups: ' , ' }), /Consumer Groups/],
		[hub({ consumerGroups: ['a', 1] }), /list of non-empty text/],
		[hub({ consumerGroups: { a: 1 } }), /list of non-empty text/],
		[hub({ partitionCount: 2 }, { eventHubId: ref('') }), /Event Hub ID is required/],
	]) {
		const { context, calls } = createContext([parameters], []);
		await assert.rejects(new Bdp().execute.call(context), message);
		assert.equal(calls.length, 0);
	}
});

test('Event Hub Update rejections (e.g. partition reduction) are safe and do not echo the body', async () => {
	for (const status of [400, 403, 404, 424]) {
		const { context, calls } = createContext([hub({ partitionCount: 1, retentionPolicy: 'secret-policy' })], [errorWithStatus(status)]);
		await assert.rejects(new Bdp().execute.call(context), (error) => {
			assert.match(error.message, new RegExp(`HTTP ${status}`));
			assert.doesNotMatch(error.message, /private response body|secret-policy/);
			return true;
		});
		assert.equal(calls.length, 1);
	}
});

test('Event Hub Update warns about downstream consumers; List and Get remain GET-only', async () => {
	const notice = new Bdp().description.properties.find((p) => p.name === 'eventHubUpdateNotice');
	assert.match(notice.displayName, /downstream consumer/);
	for (const parameters of [
		{ resource: 'eventHub', operation: 'getAll' },
		{ resource: 'eventHub', operation: 'getById', eventHubId: ref('eh-1') },
	]) {
		const { context, calls } = createContext([parameters], [{ body: parameters.operation === 'getAll' ? [] : { id: 'eh-1' }, headers: {} }]);
		await new Bdp().execute.call(context);
		for (const call of calls) assert.equal(call.method, 'GET');
	}
});
