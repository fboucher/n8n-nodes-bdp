const assert = require('node:assert/strict');
const test = require('node:test');
const { Bdp } = require('../dist/nodes/Bdp/Bdp.node.js');
const { getMeasurementValues } = require('../dist/nodes/Bdp/resources/measurementPoint/listSearch.js');
const { createContext, errorWithStatus, paths } = require('./helpers.cjs');

const ref = (value, mode = 'id') => ({ mode, value });
const M1 = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const M2 = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
const M3 = '3f2504e0-4f89-41d3-9a0c-0305e82c3303';
const single = (extra = {}) => ({
	resource: 'measurementValue',
	operation: 'update',
	updateMode: 'single',
	measurementId: ref(M1),
	pointValue: 21.5,
	...extra,
});
const batchItem = (measurementId, value, extra = {}) => ({
	resource: 'measurementValue',
	operation: 'update',
	updateMode: 'batch',
	deviceGroupId: ref('g/1'),
	batchMeasurementId: measurementId,
	batchValue: value,
	...extra,
});
const ok = { body: undefined, statusCode: 204, headers: {} };

test('Single update sends exactly one replace on /value and returns a success item', async () => {
	for (const mode of ['list', 'id']) {
		const { context, calls } = createContext([single({ measurementId: ref('m/1', mode) })], [ok]);
		const [output] = await new Bdp().execute.call(context);
		assert.deepEqual(output, [
			{ json: { measurementId: 'm/1', value: 21.5, status: 'success', statusCode: 204 }, pairedItem: { item: 0 } },
		]);
		assert.equal(calls.length, 1);
		assert.equal(calls[0].method, 'PATCH');
		assert.deepEqual(paths(calls), ['/api/MeasurementValues/m%2F1']);
		assert.equal(calls[0].headers['Content-Type'], 'application/json-patch+json');
		assert.deepEqual(calls[0].body, [{ op: 'replace', path: '/value', value: 21.5 }]);
	}
});

test('Single update accepts zero and negative numbers and runs once per input item', async () => {
	const { context, calls } = createContext(
		[single({ pointValue: 0 }), single({ pointValue: -3, measurementId: ref('m-2') })],
		[ok, ok],
		[{ json: {} }, { json: {} }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output.map(({ json, pairedItem }) => [json.value, pairedItem.item]), [[0, 0], [-3, 1]]);
	assert.deepEqual(calls.map(({ body }) => body[0].value), [0, -3]);
});

test('Single update validates before any request', async () => {
	for (const [parameters, message] of [
		[single({ pointValue: '21' }), /finite number/],
		[single({ pointValue: NaN }), /finite number/],
		[single({ pointValue: Infinity }), /finite number/],
		[single({ pointValue: null }), /finite number|value is required/],
		[single({ measurementId: ref('  ') }), /Measurement point ID is required/],
	]) {
		const { context, calls } = createContext([parameters], [ok]);
		await assert.rejects(new Bdp().execute.call(context), message);
		assert.equal(calls.length, 0);
	}
});

test('Single update errors are safe and actionable and never echo the request body', async () => {
	for (const status of [400, 403, 404, 429, 504]) {
		const { context, calls } = createContext([single()], [errorWithStatus(status)]);
		await assert.rejects(new Bdp().execute.call(context), (error) => {
			assert.match(error.message, new RegExp(`HTTP ${status}`));
			assert.doesNotMatch(error.message, /private response body|21\.5/);
			return true;
		});
		assert.equal(calls.length, 1, 'writes are not retried');
	}
});

test('Batch update maps input items to one patches document per device group', async () => {
	const { context, calls } = createContext(
		[batchItem(M1, 1), batchItem(M2, 2.5), batchItem(M3, 0)],
		[{ body: '', statusCode: 200, headers: {} }],
		[{ json: {} }, { json: {} }, { json: {} }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].method, 'PATCH');
	assert.deepEqual(paths(calls), ['/api/DeviceGroups/g%2F1/MeasurementValues']);
	assert.equal(calls[0].headers['Content-Type'], 'application/json-patch+json');
	assert.deepEqual(calls[0].body, {
		patches: [M1, M2, M3].map((measurementId, i) => ({
			measurementId,
			patch: [{ op: 'replace', path: '/value', value: [1, 2.5, 0][i] }],
		})),
	});
	assert.deepEqual(
		output.map(({ json, pairedItem }) => [json.measurementId, json.status, json.statusCode, pairedItem.item]),
		[[M1, 'success', 200, 0], [M2, 'success', 200, 1], [M3, 'success', 200, 2]],
	);
});

test('Batch update accepts a 204 response', async () => {
	const { context } = createContext([batchItem(M1, 1)], [ok]);
	const [output] = await new Bdp().execute.call(context);
	assert.equal(output[0].json.status, 'success');
	assert.equal(output[0].json.statusCode, 204);
});

test('Batch update surfaces 206 per-item errors without discarding successes or claiming full success', async () => {
	const body = [
		{
			identity: { id: M2.toUpperCase() },
			statusCode: 400,
			metadata: { ErrorCode: 'NotWriteable', ErrorText: 'Point is not writeable' },
		},
	];
	const { context } = createContext(
		[batchItem(M1, 1), batchItem(M2, 2), batchItem(M3, 3)],
		[{ body, statusCode: 206, headers: {} }],
		[{ json: {} }, { json: {} }, { json: {} }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output.map(({ json }) => json.status), ['success', 'failed', 'success']);
	assert.deepEqual(output[1].json, {
		measurementId: M2,
		value: 2,
		status: 'failed',
		statusCode: 400,
		errorCode: 'NotWriteable',
		error: 'BDP rejected the item (HTTP 400).',
	});
	assert.equal(output[0].json.statusCode, 206);
});

test('Batch update marks points unconfirmed when a 206 carries no usable details', async () => {
	const { context } = createContext(
		[batchItem(M1, 1), batchItem(M2, 2)],
		[{ body: undefined, statusCode: 206, headers: {} }],
		[{ json: {} }, { json: {} }],
	);
	const [output] = await new Bdp().execute.call(context);
	assert.deepEqual(output.map(({ json }) => json.status), ['unconfirmed', 'unconfirmed']);
});

test('Batch update validates every ID and value before any request', async () => {
	for (const [items, message] of [
		[[batchItem(M1, 1), batchItem('not-a-uuid', 2)], /Input item 2: Measurement ID must be a valid UUID/],
		[[batchItem(M1, 1), batchItem(M2, '2')], /Input item 2: Value must be a finite number/],
		[[batchItem(M1, NaN)], /Input item 1: Value must be a finite number/],
		[[batchItem(M1, Infinity)], /finite number/],
		[[batchItem(M1, undefined)], /value is required|finite number/],
		[[batchItem(M1, 1), batchItem(M1.toUpperCase(), 2)], /appears more than once/],
		[[batchItem(M1, 1), batchItem(M2, 2, { deviceGroupId: ref('g-2') })], /same Device Group/],
		[[batchItem(M1, 1, { deviceGroupId: ref('') })], /Device Group ID is required/],
	]) {
		const { context, calls } = createContext(items, [ok], items.map(() => ({ json: {} })));
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

test('Batch update with continue on fail returns one error item', async () => {
	const items = [batchItem(M1, 1), batchItem('bad', 2)];
	const { context, calls } = createContext(items, [ok], items.map(() => ({ json: {} })), true);
	const [output] = await new Bdp().execute.call(context);
	assert.equal(output.length, 1);
	assert.match(output[0].json.error, /valid UUID/);
	assert.deepEqual(output[0].pairedItem, [{ item: 0 }, { item: 1 }]);
	assert.equal(calls.length, 0);
});

test('Batch update splits large inputs into sequential chunks and never truncates', async () => {
	const count = 1203;
	const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
	const items = Array.from({ length: count }, (_, n) => batchItem(id(n), n));
	const { context, calls } = createContext(items, [ok, ok, ok], items.map(() => ({ json: {} })));
	const [output] = await new Bdp().execute.call(context);
	assert.equal(calls.length, 3);
	assert.deepEqual(calls.map(({ body }) => body.patches.length), [500, 500, 203]);
	assert.equal(output.length, count);
	assert.equal(new Set(calls.flatMap(({ body }) => body.patches.map((p) => p.measurementId))).size, count);
	assert.deepEqual(output.map(({ pairedItem }) => pairedItem.item), items.map((_, n) => n));
});

test('Batch update reports how many points were already sent when a later chunk fails', async () => {
	const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
	const items = Array.from({ length: 501 }, (_, n) => batchItem(id(n), n));
	const { context, calls } = createContext(items, [ok, errorWithStatus(400)], items.map(() => ({ json: {} })));
	await assert.rejects(new Bdp().execute.call(context), /Request 2 of 2 failed after the first 500 points were already sent/);
	assert.equal(calls.length, 2);
});

test('Batch update errors are safe and the batch is not retried', async () => {
	for (const status of [400, 403, 404, 413, 429, 504]) {
		const { context, calls } = createContext([batchItem(M1, 99.25)], [errorWithStatus(status)]);
		await assert.rejects(new Bdp().execute.call(context), (error) => {
			assert.match(error.message, new RegExp(`HTTP ${status}`));
			assert.doesNotMatch(error.message, /private response body|99\.25|measurementId/);
			return true;
		});
		assert.equal(calls.length, 1);
	}
});

test('Update is the only Measurement Point operation that sends PATCH; List, Get and History stay GET-only', async () => {
	const readCases = [
		[{ resource: 'measurementValue', operation: 'getAll', buildingId: ref('b-1') }, { body: [], headers: {} }],
		[{ resource: 'measurementValue', operation: 'getById', measurementId: ref('m-1') }, { body: { id: 'm-1' }, headers: {} }],
		[
			{ resource: 'measurementValue', operation: 'getHistorical', measurementId: ref('m-1'), start: '2025-01-01T00:00:00Z', end: '2025-01-02T00:00:00Z' },
			{ body: [], headers: {} },
		],
	];
	for (const [parameters, response] of readCases) {
		const { context, calls } = createContext([parameters], [response]);
		await new Bdp().execute.call(context);
		assert.ok(calls.length > 0);
		for (const call of calls) assert.equal(call.method, 'GET');
	}
	const operations = new Bdp().description.properties.find(
		(p) => p.name === 'operation' && p.displayOptions?.show?.resource?.includes('measurementValue'),
	);
	assert.deepEqual(operations.options.map(({ value }) => value), ['getAll', 'getById', 'getHistorical', 'update']);
	for (const operation of ['delete', 'patch', 'create', 'post']) {
		const { context, calls } = createContext([{ resource: 'measurementValue', operation }], []);
		await assert.rejects(new Bdp().execute.call(context), /not supported/);
		assert.equal(calls.length, 0);
	}
});

test('Update properties are shown only for Update and keep the write warning', () => {
	const properties = new Bdp().description.properties;
	const forUpdate = properties.filter((p) => p.displayOptions?.show?.operation?.includes('update') && p.displayOptions.show.resource?.includes('measurementValue'));
	assert.ok(forUpdate.some((p) => p.name === 'updateWarning' && /physical equipment/.test(p.displayName)));
	assert.ok(forUpdate.some((p) => p.name === 'updateMode'));
	assert.ok(forUpdate.some((p) => p.name === 'writeableOnly'));
	// The existing Get/Historical selector is untouched.
	const getLocator = properties.find((p) => p.name === 'measurementId' && p.displayOptions?.show?.operation?.includes('getById'));
	assert.deepEqual(getLocator.displayOptions.show.operation, ['getById', 'getHistorical']);
});

test('the Measurement Point selector can restrict to writeable points for Update only', async () => {
	const search = async (parameters) => {
		const { context, calls } = createContext([parameters], [{ body: [{ id: 'm-1', name: 'T' }], headers: {} }]);
		await getMeasurementValues.call(context);
		return calls[0].qs;
	};
	const base = { measurementScope: 'floor', floorId: ref('f-1') };
	assert.deepEqual(await search({ ...base, operation: 'update', writeableOnly: true }), { take: 50, skip: 0, isWriteable: true });
	assert.deepEqual(await search({ ...base, operation: 'update', writeableOnly: false }), { take: 50, skip: 0 });
	assert.deepEqual(await search({ ...base, operation: 'getById', writeableOnly: true }), { take: 50, skip: 0 });
});

test('unresolved parent expressions never search an unrelated parent', async () => {
	const { context, calls } = createContext(
		[{ operation: 'update', writeableOnly: true, measurementScope: 'floor', floorId: ref('={{ $json.floor }}') }],
		[{ body: [], headers: {} }],
	);
	await assert.rejects(getMeasurementValues.call(context), /resolved Floor ID|resolved floor ID/i);
	const { context: missing, calls: none } = createContext(
		[{ operation: 'update', writeableOnly: true, measurementScope: 'floor', floorId: ref('') }],
		[{ body: [], headers: {} }],
	);
	await assert.rejects(getMeasurementValues.call(missing), /resolved floor ID/i);
	assert.equal(calls.length + none.length, 0);
});
