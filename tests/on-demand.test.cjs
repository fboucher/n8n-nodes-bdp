const assert = require('node:assert/strict');
const test = require('node:test');
const { Bdp } = require('../dist/nodes/Bdp/Bdp.node.js');
const { createContext, errorWithStatus, paths } = require('./helpers.cjs');

const ref = (value, mode = 'id') => ({ mode, value });

const set = (point, value, extra = {}) => ({
	resource: 'deviceGroup',
	operation: 'setOnDemand',
	deviceGroupId: ref('g/1'),
	onDemandPointId: '',
	onDemandPointPath: '',
	onDemandValue: value,
	...point,
	...extra,
});
const get = (point, extra = {}) => ({
	resource: 'deviceGroup',
	operation: 'getOnDemand',
	deviceGroupId: ref('g/1'),
	onDemandPointId: '',
	onDemandPointPath: '',
	...point,
	...extra,
});
const byId = (id) => ({ onDemandPointId: id });
const byPath = (path) => ({ onDemandPointPath: path });
const items = (n) => Array.from({ length: n }, () => ({ json: {} }));
const ok200 = { body: undefined, statusCode: 200, headers: {} };

test('Set On Demand sends one input item per point addressed by id or path', async () => {
	const { context, calls } = createContext(
		[set(byId('nspg:a//Value'), '1'), set(byPath('/Server 1/Demo/Value'), 'on'), set(byId('p3'), 5)],
		[ok200],
		items(3),
	);
	const [output] = await new Bdp().execute.call(context);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].method, 'POST');
	assert.deepEqual(paths(calls), ['/api/DeviceGroups/g%2F1/SetOnDemand']);
	assert.equal(calls[0].headers['Content-Type'], 'application/json');
	assert.deepEqual(calls[0].body, [
		{ identity: { id: 'nspg:a//Value' }, value: '1' },
		{ identity: { path: '/Server 1/Demo/Value' }, value: 'on' },
		{ identity: { id: 'p3' }, value: '5' },
	]);
	assert.deepEqual(
		output.map(({ json, pairedItem }) => [json.status, json.statusCode, pairedItem.item]),
		[['success', 200, 0], ['success', 200, 1], ['success', 200, 2]],
	);
	assert.deepEqual(output[1].json.identity, { path: '/Server 1/Demo/Value' });
});

test('Set On Demand rejects items with both or neither of id and path, and bad values, before any request', async () => {
	for (const [parameters, message] of [
		[[set({ onDemandPointId: 'a', onDemandPointPath: '/p' }, '1')], /Input item 1: set either Point ID or Point Path, not both/],
		[[set(byId('a'), '1'), set({}, '1')], /Input item 2: a Point ID or a Point Path is required/],
		[[set(byId('  '), '1')], /required/],
		[[set(byId('a'), undefined)], /Input item 1: Value is required/],
		[[set(byId('a'), { x: 1 })], /Value is required/],
		[[set(byId('a'), NaN)], /Value is required/],
		[[set(byId('a'), '1'), set(byId('a'), '2')], /appears more than once/],
		[[set(byId('a'), '1', { deviceGroupId: ref('') })], /Device Group ID is required/],
	]) {
		const { context, calls } = createContext(parameters, [ok200], items(parameters.length));
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

test('Set On Demand converts numbers and booleans to text and keeps empty-looking text values', async () => {
	const { context, calls } = createContext(
		[set(byId('a'), 0), set(byId('b'), false), set(byId('c'), '')],
		[ok200],
		items(3),
	);
	await new Bdp().execute.call(context);
	assert.deepEqual(calls[0].body.map(({ value }) => value), ['0', 'false', '']);
});

test('Set On Demand rejects oversized inputs explicitly without sending anything', async () => {
	const parameters = Array.from({ length: 501 }, (_, n) => set(byId(`p${n}`), '1'));
	const { context, calls } = createContext(parameters, [ok200], items(501));
	await assert.rejects(new Bdp().execute.call(context), /limited to 500 points per run \(received 501\)/);
	assert.equal(calls.length, 0);
	const exact = Array.from({ length: 500 }, (_, n) => set(byId(`p${n}`), '1'));
	const { context: c2, calls: calls2 } = createContext(exact, [ok200], items(500));
	const [output] = await new Bdp().execute.call(c2);
	assert.equal(calls2.length, 1);
	assert.equal(output.length, 500);
});

test('Set On Demand surfaces 206 per-item failures without discarding successes or claiming full success', async () => {
	const body = [
		{
			identity: { path: '/B' },
			statusCode: 500,
			value: '',
			metadata: { ErrorCode: 'DeviceOffline', ErrorText: 'Device is offline' },
		},
	];
	const { context } = createContext(
		[set(byId('a'), '1'), set(byPath('/B'), '2')],
		[{ body, statusCode: 206, headers: {} }],
		items(2),
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output.map(({ json }) => json.status), ['success', 'failed']);
	assert.equal(output[0].json.statusCode, 206);
	assert.deepEqual(output[1].json, {
		identity: { path: '/B' },
		value: '2',
		status: 'failed',
		statusCode: 500,
		errorCode: 'DeviceOffline',
		error: 'BDP rejected the item (HTTP 500).',
	});
});

test('Set On Demand and Run On Demand are never retried', async () => {
	for (const status of [429, 500, 503, 504]) {
		const { context, calls } = createContext(
			[set(byId('a'), '1')],
			[errorWithStatus(status, { 'retry-after': '0' }), ok200],
		);
		await assert.rejects(new Bdp().execute.call(context), new RegExp(`HTTP ${status}`));
		assert.equal(calls.length, 1);
	}
	const { context, calls } = createContext(
		[run('Refresh', '{}')],
		[Object.assign(new Error('x'), { code: 'ECONNRESET' }), { body: { ok: true }, statusCode: 200, headers: {} }],
	);
	await assert.rejects(new Bdp().execute.call(context), /outcome may be unknown/);
	assert.equal(calls.length, 1);
	const { context: c2, calls: calls2 } = createContext([run('Refresh', '{}')], [errorWithStatus(503, { 'retry-after': '0' }), ok200]);
	await assert.rejects(new Bdp().execute.call(c2), /HTTP 503/);
	assert.equal(calls2.length, 1);
});

test('Set On Demand maps 400, 403, 404, 429 and 504 to safe messages without echoing the body', async () => {
	for (const status of [400, 403, 404, 429, 504]) {
		const { context } = createContext([set(byId('a'), 'secret-command-value')], [errorWithStatus(status)]);
		await assert.rejects(new Bdp().execute.call(context), (error) => {
			assert.match(error.message, new RegExp(`HTTP ${status}`));
			assert.doesNotMatch(error.message, /private response body|secret-command-value/);
			return true;
		});
	}
});

test('Set On Demand with continue on fail returns one linked error item', async () => {
	const { context } = createContext([set(byId('a'), '1'), set({}, '2')], [ok200], items(2), true);
	const [output] = await new Bdp().execute.call(context);
	assert.equal(output.length, 1);
	assert.match(output[0].json.error, /Input item 2/);
	assert.deepEqual(output[0].pairedItem, [{ item: 0 }, { item: 1 }]);
});

test('Get On Demand posts the point list and returns the live values as native items', async () => {
	const body = [
		{ identity: { id: 'a' }, statusCode: 200, value: '21.5', timeStamp: '2025-01-01T00:00:00Z', metadata: { ValueType: 'Float' } },
		{ identity: { path: '/B' }, statusCode: 200, value: 'on', timeStamp: '2025-01-01T00:00:01Z', metadata: {} },
	];
	const { context, calls } = createContext(
		[get(byId('a')), get(byPath('/B'))],
		[{ body, statusCode: 200, headers: {} }],
		items(2),
	);
	const [output] = await new Bdp().execute.call(context);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].method, 'POST');
	assert.deepEqual(paths(calls), ['/api/DeviceGroups/g%2F1/GetOnDemand']);
	assert.deepEqual(calls[0].body, [{ id: 'a' }, { path: '/B' }]);
	assert.deepEqual(output.map(({ json }) => ({ ...json, status: undefined })), body.map((entry) => ({ ...entry, status: undefined })));
	assert.deepEqual(output.map(({ json, pairedItem }) => [json.value, json.status, pairedItem.item]), [['21.5', 'success', 0], ['on', 'success', 1]]);
});

test('Get On Demand surfaces 206 per-item errors with status and error text and keeps successes', async () => {
	const body = [
		{ identity: { id: 'a' }, statusCode: 200, value: '1', timeStamp: '2025-01-01T00:00:00Z', metadata: {} },
		{
			identity: { id: 'b' },
			statusCode: 404,
			value: '',
			timeStamp: '2025-01-01T00:00:00Z',
			metadata: { ErrorCode: 'NotFound', ErrorText: 'Point not found' },
		},
	];
	const { context } = createContext([get(byId('a')), get(byId('b'))], [{ body, statusCode: 206, headers: {} }], items(2));
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output.map(({ json }) => json.status), ['success', 'failed']);
	assert.equal(output[1].json.error, 'Point not found');
	assert.equal(output[1].json.errorCode, 'NotFound');
	assert.equal(output[0].json.value, '1');
	assert.deepEqual(output.map(({ pairedItem }) => pairedItem.item), [0, 1]);
});

test('Get On Demand validates identity and size, and rejects an empty response', async () => {
	for (const [parameters, message] of [
		[[get({ onDemandPointId: 'a', onDemandPointPath: '/p' })], /not both/],
		[[get({})], /required/],
		[[get(byId('a')), get(byId('a'))], /more than once/],
		[Array.from({ length: 501 }, (_, n) => get(byId(`p${n}`))), /limited to 500/],
	]) {
		const { context, calls } = createContext(parameters, [ok200], items(parameters.length));
		await assert.rejects(new Bdp().execute.call(context), message);
		assert.equal(calls.length, 0);
	}
	const { context } = createContext([get(byId('a'))], [{ body: undefined, statusCode: 200, headers: {} }]);
	await assert.rejects(new Bdp().execute.call(context), /no live values/);
});

// ---------------------------------------------------------------- Source: Run On Demand

const run = (method, payload, extra = {}) => ({
	resource: 'source',
	operation: 'runOnDemand',
	sourceId: ref('src/1'),
	onDemandMethod: method,
	onDemandPayload: payload,
	...extra,
});

test('Run On Demand URL-encodes the method, sends the JSON payload and returns the native response', async () => {
	const response = { result: 'done', count: 3 };
	const { context, calls } = createContext(
		[run('Refresh Values/now', JSON.stringify({ points: ['a'], force: true }))],
		[{ body: response, statusCode: 200, headers: {} }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output, [{ json: response, pairedItem: { item: 0 } }]);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].method, 'POST');
	assert.deepEqual(paths(calls), ['/api/Sources/src%2F1/OnDemand/Refresh%20Values%2Fnow']);
	assert.equal(calls[0].headers['Content-Type'], 'application/json');
	assert.deepEqual(calls[0].body, { points: ['a'], force: true });
});

test('Run On Demand accepts object payloads, defaults to an empty object and reports empty responses', async () => {
	let { context, calls } = createContext([run('M', { a: 1 })], [{ body: undefined, statusCode: 200, headers: {} }]);
	let [output] = await new Bdp().execute.call(context);
	assert.deepEqual(calls[0].body, { a: 1 });
	assert.deepEqual(output[0].json, { status: 'success', statusCode: 200 });

	({ context, calls } = createContext([run('M', '')], [{ body: undefined, statusCode: 204, headers: {} }]));
	await new Bdp().execute.call(context);
	assert.deepEqual(calls[0].body, {});

	({ context } = createContext([run('M', '[1,2]')], [{ body: [1, 2], statusCode: 200, headers: {} }]));
	[output] = await new Bdp().execute.call(context);
	assert.deepEqual(output[0].json, { response: [1, 2] });
});

test('Run On Demand rejects bad methods, invalid payload JSON and missing sources before any request', async () => {
	for (const [parameters, message] of [
		[run('', '{}'), /method name is required/],
		[run('  ', '{}'), /method name is required/],
		[run('..', '{}'), /method name is required/],
		[run('bad\nname', '{}'), /method name is required/],
		[run('M', '{bad'), /Payload must be valid JSON/],
		[run('M', '{}', { sourceId: ref('') }), /Source ID is required/],
	]) {
		const { context, calls } = createContext([parameters], [ok200]);
		await assert.rejects(new Bdp().execute.call(context), message);
		assert.equal(calls.length, 0);
	}
});

test('Run On Demand maps 400, 403, 404, 429 and 504 to safe messages and never echoes the payload', async () => {
	for (const status of [400, 403, 404, 429, 504]) {
		const { context } = createContext([run('M', '{"password":"hunter2"}')], [errorWithStatus(status)]);
		await assert.rejects(new Bdp().execute.call(context), (error) => {
			assert.match(error.message, new RegExp(`HTTP ${status}`));
			assert.doesNotMatch(error.message, /private response body|hunter2/);
			return true;
		});
	}
});

test('on-demand warnings are shown and the docs-facing descriptions say the payload is not validated', () => {
	const properties = new Bdp().description.properties;
	const warn = (name) => properties.find((p) => p.name === name);
	assert.match(warn('onDemandWarning').displayName, /physical effects/);
	assert.match(warn('runOnDemandWarning').displayName, /not validated/);
	assert.match(properties.find((p) => p.name === 'onDemandPayload').description, /without validation/);
});

test('Source and Device Group read operations stay GET-only', async () => {
	for (const [parameters, response] of [
		[{ resource: 'source', operation: 'getAll' }, { body: [], headers: {} }],
		[{ resource: 'source', operation: 'getById', sourceId: ref('s-1') }, { body: { id: 's-1' }, headers: {} }],
		[{ resource: 'deviceGroup', operation: 'getAll', buildingId: ref('b-1') }, { body: [], headers: {} }],
		[{ resource: 'deviceGroup', operation: 'getById', deviceGroupId: ref('g-1') }, { body: { id: 'g-1' }, headers: {} }],
	]) {
		const { context, calls } = createContext([parameters], [response]);
		await new Bdp().execute.call(context);
		for (const call of calls) assert.equal(call.method, 'GET');
	}
});
